import { randomBytes } from "node:crypto";
import { db, serial } from "./db";
import { env } from "./env";
import {
  keyHash,
  encrypt,
  decrypt,
  ApiError,
  readyRedis,
  redis,
} from "./security";
import { upstream } from "./upstream";
export async function provisionOrder(orderId: string) {
  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: true },
  });
  if (order.status !== "PAID") return;
  if (!env.SUB2API_LICENSE_USER_ID)
    throw new ApiError(503, "sub2api_license_user_missing");
  const item = order.items[0];
  if (order.renewalLicenseId) {
    await readyRedis();
    const lockKey = "renewal-lock:" + order.renewalLicenseId,
      lockToken = randomBytes(24).toString("hex");
    if ((await redis.set(lockKey, lockToken, "EX", 60, "NX")) !== "OK")
      throw new ApiError(503, "renewal_in_progress");
    try {
      const live = await db.license.findUniqueOrThrow({
        where: { id: order.renewalLicenseId },
      });
      if (live.status !== "ACTIVE")
        throw new ApiError(409, "renewal_license_inactive");
      const completed = await db.setting.findUnique({
        where: { key: "renewal-done:" + orderId },
      });
      if (completed) return;
      // An interrupted earlier renewal must finish before another target is calculated.
      const prepared = await db.setting.findMany({
        where: {
          key: { startsWith: "renewal:" },
          value: { path: ["licenseId"], equals: live.id },
        },
      });
      for (const pending of prepared) {
        const pendingId = pending.key.slice("renewal:".length);
        if (
          pendingId !== orderId &&
          !(await db.setting.findUnique({
            where: { key: "renewal-done:" + pendingId },
          }))
        )
          throw new ApiError(503, "previous_renewal_pending");
      }
      // Persist the absolute target once so retries never extend twice.
      const renewal = await serial(async (tx) => {
        const setting = await tx.setting.findUnique({
          where: { key: "renewal:" + orderId },
        });
        if (setting)
          return setting.value as {
            expiresAt: string;
            keyId: number;
            licenseId: string;
          };
        const license = await tx.license.findUniqueOrThrow({
          where: { id: order.renewalLicenseId! },
        });
        if (license.status !== "ACTIVE" || !license.upstreamKeyId)
          throw new ApiError(409, "renewal_license_inactive");
        const value = {
          expiresAt: new Date(
            Math.max(Date.now(), license.expiresAt?.getTime() ?? 0) +
              item.durationDays * 86400000,
          ).toISOString(),
          keyId: license.upstreamKeyId,
          licenseId: license.id,
        };
        await tx.setting.create({ data: { key: "renewal:" + orderId, value } });
        return value;
      });
      const targetExpiry = new Date(
        Math.max(Date.parse(renewal.expiresAt), live.expiresAt?.getTime() ?? 0),
      ).toISOString();
      await upstream("/api/v1/admin/ch-relay/licenses/" + renewal.keyId, {
        method: "PUT",
        body: { expires_at: targetExpiry, status: "active" },
      });
      await serial(async (tx) => {
        const paid = await tx.order.findUniqueOrThrow({
          where: { id: orderId },
        });
        const current = await tx.license.findUniqueOrThrow({
          where: { id: renewal.licenseId },
        });
        if (paid.status !== "PAID" || current.status !== "ACTIVE") {
          await tx.license.update({
            where: { id: current.id },
            data: { status: "REVOKED" },
          });
          await enqueueRevoke(tx, current.id);
          return;
        }
        await tx.license.update({
          where: { id: renewal.licenseId },
          data: {
            expiresAt: targetExpiry,
            events: { create: { type: "RENEWED", metadata: { orderId } } },
          },
        });
        await tx.subscription.update({
          where: { licenseId: renewal.licenseId },
          data: { endsAt: targetExpiry, planId: item.planId },
        });
        await tx.setting.upsert({
          where: { key: "renewal-done:" + orderId },
          create: { key: "renewal-done:" + orderId, value: true },
          update: { value: true },
        });
      });
      return;
    } finally {
      await redis.eval(
        "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",
        1,
        lockKey,
        lockToken,
      );
    }
  }
  const license = await serial(async (tx) => {
    const paid = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (paid.status !== "PAID") return null;
    const existing = await tx.license.findUnique({ where: { orderId } });
    if (existing) return existing;
    const key = "sk-" + randomBytes(32).toString("hex");
    return tx.license.create({
      data: {
        orderId,
        userId: order.userId,
        keyHash: keyHash(key),
        keyEncrypted: encrypt(key),
        keySuffix: key.slice(-6),
        maxDevices: item.maxDevices,
        durationDays: item.durationDays,
      },
    });
  });
  if (!license) return;
  if (license.status === "ACTIVE" || license.status === "REVOKED") return;
  const issued = await upstream<{ id: number; expires_at: string }>(
    "/api/v1/admin/ch-relay/licenses",
    {
      method: "POST",
      body: {
        user_id: env.SUB2API_LICENSE_USER_ID,
        name: "aihub:" + license.id,
        expires_in_days: item.durationDays,
        custom_key: decrypt(license.keyEncrypted),
      },
    },
  );
  await serial(async (tx) => {
    const current = await tx.license.findUniqueOrThrow({
      where: { id: license.id },
    });
    const paid = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (current.status === "REVOKED" || paid.status !== "PAID") {
      await tx.license.update({
        where: { id: license.id },
        data: { status: "REVOKED", upstreamKeyId: issued.id },
      });
      await enqueueRevoke(tx, license.id);
      return;
    }
    if (current.status === "ACTIVE") return;
    await tx.license.update({
      where: { id: license.id },
      data: {
        upstreamKeyId: issued.id,
        status: "ACTIVE",
        expiresAt: new Date(issued.expires_at),
        events: { create: { type: "ISSUED", metadata: { orderId } } },
      },
    });
    await tx.subscription.upsert({
      where: { licenseId: license.id },
      create: {
        licenseId: license.id,
        planId: item.planId,
        startsAt: new Date(),
        endsAt: new Date(issued.expires_at),
      },
      update: { endsAt: new Date(issued.expires_at) },
    });
    await tx.notification.create({
      data: {
        userId: license.userId,
        title: "License đã sẵn sàng",
        body: "Mở trang quản lý license để lấy key và hướng dẫn cài đặt.",
        href: "/dashboard/licenses",
      },
    });
    await tx.job.upsert({
      where: { dedupeKey: "mail-license:" + license.id },
      create: {
        dedupeKey: "mail-license:" + license.id,
        type: "MAIL",
        payload: {
          userId: license.userId,
          subject: "AIHub · License đã sẵn sàng",
          text:
            "License của bạn đã được cấp. Đăng nhập " +
            env.BETTER_AUTH_URL +
            "/dashboard/licenses để lấy key.",
        },
      },
      update: {},
    });
  });
}
async function enqueueRevoke(tx: import("./db").Tx, licenseId: string) {
  await tx.job.upsert({
    where: { dedupeKey: "revoke:" + licenseId },
    create: {
      dedupeKey: "revoke:" + licenseId,
      type: "REVOKE",
      payload: { licenseId },
    },
    update: { status: "PENDING", availableAt: new Date(), completedAt: null },
  });
}

import { randomBytes, createPublicKey, verify } from "node:crypto";
import { z } from "zod";
import { db, serial } from "./db";
import { fail, keyHash, limit, readyRedis, redis, decrypt } from "./security";
import { upstreamStatus, upstream } from "./upstream";
import type { Actor } from "./auth";
export const deviceSchema = z.object({
  fingerprint: z.string().uuid(),
  publicKey: z.string().min(50).max(256),
  name: z.string().trim().min(1).max(80),
  os: z.string().min(1).max(40),
  nonce: z.string().regex(/^[a-f0-9]{64}$/),
  signature: z.string().min(80).max(100),
});
export function bearer(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  if (!/^Bearer [!-~]{16,4096}$/.test(auth)) fail(401, "INVALID_API_KEY");
  return auth.slice(7);
}
async function usable(key: string) {
  const license = await db.license.findUnique({
    where: { keyHash: keyHash(key) },
    include: { user: { select: { disabled: true } } },
  });
  if (!license) fail(401, "INVALID_API_KEY");
  if (license.user.disabled || license.status !== "ACTIVE")
    fail(403, "API_KEY_DISABLED");
  if (!license.expiresAt || license.expiresAt.getTime() <= Date.now())
    fail(403, "API_KEY_EXPIRED");
  return license;
}
export async function challenge(key: string) {
  await limit("license-challenge:" + keyHash(key), 60);
  const license = await usable(key);
  await readyRedis();
  const nonce = randomBytes(32).toString("hex");
  await redis.set("challenge:" + nonce, license.id, "EX", 60, "NX");
  return { nonce, expiresIn: 60, protocol: "aihub-device-v1" };
}
export function proofMessage(
  action: string,
  nonce: string,
  fingerprint: string,
) {
  return `aihub-device-v1\n${action}\n${nonce}\n${fingerprint}`;
}
export async function deviceAction(
  key: string,
  action: "activate" | "validate" | "heartbeat" | "deactivate",
  input: z.infer<typeof deviceSchema>,
) {
  const license = await usable(key);
  await limit("device:" + license.id, 180);
  await readyRedis();
  // GETDEL consumes the challenge exactly once, including failed signature attempts.
  const challengeLicense = await redis.getdel("challenge:" + input.nonce);
  if (challengeLicense !== license.id) fail(401, "challenge_invalid");
  try {
    const publicKey = createPublicKey(input.publicKey);
    if (
      publicKey.asymmetricKeyType !== "ed25519" ||
      !verify(
        null,
        Buffer.from(proofMessage(action, input.nonce, input.fingerprint)),
        publicKey,
        Buffer.from(input.signature, "base64url"),
      )
    )
      fail(401, "device_signature_invalid");
  } catch {
    fail(401, "device_signature_invalid");
  }
  const status = await upstreamStatus(key);
  if (
    status.active !== true ||
    status.feature !== "ch-relay" ||
    status.key_id !== license.upstreamKeyId ||
    !Number.isFinite(Date.parse(status.server_time)) ||
    !Number.isFinite(Date.parse(status.expires_at)) ||
    Date.parse(status.expires_at) <= Date.parse(status.server_time)
  )
    fail(403, "upstream_license_invalid");
  const device = await serial(async (tx) => {
    const current = await tx.license.findUniqueOrThrow({
      where: { id: license.id },
    });
    if (
      current.status !== "ACTIVE" ||
      !current.expiresAt ||
      current.expiresAt.getTime() <= Date.now()
    )
      fail(403, "API_KEY_DISABLED");
    let device = await tx.device.findUnique({
      where: {
        licenseId_fingerprint: {
          licenseId: license.id,
          fingerprint: input.fingerprint,
        },
      },
    });
    if (device && device.publicKey !== input.publicKey)
      fail(403, "device_key_mismatch");
    if (device?.revokedAt) fail(403, "device_revoked");
    if (action === "activate") {
      if (!device || device.revokedAt) {
        if (
          current.deviceChangeAfter &&
          current.deviceChangeAfter.getTime() > Date.now()
        )
          fail(429, "device_change_cooldown");
        if (
          (await tx.device.count({
            where: { licenseId: license.id, revokedAt: null },
          })) >= current.maxDevices
        )
          fail(409, "device_limit_reached");
        device = await tx.device.upsert({
          where: {
            licenseId_fingerprint: {
              licenseId: license.id,
              fingerprint: input.fingerprint,
            },
          },
          create: {
            licenseId: license.id,
            fingerprint: input.fingerprint,
            publicKey: input.publicKey,
            name: input.name,
            os: input.os,
          },
          update: {
            revokedAt: null,
            activatedAt: new Date(),
            name: input.name,
            os: input.os,
          },
        });
        await tx.activation.create({
          data: { deviceId: device.id, action: "ACTIVATED" },
        });
        await tx.licenseEvent.create({
          data: {
            licenseId: license.id,
            type: "DEVICE_ACTIVATED",
            metadata: { deviceId: device.id },
          },
        });
        if (!current.activatedAt)
          await tx.license.update({
            where: { id: license.id },
            data: { activatedAt: new Date() },
          });
      }
    } else if (!device || device.revokedAt)
      fail(403, "device_activation_required");
    if (!device) fail(403, "device_activation_required");
    if (action === "deactivate") {
      await tx.device.update({
        where: { id: device.id },
        data: { revokedAt: new Date() },
      });
      await tx.license.update({
        where: { id: license.id },
        data: { deviceChangeAfter: new Date(Date.now() + 3600000) },
      });
      await tx.activation.create({
        data: { deviceId: device.id, action: "DEACTIVATED" },
      });
    } else
      await tx.device.update({
        where: { id: device.id },
        data: { lastSeenAt: new Date() },
      });
    return device;
  });
  return {
    ...status,
    device_id: device.id,
    active: action !== "deactivate",
    expires_at: new Date(
      Math.min(Date.parse(status.expires_at), license.expiresAt!.getTime()),
    ).toISOString(),
  };
}
export async function revealKey(user: Actor, id: string) {
  const license = await db.license.findFirst({
    where: { id, userId: user.id },
  });
  if (!license) fail(404, "license_not_found");
  await limit("reveal:" + user.id, 10);
  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: "license.reveal",
      target: id,
      metadata: {},
    },
  });
  return { key: decrypt(license.keyEncrypted) };
}
export async function manageDevice(
  user: Actor,
  id: string,
  input: { action: "rename" | "revoke"; name?: string },
) {
  return serial(async (tx) => {
    const device = await tx.device.findUnique({
      where: { id },
      include: { license: true },
    });
    if (
      !device ||
      (device.license.userId !== user.id && !user.roleNames.includes("ADMIN"))
    )
      fail(404, "device_not_found");
    if (input.action === "rename")
      return tx.device.update({ where: { id }, data: { name: input.name } });
    if (!device.revokedAt) {
      await tx.device.update({
        where: { id },
        data: { revokedAt: new Date() },
      });
      await tx.license.update({
        where: { id: device.licenseId },
        data: { deviceChangeAfter: new Date(Date.now() + 3600000) },
      });
      await tx.activation.create({ data: { deviceId: id, action: "REVOKED" } });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "device.revoke",
          target: id,
          metadata: { licenseId: device.licenseId },
        },
      });
    }
    return { revoked: true };
  });
}
export async function revokeLicense(user: Actor, id: string, reason: string) {
  const license = await db.license.findUnique({ where: { id } });
  if (!license) fail(404, "license_not_found");
  // Block locally first; queue upstream revocation durably so an outage cannot lose it.
  await serial(async (tx) => {
    await tx.license.update({
      where: { id },
      data: {
        status: "REVOKED",
        events: {
          create: { type: "REVOKED", metadata: { reason, actorId: user.id } },
        },
      },
    });
    await tx.job.upsert({
      where: { dedupeKey: "revoke:" + id },
      create: {
        dedupeKey: "revoke:" + id,
        type: "REVOKE",
        payload: { licenseId: id },
      },
      update: { status: "PENDING", availableAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "license.revoke",
        target: id,
        metadata: { reason },
      },
    });
  });
  return { revoked: true };
}
export async function upstreamRevoke(id: string) {
  const license = await db.license.findUniqueOrThrow({ where: { id } });
  if (license.upstreamKeyId)
    await upstream("/api/v1/admin/ch-relay/licenses/" + license.upstreamKeyId, {
      method: "PUT",
      body: { status: "inactive" },
    });
}

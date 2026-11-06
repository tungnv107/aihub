import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID, generateKeyPairSync, sign } from "node:crypto";
import { db } from "../src/server/db";
import {
  challenge,
  deviceAction,
  proofMessage,
  manageDevice,
  upstreamRevoke,
} from "../src/server/licenses";
import { provisionOrder } from "../src/server/provision";
import { decrypt, redis } from "../src/server/security";
import { env } from "../src/server/env";
import type { Actor } from "../src/server/auth";
const id = "license-test-" + randomUUID();
let user: Actor,
  orderId: string,
  licenseId: string,
  key: string,
  planId: string;
const renewalIds: string[] = [];
function identity() {
  const pair = generateKeyPairSync("ed25519");
  return {
    fingerprint: randomUUID(),
    publicKey: pair.publicKey
      .export({ type: "spki", format: "pem" })
      .toString(),
    privateKey: pair.privateKey,
    name: "Integration device",
    os: "test",
  };
}
async function proof(
  action: "activate" | "validate" | "deactivate",
  device: ReturnType<typeof identity>,
) {
  const { nonce } = await challenge(key);
  return {
    fingerprint: device.fingerprint,
    publicKey: device.publicKey,
    name: device.name,
    os: device.os,
    nonce,
    signature: sign(
      null,
      Buffer.from(proofMessage(action, nonce, device.fingerprint)),
      device.privateKey,
    ).toString("base64url"),
  };
}
beforeAll(async () => {
  const created = await db.user.create({
    data: {
      id,
      email: id + "@example.test",
      name: "License integration fixture",
      emailVerified: true,
    },
  });
  user = { ...created, roles: [], roleNames: [], sessionId: "fixture" };
  const plan = await db.plan.create({
    data: {
      slug: id,
      name: "Device test",
      description: "Test only",
      price: 1000,
      durationDays: 1,
      maxDevices: 1,
      active: true,
    },
  });
  planId = plan.id;
  const order = await db.order.create({
    data: {
      code: id,
      userId: id,
      billingName: user.name,
      billingEmail: user.email,
      amount: 1000,
      status: "PAID",
      paidAt: new Date(),
      expiresAt: new Date(Date.now() + 60000),
      items: {
        create: {
          planId,
          name: "Device test",
          price: 1000,
          durationDays: 1,
          maxDevices: 1,
        },
      },
    },
  });
  orderId = order.id;
  await provisionOrder(orderId);
  const license = await db.license.findUniqueOrThrow({ where: { orderId } });
  licenseId = license.id;
  key = decrypt(license.keyEncrypted);
});
afterAll(async () => {
  if (licenseId) await upstreamRevoke(licenseId);
  await db.$transaction(async (tx) => {
    await tx.activation.deleteMany({ where: { device: { licenseId } } });
    await tx.device.deleteMany({ where: { licenseId } });
    await tx.licenseEvent.deleteMany({ where: { licenseId } });
    await tx.subscription.deleteMany({ where: { licenseId } });
    await tx.license.deleteMany({ where: { id: licenseId } });
    await tx.job.deleteMany({
      where: { dedupeKey: "mail-license:" + licenseId },
    });
    await tx.notification.deleteMany({ where: { userId: id } });
    await tx.auditLog.deleteMany({ where: { actorId: id } });
    await tx.setting.deleteMany({
      where: {
        key: {
          in: renewalIds.flatMap((id) => [
            "renewal:" + id,
            "renewal-done:" + id,
          ]),
        },
      },
    });
    await tx.orderItem.deleteMany({
      where: { orderId: { in: [orderId, ...renewalIds] } },
    });
    await tx.order.deleteMany({
      where: { id: { in: [orderId, ...renewalIds] } },
    });
    await tx.plan.deleteMany({ where: { id: planId } });
    await tx.user.deleteMany({ where: { id } });
  });
  await db.$disconnect();
  redis.disconnect();
});
it("issues only one upstream key on repeated provisioning, and denies direct Sub2API access", async () => {
  const first = await db.license.findUniqueOrThrow({
    where: { id: licenseId },
  });
  await provisionOrder(orderId);
  const again = await db.license.findUniqueOrThrow({
    where: { id: licenseId },
  });
  expect(again.upstreamKeyId).toBe(first.upstreamKeyId);
  expect(await db.license.count({ where: { orderId } })).toBe(1);
  const response = await fetch(env.SUB2API_URL + "/v1/ch-relay/license", {
    headers: { authorization: "Bearer " + key },
  });
  expect(response.status).toBe(403);
});
it("enforces device limit under concurrent activation and rejects challenge replay and tampering", async () => {
  const devices = [identity(), identity(), identity()];
  const inputs = await Promise.all(devices.map((d) => proof("activate", d)));
  const results = await Promise.allSettled(
    inputs.map((input) => deviceAction(key, "activate", input)),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(await db.device.count({ where: { licenseId, revokedAt: null } })).toBe(
    1,
  );
  await expect(deviceAction(key, "activate", inputs[0])).rejects.toThrow(
    "challenge_invalid",
  );
  const tampered = await proof("activate", identity());
  tampered.signature = "A".repeat(86);
  await expect(deviceAction(key, "activate", tampered)).rejects.toThrow(
    "device_signature_invalid",
  );
});
it("blocks revoked devices permanently and applies a cooldown to new devices", async () => {
  const old = await db.device.findFirstOrThrow({
    where: { licenseId, revokedAt: null },
  });
  await manageDevice(user, old.id, { action: "revoke" });
  expect(
    (await db.device.findUniqueOrThrow({ where: { id: old.id } })).revokedAt,
  ).not.toBeNull();
  const next = identity();
  await expect(
    deviceAction(key, "activate", await proof("activate", next)),
  ).rejects.toThrow("device_change_cooldown");
});
it("renews concurrent orders without losing days and repeated jobs do not extend twice", async () => {
  const before = await db.license.findUniqueOrThrow({
    where: { id: licenseId },
  });
  for (let i = 0; i < 2; i++) {
    const renewal = await db.order.create({
      data: {
        code: id + "-renew-" + i,
        userId: id,
        billingName: user.name,
        billingEmail: user.email,
        amount: 1000,
        status: "PAID",
        paidAt: new Date(),
        expiresAt: new Date(),
        renewalLicenseId: licenseId,
        items: {
          create: {
            planId,
            name: "Renewal",
            price: 1000,
            durationDays: 2,
            maxDevices: 1,
          },
        },
      },
    });
    renewalIds.push(renewal.id);
  }
  await Promise.allSettled(renewalIds.map((id) => provisionOrder(id)));
  for (const id of renewalIds) await provisionOrder(id);
  const after = await db.license.findUniqueOrThrow({
    where: { id: licenseId },
  });
  expect(after.expiresAt!.getTime() - before.expiresAt!.getTime()).toBe(
    4 * 86400000,
  );
  for (const id of renewalIds) await provisionOrder(id);
  expect(
    (
      await db.license.findUniqueOrThrow({ where: { id: licenseId } })
    ).expiresAt!.getTime(),
  ).toBe(after.expiresAt!.getTime());
  expect(
    await db.licenseEvent.count({ where: { licenseId, type: "RENEWED" } }),
  ).toBe(2);
});
it("resumes an interrupted renewal before calculating another order's expiry", async () => {
  const before = await db.license.findUniqueOrThrow({
    where: { id: licenseId },
  });
  const pending: string[] = [];
  for (let i = 0; i < 2; i++) {
    const order = await db.order.create({
      data: {
        code: id + "-interrupted-" + i,
        userId: id,
        billingName: user.name,
        billingEmail: user.email,
        amount: 1000,
        status: "PAID",
        paidAt: new Date(),
        expiresAt: new Date(),
        renewalLicenseId: licenseId,
        items: {
          create: {
            planId,
            name: "Resume renewal",
            price: 1000,
            durationDays: 1,
            maxDevices: 1,
          },
        },
      },
    });
    pending.push(order.id);
    renewalIds.push(order.id);
  }
  await db.setting.create({
    data: {
      key: "renewal:" + pending[0],
      value: {
        licenseId,
        keyId: before.upstreamKeyId,
        expiresAt: new Date(
          before.expiresAt!.getTime() + 86400000,
        ).toISOString(),
      },
    },
  });
  await expect(provisionOrder(pending[1])).rejects.toThrow(
    "previous_renewal_pending",
  );
  await provisionOrder(pending[0]);
  await provisionOrder(pending[1]);
  expect(
    (
      await db.license.findUniqueOrThrow({ where: { id: licenseId } })
    ).expiresAt!.getTime(),
  ).toBe(before.expiresAt!.getTime() + 2 * 86400000);
});
it("rejects expired and disabled access and fails closed when upstream revokes a key", async () => {
  await db.license.update({
    where: { id: licenseId },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  await expect(challenge(key)).rejects.toThrow("API_KEY_EXPIRED");
  await db.license.update({
    where: { id: licenseId },
    data: { expiresAt: new Date(Date.now() + 60000), deviceChangeAfter: null },
  });
  await db.user.update({ where: { id }, data: { disabled: true } });
  await expect(challenge(key)).rejects.toThrow("API_KEY_DISABLED");
  await db.user.update({ where: { id }, data: { disabled: false } });
  await upstreamRevoke(licenseId);
  const next = identity();
  await expect(
    deviceAction(key, "activate", await proof("activate", next)),
  ).rejects.toThrow(/sub2api_rejected_40[13]/);
});

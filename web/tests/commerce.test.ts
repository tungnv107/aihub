import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID, createHmac } from "node:crypto";
import { db } from "../src/server/db";
import {
  checkout,
  reconcilePayment,
  verifyWebhook,
} from "../src/server/commerce";
import type { Actor } from "../src/server/auth";
import { encrypt, decrypt, keyHash, redis } from "../src/server/security";
import { env } from "../src/server/env";
const id = "test-" + randomUUID();
let user: Actor, planId: string;
const orderIds: string[] = [];
beforeAll(async () => {
  const account = await db.user.create({
    data: {
      id,
      name: "Commerce integration fixture",
      email: id + "@example.test",
      emailVerified: true,
    },
  });
  user = { ...account, roles: [], roleNames: [], sessionId: "fixture" };
  const plan = await db.plan.create({
    data: {
      slug: id,
      name: "Test only",
      description: "Integration fixture",
      price: 19000,
      durationDays: 30,
      maxDevices: 1,
      active: true,
    },
  });
  planId = plan.id;
});
afterAll(async () => {
  await db.$transaction(async (tx) => {
    await tx.job.deleteMany({
      where: { dedupeKey: { in: orderIds.map((id) => "provision:" + id) } },
    });
    await tx.notification.deleteMany({ where: { userId: id } });
    await tx.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.paymentEvent.deleteMany({
      where: { eventId: { startsWith: id } },
    });
    await tx.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.order.deleteMany({ where: { id: { in: orderIds } } });
    await tx.plan.delete({ where: { id: planId } });
    await tx.user.delete({ where: { id } });
  });
  await db.$disconnect();
  redis.disconnect();
});
async function order() {
  const result = await checkout(user, { planId, billingName: user.name });
  orderIds.push(result.id);
  return result;
}
const payload = (code: string, eventId: string, amount = 19000) =>
  JSON.stringify({
    id: eventId,
    transferType: "in",
    transferAmount: amount,
    accountNumber: "sandbox",
    content: code,
  });
describe("authenticated payments and durable fulfillment", () => {
  it("authenticates the exact raw body and rejects invalid, changed, old signatures", () => {
    const raw = payload("AH0123456789ABCDEF", id + "signature"),
      timestamp = String(Math.floor(Date.now() / 1000));
    const signature =
      "sha256=" +
      createHmac("sha256", env.SANDBOX_PAYMENT_SECRET)
        .update(timestamp + "." + raw)
        .digest("hex");
    const headers = new Headers({
      "x-sepay-timestamp": timestamp,
      "x-sepay-signature": signature,
    });
    expect(() => verifyWebhook("sandbox", raw, headers)).not.toThrow();
    expect(() => verifyWebhook("sandbox", raw + " ", headers)).toThrow(
      "invalid_signature",
    );
    headers.set("x-sepay-timestamp", String(Number(timestamp) - 1000));
    expect(() => verifyWebhook("sandbox", raw, headers)).toThrow(
      "stale_signature",
    );
    expect(() => verifyWebhook("sandbox", raw, new Headers())).toThrow();
  });
  it("accepts one verified payment and enqueues one provisioning job under concurrent retries", async () => {
    const created = await order();
    const raw = payload(created.code, id + "duplicate");
    const results = await Promise.all(
      Array.from({ length: 5 }, () => reconcilePayment("sandbox", raw)),
    );
    expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
    expect(await db.payment.count({ where: { orderId: created.id } })).toBe(1);
    expect(
      await db.job.count({ where: { dedupeKey: "provision:" + created.id } }),
    ).toBe(1);
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: created.id } })).status,
    ).toBe("PAID");
    expect(
      await reconcilePayment(
        "sandbox",
        payload(created.code, id + "second-event"),
      ),
    ).toMatchObject({ outcome: "ALREADY_SETTLED" });
    expect(await db.payment.count({ where: { orderId: created.id } })).toBe(1);
  });
  it("does not settle mismatched amounts, ambiguous references, outbound or expired orders", async () => {
    const created = await order();
    expect(
      await reconcilePayment(
        "sandbox",
        payload(created.code, id + "amount", 1),
      ),
    ).toMatchObject({ outcome: "AMOUNT_MISMATCH" });
    expect(
      await reconcilePayment(
        "sandbox",
        payload(created.code + " AH0123456789ABCDEF", id + "ambiguous"),
      ),
    ).toMatchObject({ outcome: "UNMATCHED" });
    const out = JSON.parse(payload(created.code, id + "out"));
    out.transferType = "out";
    expect(
      await reconcilePayment("sandbox", JSON.stringify(out)),
    ).toMatchObject({ outcome: "OUTGOING" });
    await db.order.update({
      where: { id: created.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(
      await reconcilePayment("sandbox", payload(created.code, id + "late")),
    ).toMatchObject({ outcome: "ORDER_EXPIRED" });
    expect(await db.payment.count({ where: { orderId: created.id } })).toBe(0);
    expect(
      await db.job.count({ where: { dedupeKey: "provision:" + created.id } }),
    ).toBe(0);
  });
  it("rejects an event ID reused with a different payload", async () => {
    const created = await order();
    await reconcilePayment(
      "sandbox",
      payload(created.code, id + "conflict", 1),
    );
    await expect(
      reconcilePayment("sandbox", payload(created.code, id + "conflict", 2)),
    ).rejects.toThrow("event_payload_conflict");
  });
  it("stores keys encrypted and authenticates ciphertext", () => {
    const key = "sk-" + randomUUID();
    const encoded = encrypt(key);
    expect(encoded).not.toContain(key);
    expect(decrypt(encoded)).toBe(key);
    const pieces = encoded.split(".");
    pieces[2] = Buffer.from("tampered").toString("base64url");
    expect(() => decrypt(pieces.join("."))).toThrow();
    expect(keyHash(key)).not.toBe(keyHash(key + "x"));
  });
  it("verifies SePay HMAC and API-key authentication and rejects a different receiving account", async () => {
    const saved = {
      PAYMENT_PROVIDER: env.PAYMENT_PROVIDER,
      SEPAY_AUTH_MODE: env.SEPAY_AUTH_MODE,
      SEPAY_WEBHOOK_SECRET: env.SEPAY_WEBHOOK_SECRET,
      BANK_ACCOUNT: env.BANK_ACCOUNT,
    };
    try {
      env.PAYMENT_PROVIDER = "sepay";
      env.SEPAY_AUTH_MODE = "hmac";
      env.SEPAY_WEBHOOK_SECRET = "test-only-provider-" + randomUUID();
      env.BANK_ACCOUNT = "fixture-account";
      const created = await order(),
        raw = payload(created.code, id + "wrong-bank"),
        timestamp = String(Math.floor(Date.now() / 1000));
      const headers = new Headers({
        "x-sepay-timestamp": timestamp,
        "x-sepay-signature":
          "sha256=" +
          createHmac("sha256", env.SEPAY_WEBHOOK_SECRET)
            .update(timestamp + "." + raw)
            .digest("hex"),
      });
      expect(() => verifyWebhook("sepay", raw, headers)).not.toThrow();
      expect(() => verifyWebhook("sepay", raw + " ", headers)).toThrow(
        "invalid_signature",
      );
      expect(await reconcilePayment("sepay", raw)).toMatchObject({
        outcome: "WRONG_ACCOUNT",
      });
      env.SEPAY_AUTH_MODE = "apikey";
      expect(() =>
        verifyWebhook(
          "sepay",
          raw,
          new Headers({ authorization: "Apikey " + env.SEPAY_WEBHOOK_SECRET }),
        ),
      ).not.toThrow();
      expect(() => verifyWebhook("sepay", raw, new Headers())).toThrow(
        "invalid_signature",
      );
      expect(await db.payment.count({ where: { orderId: created.id } })).toBe(
        0,
      );
    } finally {
      Object.assign(env, saved);
    }
  });
});

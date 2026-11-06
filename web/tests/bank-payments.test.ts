import { beforeAll, afterAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { db } from "../src/server/db";
import { auth, type Actor } from "../src/server/auth";
import { env } from "../src/server/env";
import { redis } from "../src/server/security";
import {
  checkout,
  manualPayment,
  reconcilePayment,
  verifyWebhook,
} from "../src/server/commerce";
import {
  BANK_SETTING_KEY,
  savePaymentSettings,
  paymentConfiguration,
  paymentForOrder,
} from "../src/server/payments";
import { bankQrUrl, bankSettingsSchema } from "../src/lib/payment";
import { PATCH, GET } from "../src/app/api/v1/[...path]/route";
import type { Prisma } from "../src/generated/prisma/client";

const prefix = "bank-test-" + randomUUID(),
  password = "Fixture-only-" + randomUUID();
const bank = {
  bankName: "VIETINBANK",
  bankBin: "970415",
  bankAccount: "000123456789",
  bankAccountName: "PAYMENT TEST FIXTURE",
  enabled: true,
  sepayEnabled: false,
  publicConsent: true as const,
};
const savedEnv = {
  PAYMENT_PROVIDER: env.PAYMENT_PROVIDER,
  SEPAY_WEBHOOK_SECRET: env.SEPAY_WEBHOOK_SECRET,
  SEPAY_AUTH_MODE: env.SEPAY_AUTH_MODE,
};
let admin: Actor,
  customer: Actor,
  planId: string,
  cookies: Record<string, string>;
let savedSettings: { key: string; value: Prisma.JsonValue }[] = [];
const orders: string[] = [];
beforeAll(async () => {
  savedSettings = await db.setting.findMany({
    where: { key: { in: [BANK_SETTING_KEY, "site"] } },
    select: { key: true, value: true },
  });
  await db.setting.deleteMany({
    where: { key: { in: [BANK_SETTING_KEY, "site"] } },
  });
  env.PAYMENT_PROVIDER = "disabled";
  env.SEPAY_WEBHOOK_SECRET = "";
  await db.role.upsert({
    where: { id: "ADMIN" },
    create: { id: "ADMIN", name: "ADMIN" },
    update: {},
  });
  const hash = await hashPassword(password);
  async function create(suffix: string, isAdmin: boolean): Promise<Actor> {
    const id = prefix + suffix;
    const u = await db.user.create({
      data: {
        id,
        email: id + "@example.test",
        name: "Bank test " + suffix,
        emailVerified: true,
        roles: isAdmin ? { create: { roleId: "ADMIN" } } : undefined,
        accounts: {
          create: {
            id: randomUUID(),
            accountId: id,
            providerId: "credential",
            password: hash,
          },
        },
      },
      include: { roles: { include: { role: true } } },
    });
    return { ...u, roleNames: isAdmin ? ["ADMIN"] : [], sessionId: "fixture" };
  }
  admin = await create("admin", true);
  customer = await create("customer", false);
  cookies = {};
  for (const user of [admin, customer]) {
    const response = await auth.api.signInEmail({
      body: { email: user.email, password },
      asResponse: true,
    });
    expect(response.status).toBe(200);
    cookies[user.id] = response.headers
      .getSetCookie()
      .map((x) => x.split(";")[0])
      .join("; ");
  }
  const plan = await db.plan.create({
    data: {
      slug: prefix,
      name: "Bank test plan",
      description: "Test fixture only",
      price: 99000,
      durationDays: 30,
      maxDevices: 1,
      active: true,
    },
  });
  planId = plan.id;
});
afterAll(async () => {
  Object.assign(env, savedEnv);
  await db.$transaction(async (tx) => {
    await tx.job.deleteMany({
      where: { dedupeKey: { in: orders.map((id) => "provision:" + id) } },
    });
    await tx.payment.deleteMany({ where: { orderId: { in: orders } } });
    await tx.paymentEvent.deleteMany({
      where: { eventId: { startsWith: prefix } },
    });
    await tx.notification.deleteMany({
      where: { userId: { startsWith: prefix } },
    });
    await tx.orderItem.deleteMany({ where: { orderId: { in: orders } } });
    await tx.order.deleteMany({ where: { id: { in: orders } } });
    await tx.auditLog.deleteMany({
      where: { actorId: { startsWith: prefix } },
    });
    if (planId) await tx.plan.delete({ where: { id: planId } });
    await tx.user.deleteMany({ where: { id: { startsWith: prefix } } });
    await tx.setting.deleteMany({
      where: { key: { in: [BANK_SETTING_KEY, "site"] } },
    });
    for (const item of savedSettings)
      await tx.setting.create({
        data: { key: item.key, value: item.value as Prisma.InputJsonValue },
      });
  });
  await db.$disconnect();
  redis.disconnect();
});
async function newOrder() {
  const result = await checkout(customer, {
    planId,
    billingName: customer.name,
  });
  orders.push(result.id);
  return result;
}
const context = {
  params: Promise.resolve({ path: ["admin", "payment-settings"] }),
};
const req = (
  cookie: string,
  origin = env.BETTER_AUTH_URL,
  body: unknown = bank,
) =>
  new Request(env.BETTER_AUTH_URL + "/api/v1/admin/payment-settings", {
    method: "PATCH",
    headers: { cookie, origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

it("requires an admin session and same-origin mutation for bank settings", async () => {
  expect(
    (
      await GET(
        new Request(env.BETTER_AUTH_URL + "/api/v1/admin/payment-settings"),
        context,
      )
    ).status,
  ).toBe(401);
  expect((await PATCH(req(cookies[customer.id]), context)).status).toBe(403);
  expect(
    (await PATCH(req(cookies[admin.id], "https://attacker.invalid"), context))
      .status,
  ).toBe(403);
  expect(
    (
      await PATCH(
        req(cookies[admin.id], env.BETTER_AUTH_URL, {
          ...bank,
          publicConsent: false,
        }),
        context,
      )
    ).status,
  ).toBe(400);
  expect(
    await db.setting.findUnique({ where: { key: BANK_SETTING_KEY } }),
  ).toBeNull();
  expect((await paymentConfiguration()).available).toBe(false);
});
it("validates bank details and refuses SePay before its authenticated connection exists", async () => {
  for (const input of [
    { ...bank, bankBin: "970415/evil" },
    { ...bank, bankAccount: "123&amount=1" },
    { ...bank, publicConsent: false },
  ])
    expect(bankSettingsSchema.safeParse(input).success).toBe(false);
  await expect(
    savePaymentSettings(admin, { ...bank, sepayEnabled: true }),
  ).rejects.toThrow("sepay_not_configured");
});
it("accepts manual bank configuration without SePay and creates a pending order with exact QR values", async () => {
  const response = await PATCH(req(cookies[admin.id]), context);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    provider: "manual",
    sepayReady: false,
    available: true,
    checkoutEnabled: true,
  });
  const order = await newOrder();
  expect(order.status).toBe("PENDING");
  expect(order.amount).toBe(99000);
  const instructions = paymentForOrder(order),
    qr = new URL(bankQrUrl(instructions, order.amount, order.code)!);
  expect(qr.hostname).toBe("img.vietqr.io");
  expect(qr.pathname).toBe("/image/970415-000123456789-compact2.svg");
  expect(qr.searchParams.get("amount")).toBe("99000");
  expect(qr.searchParams.get("addInfo")).toBe(order.code);
  expect(qr.searchParams.get("accountName")).toBe(bank.bankAccountName);
  expect(await db.license.count({ where: { orderId: order.id } })).toBe(0);
  expect(
    await db.job.count({ where: { dedupeKey: "provision:" + order.id } }),
  ).toBe(0);
  expect(await db.payment.count({ where: { orderId: order.id } })).toBe(0);
});
it("keeps existing instructions stable after account edits or disabling new purchases", async () => {
  const order = await newOrder();
  await savePaymentSettings(admin, {
    ...bank,
    bankAccount: "999123456789",
    enabled: false,
  });
  expect(
    paymentForOrder(
      await db.order.findUniqueOrThrow({ where: { id: order.id } }),
    ).bankAccount,
  ).toBe(bank.bankAccount);
  await expect(newOrder()).rejects.toThrow("checkout_paused");
  await savePaymentSettings(admin, bank);
  const audit = await db.auditLog.findFirstOrThrow({
    where: { actorId: admin.id, action: "payment.settings.update" },
  });
  expect(JSON.stringify(audit.metadata)).not.toContain(bank.bankAccount);
});
it("allows only admin reconciliation, matches the exact amount, and provisions once even after the QR expires", async () => {
  const order = await newOrder();
  await db.order.update({
    where: { id: order.id },
    data: { status: "EXPIRED", expiresAt: new Date(Date.now() - 1000) },
  });
  const input = {
    reference: prefix + "manual",
    amount: 99000,
    reason: "Bank statement checked by test administrator",
  };
  await expect(manualPayment(customer, order.id, input)).rejects.toThrow(
    "insufficient_permissions",
  );
  await expect(
    manualPayment(admin, order.id, { ...input, amount: 1 }),
  ).rejects.toThrow("amount_mismatch");
  const result = await Promise.allSettled([
    manualPayment(admin, order.id, input),
    manualPayment(admin, order.id, input),
  ]);
  expect(result.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  expect(await db.payment.count({ where: { orderId: order.id } })).toBe(1);
  expect(
    await db.job.count({ where: { dedupeKey: "provision:" + order.id } }),
  ).toBe(1);
});
it("can enable SePay later and matches the receiving account stored on each earlier manual order", async () => {
  const order = await newOrder();
  env.PAYMENT_PROVIDER = "sepay";
  env.SEPAY_AUTH_MODE = "apikey";
  env.SEPAY_WEBHOOK_SECRET = "test-only-" + randomUUID();
  const headers = new Headers({
    authorization: "Apikey " + env.SEPAY_WEBHOOK_SECRET,
  });
  const payload = (account: string, suffix: string) =>
    JSON.stringify({
      id: prefix + suffix,
      transferType: "in",
      transferAmount: 99000,
      accountNumber: account,
      content: order.code,
    });
  await expect(
    verifyWebhook("sepay", payload(bank.bankAccount, "before"), headers),
  ).rejects.toThrow("provider_unavailable");
  await savePaymentSettings(admin, {
    ...bank,
    bankAccount: "999123456789",
    sepayEnabled: true,
  });
  expect(await paymentConfiguration()).toMatchObject({ provider: "sepay" });
  await expect(
    verifyWebhook("sepay", payload(bank.bankAccount, "valid"), new Headers()),
  ).rejects.toThrow("invalid_signature");
  await verifyWebhook("sepay", payload(bank.bankAccount, "valid"), headers);
  expect(
    await reconcilePayment("sepay", payload("999123456789", "wrong")),
  ).toMatchObject({ outcome: "WRONG_ACCOUNT" });
  expect(
    await reconcilePayment("sepay", payload(bank.bankAccount, "valid")),
  ).toMatchObject({ outcome: "PAID" });
});

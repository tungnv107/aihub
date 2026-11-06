import { randomBytes, createHmac } from "node:crypto";
import { z } from "zod";
import { serial, Tx } from "./db";
import { env, localSandbox } from "./env";
import { fail, safeEqual, digest } from "./security";
import type { Actor } from "./auth";
import { paymentConfiguration, paymentForOrder } from "./payments";
export const checkoutSchema = z.object({
  planId: z.string().min(1),
  billingName: z.string().trim().min(2).max(120),
  renewalLicenseId: z.string().optional(),
});
export async function checkout(
  user: Actor,
  input: z.infer<typeof checkoutSchema>,
) {
  return serial(async (tx) => {
    const site = await tx.setting.findUnique({ where: { key: "site" } });
    const flags = site?.value as Record<string, unknown> | null;
    if (flags?.maintenanceMode || flags?.checkoutEnabled === false)
      fail(503, "checkout_paused");
    const payment = await paymentConfiguration(tx);
    if (!payment.available) fail(503, "payment_not_configured");
    const plan = await tx.plan.findFirst({
      where: { id: input.planId, active: true },
    });
    if (!plan) fail(404, "plan_unavailable");
    if (input.renewalLicenseId) {
      const license = await tx.license.findFirst({
        where: {
          id: input.renewalLicenseId,
          userId: user.id,
          status: "ACTIVE",
        },
      });
      if (!license) fail(404, "license_unavailable");
      if (license.maxDevices !== plan.maxDevices)
        fail(409, "renewal_device_limit_mismatch");
    }
    return tx.order.create({
      data: {
        code: "AH" + randomBytes(8).toString("hex").toUpperCase(),
        userId: user.id,
        billingName: input.billingName,
        billingEmail: user.email,
        amount: plan.price,
        paymentInstructions: payment,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        renewalLicenseId: input.renewalLicenseId,
        items: {
          create: {
            planId: plan.id,
            name: plan.name,
            price: plan.price,
            durationDays: plan.durationDays,
            maxDevices: plan.maxDevices,
          },
        },
      },
      include: { items: true },
    });
  });
}
export async function verifyWebhook(
  provider: string,
  raw: string,
  headers: Headers,
) {
  let secret: string;
  if (provider === "sandbox") {
    if (!localSandbox) fail(404, "provider_unavailable");
    secret = env.SANDBOX_PAYMENT_SECRET;
  } else if (provider === "sepay") {
    if (env.PAYMENT_PROVIDER !== "sepay" || !env.SEPAY_WEBHOOK_SECRET)
      fail(404, "provider_unavailable");
    if ((await paymentConfiguration()).provider !== "sepay")
      fail(404, "provider_unavailable");
    secret = env.SEPAY_WEBHOOK_SECRET;
  } else return fail(404, "provider_unavailable");
  if (secret.length < 16) fail(503, "payment_secret_missing");
  if (provider === "sepay" && env.SEPAY_AUTH_MODE === "apikey") {
    if (!safeEqual(headers.get("authorization") ?? "", "Apikey " + secret))
      fail(401, "invalid_signature");
    return;
  }
  const timestamp = headers.get("x-sepay-timestamp") ?? "",
    signature = headers.get("x-sepay-signature") ?? "";
  if (
    !/^\d{10}$/.test(timestamp) ||
    Math.abs(Date.now() / 1000 - Number(timestamp)) > 300
  )
    fail(401, "stale_signature");
  const expected =
    "sha256=" +
    createHmac("sha256", secret)
      .update(timestamp + "." + raw)
      .digest("hex");
  if (!safeEqual(signature, expected)) fail(401, "invalid_signature");
}
const webhookSchema = z.object({
  id: z.union([z.string().min(1).max(100), z.number().int().nonnegative()]),
  transferType: z.enum(["in", "out"]),
  transferAmount: z.number().int().positive().max(2_000_000_000),
  accountNumber: z.string().min(1).max(100),
  content: z.string().max(2000),
  code: z.string().nullable().optional(),
});
export async function reconcilePayment(provider: string, raw: string) {
  const event = webhookSchema.parse(JSON.parse(raw));
  const eventId = String(event.id),
    hash = digest(raw);
  return serial(async (tx) => {
    const previous = await tx.paymentEvent.findUnique({
      where: { provider_eventId: { provider, eventId } },
    });
    if (previous) {
      if (previous.payloadHash !== hash) fail(409, "event_payload_conflict");
      return { duplicate: true, outcome: previous.outcome };
    }
    const codes = [
      ...(event.code ?? "").matchAll(/\bAH[A-F0-9]{16}\b/g),
      ...event.content.matchAll(/\bAH[A-F0-9]{16}\b/g),
    ].map((x) => x[0]);
    const distinct = [...new Set(codes)];
    const order =
      distinct.length === 1
        ? await tx.order.findUnique({ where: { code: distinct[0] } })
        : null;
    let outcome = "UNMATCHED";
    if (event.transferType !== "in") outcome = "OUTGOING";
    else if (
      provider === "sepay" &&
      event.accountNumber !==
        (order
          ? paymentForOrder(order).bankAccount
          : (await paymentConfiguration(tx)).bankAccount)
    )
      outcome = "WRONG_ACCOUNT";
    else if (order) {
      if (order.amount !== event.transferAmount) outcome = "AMOUNT_MISMATCH";
      else if (order.status !== "PENDING") outcome = "ALREADY_SETTLED";
      else if (order.expiresAt.getTime() < Date.now())
        outcome = "ORDER_EXPIRED";
      else {
        await settle(tx, order.id, provider, eventId, event.transferAmount);
        outcome = "PAID";
      }
    }
    await tx.paymentEvent.create({
      data: {
        provider,
        eventId,
        payloadHash: hash,
        outcome,
        orderId: order?.id,
      },
    });
    return { duplicate: false, outcome };
  });
}
export async function settle(
  tx: Tx,
  orderId: string,
  provider: string,
  reference: string,
  amount: number,
  allowExpired = false,
) {
  const update = await tx.order.updateMany({
    where: {
      id: orderId,
      status: { in: allowExpired ? ["PENDING", "EXPIRED"] : ["PENDING"] },
    },
    data: { status: "PAID", paidAt: new Date() },
  });
  if (update.count !== 1) fail(409, "order_not_pending");
  await tx.payment.create({ data: { orderId, provider, reference, amount } });
  await tx.job.create({
    data: {
      dedupeKey: "provision:" + orderId,
      type: "PROVISION",
      payload: { orderId },
    },
  });
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
  await tx.notification.create({
    data: {
      userId: order.userId,
      title: "Thanh toán đã xác nhận",
      body: `Đơn ${order.code} đang được cấp quyền sử dụng.`,
      href: "/orders/" + orderId,
    },
  });
}
export async function manualPayment(
  user: Actor,
  orderId: string,
  input: { reference: string; amount: number; reason: string },
) {
  if (!user.roleNames.includes("ADMIN")) fail(403, "insufficient_permissions");
  return serial(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) fail(404, "order_not_found");
    if (order.amount !== input.amount) fail(409, "amount_mismatch");
    await settle(tx, order.id, "manual", input.reference, input.amount, true);
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "payment.manual",
        target: order.id,
        metadata: input,
      },
    });
    return { status: "PAID" };
  });
}

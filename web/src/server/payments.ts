import type { Prisma } from "@/generated/prisma/client";
import { db, serial, type Tx } from "./db";
import { env, localSandbox } from "./env";
import { fail } from "./security";
import type { Actor } from "./auth";
import {
  bankSettingsSchema,
  bankFieldsSchema,
  paymentInstructionsSchema,
  type PaymentInstructions,
  type AdminPaymentSettings,
} from "@/lib/payment";

export const BANK_SETTING_KEY = "payments.bank";
const sepayReady = () =>
  env.PAYMENT_PROVIDER === "sepay" && env.SEPAY_WEBHOOK_SECRET.length >= 16;
export function legacyPaymentConfiguration(): PaymentInstructions {
  const bank = {
    bankName: env.BANK_BIN ? "Ngân hàng " + env.BANK_BIN : "",
    bankBin: env.BANK_BIN,
    bankAccount: env.BANK_ACCOUNT,
    bankAccountName: env.BANK_ACCOUNT_NAME,
  };
  const sandbox = localSandbox && env.PAYMENT_PROVIDER === "sandbox";
  const available =
    sandbox || (sepayReady() && bankFieldsSchema.safeParse(bank).success);
  return {
    ...bank,
    available,
    sandbox,
    provider: sandbox ? "sandbox" : available ? "sepay" : "disabled",
  };
}
export async function paymentConfiguration(
  client: Pick<Tx, "setting"> = db,
): Promise<PaymentInstructions> {
  const setting = await client.setting.findUnique({
    where: { key: BANK_SETTING_KEY },
  });
  if (!setting) return legacyPaymentConfiguration();
  const parsed = bankSettingsSchema.safeParse(setting.value);
  if (!parsed.success)
    return {
      provider: "disabled",
      available: false,
      sandbox: false,
      bankName: "",
      bankBin: "",
      bankAccount: "",
      bankAccountName: "",
    };
  const {
    bankName,
    bankBin,
    bankAccount,
    bankAccountName,
    enabled,
    sepayEnabled,
  } = parsed.data;
  return {
    bankName,
    bankBin,
    bankAccount,
    bankAccountName,
    available: enabled,
    sandbox: false,
    provider: !enabled
      ? "disabled"
      : sepayEnabled && sepayReady()
        ? "sepay"
        : "manual",
  };
}
export function paymentForOrder(order: {
  paymentInstructions: Prisma.JsonValue | null;
}): PaymentInstructions {
  const parsed = paymentInstructionsSchema.safeParse(order.paymentInstructions);
  // Legacy orders retain env-based instructions; never adopt a newly saved bank account.
  return parsed.success ? parsed.data : legacyPaymentConfiguration();
}
export async function adminPaymentConfiguration(): Promise<AdminPaymentSettings> {
  const [payment, setting, site] = await Promise.all([
    paymentConfiguration(),
    db.setting.findUnique({ where: { key: BANK_SETTING_KEY } }),
    db.setting.findUnique({ where: { key: "site" } }),
  ]);
  const bank = bankSettingsSchema.safeParse(setting?.value);
  const flags = site?.value as Record<string, unknown> | null;
  return {
    ...payment,
    enabled: bank.success ? bank.data.enabled : payment.available,
    sepayEnabled: bank.success
      ? bank.data.sepayEnabled
      : payment.provider === "sepay",
    sepayReady: sepayReady(),
    publicConsent: bank.success,
    checkoutEnabled: flags?.checkoutEnabled !== false,
    webhookUrl: new URL(
      "/api/v1/webhooks/sepay",
      env.BETTER_AUTH_URL,
    ).toString(),
  };
}
export async function savePaymentSettings(user: Actor, raw: unknown) {
  if (!user.roleNames.includes("ADMIN")) fail(403, "insufficient_permissions");
  const input = bankSettingsSchema.parse(raw);
  if (input.sepayEnabled && !sepayReady()) fail(409, "sepay_not_configured");
  await serial(async (tx) => {
    const [before, site] = await Promise.all([
      tx.setting.findUnique({ where: { key: BANK_SETTING_KEY } }),
      tx.setting.findUnique({ where: { key: "site" } }),
    ]);
    await tx.setting.upsert({
      where: { key: BANK_SETTING_KEY },
      create: { key: BANK_SETTING_KEY, value: input },
      update: { value: input },
    });
    const current =
      site?.value &&
      typeof site.value === "object" &&
      !Array.isArray(site.value)
        ? site.value
        : {};
    const value = { ...current, checkoutEnabled: input.enabled };
    await tx.setting.upsert({
      where: { key: "site" },
      create: { key: "site", value },
      update: { value },
    });
    const previous = bankSettingsSchema.safeParse(before?.value);
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "payment.settings.update",
        target: BANK_SETTING_KEY,
        metadata: {
          bankBin: input.bankBin,
          accountSuffix: input.bankAccount.slice(-4),
          previousAccountSuffix: previous.success
            ? previous.data.bankAccount.slice(-4)
            : null,
          enabled: input.enabled,
          sepayEnabled: input.sepayEnabled,
          publicConsent: true,
        },
      },
    });
  });
  return adminPaymentConfiguration();
}

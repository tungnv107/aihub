import { z } from "zod";

export const bankFieldsSchema = z.object({
  bankName: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[\p{L}\p{N} .&()-]+$/u),
  bankBin: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
  bankAccount: z
    .string()
    .trim()
    .regex(/^\d{6,19}$/),
  bankAccountName: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[\p{L}\p{N} .,'()-]+$/u)
    .transform((value) => value.toUpperCase()),
});
export const bankSettingsSchema = bankFieldsSchema.extend({
  enabled: z.boolean(),
  sepayEnabled: z.boolean().default(false),
  publicConsent: z.literal(true),
});
export type BankSettings = z.infer<typeof bankSettingsSchema>;
export const paymentInstructionsSchema = z.object({
  provider: z.enum(["disabled", "manual", "sepay", "sandbox"]),
  available: z.boolean(),
  sandbox: z.boolean(),
  bankName: z.string(),
  bankBin: z.string(),
  bankAccount: z.string(),
  bankAccountName: z.string(),
});
export type PaymentInstructions = z.infer<typeof paymentInstructionsSchema>;
export type AdminPaymentSettings = PaymentInstructions & {
  enabled: boolean;
  sepayEnabled: boolean;
  sepayReady: boolean;
  publicConsent: boolean;
  checkoutEnabled: boolean;
  webhookUrl: string;
};
export function bankQrUrl(
  payment: PaymentInstructions,
  amount: number,
  reference: string,
) {
  if (
    !payment.available ||
    payment.sandbox ||
    !bankFieldsSchema.safeParse(payment).success ||
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    !/^AH[A-F0-9]{16}$/.test(reference)
  )
    return null;
  const query = new URLSearchParams({
    amount: String(amount),
    addInfo: reference,
    accountName: payment.bankAccountName,
  });
  return `https://img.vietqr.io/image/${payment.bankBin}-${payment.bankAccount}-compact2.svg?${query}`;
}

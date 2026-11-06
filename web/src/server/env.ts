import { z } from "zod";
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  BETTER_AUTH_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  LICENSE_HASH_SECRET: z.string().min(32),
  LICENSE_ENCRYPTION_KEY: z.string().regex(/^[a-f0-9]{64}$/),
  SUB2API_URL: z.url(),
  SUB2API_ADMIN_TOKEN: z.string().default(""),
  SUB2API_LICENSE_USER_ID: z.coerce.number().int().nonnegative().default(0),
  AIHUB_GATEWAY_SECRET: z.string().min(32),
  SUB2API_ADMIN_API_KEY: z.string().default(""),
  PAYMENT_PROVIDER: z
    .enum(["disabled", "sandbox", "sepay"])
    .default("disabled"),
  SEPAY_WEBHOOK_SECRET: z.string().default(""),
  SEPAY_AUTH_MODE: z.enum(["hmac", "apikey"]).default("hmac"),
  SANDBOX_PAYMENT_SECRET: z.string().default(""),
  BANK_BIN: z.string().default(""),
  BANK_ACCOUNT: z.string().default(""),
  BANK_ACCOUNT_NAME: z.string().default(""),
  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.string().default("true"),
  SMTP_USER: z.string().default(""),
  SMTP_PASSWORD: z.string().default(""),
  MAIL_FROM: z.string().default(""),
  TELEGRAM_BOT_TOKEN: z
    .string()
    .regex(/^(?:\d{5,20}:[A-Za-z0-9_-]{20,100})?$/)
    .default(""),
  TELEGRAM_CHAT_ID: z
    .string()
    .regex(/^(?:-?[1-9]\d{0,19})?$/)
    .default(""),
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  AIHUB_NPM_PACKAGE_NAME: z.string().default(""),
  AIHUB_NPM_PACKAGE_VERSION: z.string().default(""),
  AIHUB_NPM_RELEASE_VERIFIED: z.string().default("false"),
  UPLOAD_DIR: z.string().default(".data/uploads"),
});
export const env = schema.parse(process.env);
export const localSandbox =
  env.PAYMENT_PROVIDER === "sandbox" &&
  process.env.NODE_ENV !== "production" &&
  ["localhost", "127.0.0.1"].includes(new URL(env.BETTER_AUTH_URL).hostname);
if (
  process.env.NODE_ENV === "production" &&
  process.env.NEXT_PHASE !== "phase-production-build"
) {
  if (new URL(env.BETTER_AUTH_URL).protocol !== "https:")
    throw Error("Production requires HTTPS");
  if (env.PAYMENT_PROVIDER === "sandbox")
    throw Error("Sandbox payments forbidden in production");
}

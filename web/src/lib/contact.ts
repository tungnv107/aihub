import { z } from "zod";

export const telegramContactSchema = z
  .string()
  .trim()
  .max(100)
  .refine(
    (value) =>
      !value || /^https:\/\/t\.me\/[A-Za-z][A-Za-z0-9_]{4,31}\/?$/.test(value),
    "Use a Telegram profile URL such as https://t.me/username",
  )
  .transform((value) => value.replace(/\/$/, ""));

export function telegramContact(value: unknown) {
  const parsed = telegramContactSchema.safeParse(value);
  return parsed.success ? parsed.data : "";
}

import nodemailer from "nodemailer";
import { env } from "./env";
import { ApiError } from "./security";
export async function sendMail(to: string, subject: string, text: string) {
  if (!env.SMTP_HOST || !env.MAIL_FROM)
    throw new ApiError(503, "email_not_configured");
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE === "true",
    requireTLS: process.env.NODE_ENV === "production",
    disableFileAccess: true,
    disableUrlAccess: true,
    auth: env.SMTP_USER
      ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
      : undefined,
    connectionTimeout: 10000,
    socketTimeout: 15000,
  });
  await transport.sendMail({ from: env.MAIL_FROM, to, subject, text });
}

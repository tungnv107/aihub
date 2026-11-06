import pino from "pino";
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "password",
      "token",
      "key",
      "authorization",
      "cookie",
      "headers",
      "body",
      "payload",
      "*.keyEncrypted",
      "*.keyHash",
    ],
    remove: true,
  },
});

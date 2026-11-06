import {
  createHash,
  createHmac,
  randomBytes,
  createCipheriv,
  createDecipheriv,
  timingSafeEqual,
} from "node:crypto";
import { Redis } from "ioredis";
import { env } from "./env";
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
export function fail(status: number, code: string): never {
  throw new ApiError(status, code);
}
export const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");
export const keyHash = (key: string) =>
  createHmac("sha256", env.LICENSE_HASH_SECRET).update(key).digest("hex");
export const safeEqual = (a: string, b: string) => {
  const aa = Buffer.from(a),
    bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
};
export function encrypt(text: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv(
      "aes-256-gcm",
      Buffer.from(env.LICENSE_ENCRYPTION_KEY, "hex"),
      iv,
    );
  const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data]
    .map((b) => b.toString("base64url"))
    .join(".");
}
export function decrypt(text: string) {
  const [iv, tag, data] = text
    .split(".")
    .map((x) => Buffer.from(x, "base64url"));
  const cipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(env.LICENSE_ENCRYPTION_KEY, "hex"),
    iv,
  );
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(data), cipher.final()]).toString("utf8");
}
const shared = globalThis as unknown as { aihubRedis?: Redis };
export const redis =
  shared.aihubRedis ??
  new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    enableOfflineQueue: false,
  });
if (process.env.NODE_ENV !== "production") shared.aihubRedis = redis;
redis.on("error", () => {});
export async function readyRedis() {
  if (redis.status === "wait") await redis.connect();
  else if (redis.status !== "ready")
    await new Promise<void>((resolve, reject) => {
      const done = () => {
        redis.off("error", bad);
        resolve();
      };
      const bad = () => {
        redis.off("ready", done);
        reject(new ApiError(503, "rate_limit_unavailable"));
      };
      redis.once("ready", done);
      redis.once("error", bad);
    });
  return redis;
}
export async function limit(bucket: string, max = 60, seconds = 60) {
  await readyRedis();
  const count = Number(
    await redis.eval(
      "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",
      1,
      "limit:" + digest(bucket),
      seconds,
    ),
  );
  if (count > max) fail(429, "too_many_requests");
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin !== new URL(env.BETTER_AUTH_URL).origin)
    fail(403, "origin_not_allowed");
}
export async function readBody(request: Request, max = 65536) {
  const reader = request.body?.getReader();
  if (!reader) return "";
  let size = 0;
  const buffers = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      fail(413, "body_too_large");
    }
    buffers.push(Buffer.from(value));
  }
  return Buffer.concat(buffers).toString("utf8");
}
export function clientBucket(request: Request) {
  return request.headers.get("x-real-ip") ?? "unknown";
}

import { beforeAll, afterAll, afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import { env } from "../src/server/env";
import { redis } from "../src/server/security";
import { checkout } from "../src/server/commerce";
import {
  telegramConfigured,
  telegramOrderKey,
  queueOrderNotification,
  sendOrderNotification,
  orderNotification,
} from "../src/server/telegram";
import { telegramContactSchema, telegramContact } from "../src/lib/contact";
import type { Actor } from "../src/server/auth";
import type { Prisma } from "../src/generated/prisma/client";

const prefix = "telegram-test-" + randomUUID();
const savedEnv = {
  TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID: env.TELEGRAM_CHAT_ID,
};
const fakeToken = "123456:" + "fixture".repeat(5),
  chatId = "123456789";
const orders: string[] = [];
let user: Actor,
  planId: string,
  savedSettings: { key: string; value: Prisma.JsonValue }[];
beforeAll(async () => {
  savedSettings = await db.setting.findMany({
    where: { key: { in: ["site", "payments.bank"] } },
    select: { key: true, value: true },
  });
  await db.setting.upsert({
    where: { key: "site" },
    create: { key: "site", value: { checkoutEnabled: true } },
    update: { value: { checkoutEnabled: true } },
  });
  const bank = {
    bankName: "Fixture bank",
    bankBin: "970415",
    bankAccount: "000123456789",
    bankAccountName: "FIXTURE",
    enabled: true,
    sepayEnabled: false,
    publicConsent: true,
  };
  await db.setting.upsert({
    where: { key: "payments.bank" },
    create: { key: "payments.bank", value: bank },
    update: { value: bank },
  });
  const account = await db.user.create({
    data: {
      id: prefix,
      email: prefix + "@example.test",
      name: "Fixture\nStatus: fake",
      emailVerified: true,
    },
  });
  user = { ...account, roles: [], roleNames: [], sessionId: "fixture" };
  const plan = await db.plan.create({
    data: {
      slug: prefix,
      name: "Telegram test plan",
      description: "Fixture",
      price: 129000,
      durationDays: 7,
      maxDevices: 1,
      active: true,
    },
  });
  planId = plan.id;
  env.TELEGRAM_BOT_TOKEN = fakeToken;
  env.TELEGRAM_CHAT_ID = chatId;
});
afterEach(() => {
  vi.unstubAllGlobals();
});
afterAll(async () => {
  Object.assign(env, savedEnv);
  await db.job.deleteMany({
    where: { dedupeKey: { in: orders.map(telegramOrderKey) } },
  });
  await db.setting.deleteMany({
    where: { key: { in: orders.map((id) => "telegram-sent:" + id) } },
  });
  await db.orderItem.deleteMany({ where: { orderId: { in: orders } } });
  await db.order.deleteMany({ where: { id: { in: orders } } });
  if (planId) await db.plan.delete({ where: { id: planId } });
  await db.user.deleteMany({ where: { id: prefix } });
  await db.setting.deleteMany({
    where: { key: { in: ["site", "payments.bank"] } },
  });
  for (const item of savedSettings)
    await db.setting.create({
      data: { key: item.key, value: item.value as Prisma.InputJsonValue },
    });
  await db.$disconnect();
  redis.disconnect();
});
async function makeOrder() {
  const order = await checkout(user, { planId, billingName: user.name });
  orders.push(order.id);
  return order;
}
const success = () =>
  Response.json({
    ok: true,
    result: { message_id: 321, chat: { id: Number(chatId) } },
  });

it("accepts only direct Telegram profile URLs for the public contact link", () => {
  expect(telegramContact(" https://t.me/tungnv91/ ")).toBe(
    "https://t.me/tungnv91",
  );
  expect(telegramContact(undefined)).toBe("");
  for (const value of [
    "javascript:alert(1)",
    "//t.me/tester",
    "https://t.me.evil.test/tester",
    "https://t.me/tester?redirect=evil",
    "https://t.me/+private-invite",
  ])
    expect(telegramContactSchema.safeParse(value).success).toBe(false);
});

it("atomically queues one notification per real checkout without calling Telegram in checkout", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const order = await makeOrder();
  expect(order.amount).toBe(129000);
  expect(order.status).toBe("PENDING");
  expect(fetcher).not.toHaveBeenCalled();
  await db.$transaction((tx) => queueOrderNotification(tx, order.id));
  expect(
    await db.job.count({ where: { dedupeKey: telegramOrderKey(order.id) } }),
  ).toBe(1);
  expect(
    await db.job.findUnique({
      where: { dedupeKey: telegramOrderKey(order.id) },
    }),
  ).toMatchObject({
    type: "TELEGRAM_ORDER",
    status: "PENDING",
    payload: { orderId: order.id },
  });
  expect(await db.payment.count({ where: { orderId: order.id } })).toBe(0);
  expect(await db.license.count({ where: { orderId: order.id } })).toBe(0);
  const rollbackId = prefix + "-rollback";
  await expect(
    db.$transaction(async (tx) => {
      await queueOrderNotification(tx, rollbackId);
      throw Error("rollback");
    }),
  ).rejects.toThrow("rollback");
  expect(
    await db.job.count({ where: { dedupeKey: telegramOrderKey(rollbackId) } }),
  ).toBe(0);
});

it("sends an accurate plain-text order and persists a receipt so retries do not send again", async () => {
  const order = await makeOrder();
  const fetcher = vi.fn().mockResolvedValue(success());
  vi.stubGlobal("fetch", fetcher);
  await sendOrderNotification(order.id);
  expect(fetcher).toHaveBeenCalledOnce();
  const [url, options] = fetcher.mock.calls[0];
  expect(url).toBe("https://api.telegram.org/bot" + fakeToken + "/sendMessage");
  const body = JSON.parse(options.body);
  expect(body.chat_id).toBe(chatId);
  expect(body.parse_mode).toBeUndefined();
  expect(body.text).toContain(order.code);
  expect(body.text).toContain("129.000");
  expect(body.text).toContain("Chờ thanh toán — chưa xác nhận nhận tiền");
  expect(body.text).toContain("Khách hàng: Fixture Status: fake");
  expect(body.text).not.toContain(fakeToken);
  expect(body.text).not.toContain("000123456789");
  expect(body.reply_markup.inline_keyboard[0][0].url).toBe(
    env.BETTER_AUTH_URL + "/admin/orders?q=" + order.code,
  );
  expect(options.redirect).toBe("error");
  const receipt = await db.setting.findUniqueOrThrow({
    where: { key: "telegram-sent:" + order.id },
  });
  expect(receipt.value).toMatchObject({ messageId: 321, chatId });
  expect(JSON.stringify(receipt.value)).not.toContain(fakeToken);
  await sendOrderNotification(order.id);
  expect(fetcher).toHaveBeenCalledOnce();
});

it("keeps failed delivery retryable and honors Telegram flood-control delay", async () => {
  const order = await makeOrder();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json(
        { ok: false, error_code: 429, parameters: { retry_after: 120 } },
        { status: 429 },
      ),
    )
    .mockResolvedValueOnce(success());
  vi.stubGlobal("fetch", fetcher);
  await expect(sendOrderNotification(order.id)).rejects.toMatchObject({
    name: "TelegramRejected429",
    retryAfterSeconds: 120,
  });
  expect(
    await db.setting.findUnique({
      where: { key: "telegram-sent:" + order.id },
    }),
  ).toBeNull();
  expect(await db.order.findUnique({ where: { id: order.id } })).toMatchObject({
    status: "PENDING",
  });
  expect(
    await db.job.findUnique({
      where: { dedupeKey: telegramOrderKey(order.id) },
    }),
  ).toMatchObject({ status: "PENDING" });
  await sendOrderNotification(order.id);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("never exposes token-bearing network errors and rejects malformed success replies", async () => {
  const order = await makeOrder();
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(
      Error("https://api.telegram.org/bot" + fakeToken + "/sendMessage"),
    )
    .mockResolvedValueOnce(
      Response.json({ ok: true, result: { message_id: "not-an-id" } }),
    );
  vi.stubGlobal("fetch", fetcher);
  await expect(sendOrderNotification(order.id)).rejects.toMatchObject({
    name: "TelegramNetworkError",
    message: "TelegramNetworkError",
  });
  await expect(sendOrderNotification(order.id)).rejects.toThrow(
    "TelegramInvalidResponse",
  );
  expect(
    await db.setting.findUnique({
      where: { key: "telegram-sent:" + order.id },
    }),
  ).toBeNull();
});

it("shows the current order state and does not enable notifications with incomplete configuration", async () => {
  const order = await makeOrder();
  expect(
    orderNotification({ ...order, expiresAt: new Date(0) }).text,
  ).toContain("Trạng thái: Đã hết hạn");
  expect(orderNotification({ ...order, status: "PAID" }).text).toContain(
    "Trạng thái: Đã xác nhận thanh toán",
  );
  env.TELEGRAM_CHAT_ID = "";
  try {
    expect(telegramConfigured()).toBe(false);
    const unconfigured = await makeOrder();
    expect(
      await db.job.count({
        where: { dedupeKey: telegramOrderKey(unconfigured.id) },
      }),
    ).toBe(1);
    await expect(sendOrderNotification(order.id)).rejects.toThrow(
      "TelegramNotConfigured",
    );
    env.TELEGRAM_BOT_TOKEN = "";
    const disabled = await makeOrder();
    expect(
      await db.job.count({
        where: { dedupeKey: telegramOrderKey(disabled.id) },
      }),
    ).toBe(0);
  } finally {
    env.TELEGRAM_CHAT_ID = chatId;
    env.TELEGRAM_BOT_TOKEN = fakeToken;
  }
});

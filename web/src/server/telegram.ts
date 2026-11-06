import { db, type Tx } from "./db";
import { env } from "./env";
import type { Order, OrderItem } from "@/generated/prisma/client";

export const telegramConfigured = () =>
  !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);
export const telegramOrderKey = (id: string) => "telegram-order:" + id;

export async function queueOrderNotification(tx: Tx, orderId: string) {
  // Keep new orders queued while the owner finishes the bot's /start setup.
  if (!env.TELEGRAM_BOT_TOKEN) return;
  await tx.job.upsert({
    where: { dedupeKey: telegramOrderKey(orderId) },
    create: {
      dedupeKey: telegramOrderKey(orderId),
      type: "TELEGRAM_ORDER",
      payload: { orderId },
    },
    update: {},
  });
}

export class TelegramDeliveryError extends Error {
  constructor(
    code: string,
    public retryAfterSeconds = 0,
  ) {
    super(code);
    this.name = code;
  }
}

const line = (value: string, max: number) =>
  value
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

export function orderNotification(order: Order & { items: OrderItem[] }) {
  const statuses: Record<string, string> = {
    PENDING: "Chờ thanh toán — chưa xác nhận nhận tiền",
    PAID: "Đã xác nhận thanh toán",
    CANCELLED: "Đã hủy",
    EXPIRED: "Đã hết hạn",
    FAILED: "Thất bại",
    REFUNDED: "Đã hoàn tiền",
  };
  const status =
    order.status === "PENDING" && order.expiresAt.getTime() <= Date.now()
      ? "EXPIRED"
      : order.status;
  const url = new URL("/admin/orders", env.BETTER_AUTH_URL);
  url.searchParams.set("q", order.code);
  return {
    chat_id: env.TELEGRAM_CHAT_ID,
    text: [
      "🛒 AIHub — Đơn hàng mới",
      "Mã đơn: " + line(order.code, 100),
      "Khách hàng: " + line(order.billingName, 120),
      "Email: " + line(order.billingEmail, 254),
      "Gói: " +
        order.items
          .slice(0, 5)
          .map((item) => line(item.name, 100))
          .join(", "),
      "Số tiền: " +
        new Intl.NumberFormat("vi-VN", {
          style: "currency",
          currency: "VND",
        }).format(order.amount),
      "Trạng thái: " + (statuses[status] ?? status),
      "Tạo lúc: " +
        new Intl.DateTimeFormat("vi-VN", {
          timeZone: "Asia/Ho_Chi_Minh",
          dateStyle: "short",
          timeStyle: "medium",
          hour12: false,
        }).format(order.createdAt) +
        " (giờ Việt Nam)",
    ].join("\n"),
    link_preview_options: { is_disabled: true },
    reply_markup: {
      inline_keyboard: [[{ text: "Xem đơn hàng", url: url.toString() }]],
    },
  };
}

export async function sendOrderNotification(orderId: string) {
  const receiptKey = "telegram-sent:" + orderId;
  // A retry after the worker's completion update fails must not send again.
  if (await db.setting.findUnique({ where: { key: receiptKey } })) return;
  if (!telegramConfigured())
    throw new TelegramDeliveryError("TelegramNotConfigured");
  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: true },
  });
  let response: Response;
  try {
    response = await fetch(
      "https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/sendMessage",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(orderNotification(order)),
        signal: AbortSignal.timeout(10000),
        redirect: "error",
      },
    );
  } catch {
    // Fetch errors can contain the token-bearing URL. Never persist or log them.
    throw new TelegramDeliveryError("TelegramNetworkError");
  }
  let result: {
    ok?: boolean;
    result?: { message_id?: number; chat?: { id?: number } };
    parameters?: { retry_after?: number };
  };
  try {
    result = await response.json();
  } catch {
    throw new TelegramDeliveryError("TelegramInvalidResponse");
  }
  if (!result || typeof result !== "object")
    throw new TelegramDeliveryError("TelegramInvalidResponse");
  if (!response.ok || result.ok !== true) {
    const retry = Number(result.parameters?.retry_after);
    throw new TelegramDeliveryError(
      "TelegramRejected" + response.status,
      Number.isSafeInteger(retry) && retry > 0 ? Math.min(retry, 86400) : 0,
    );
  }
  if (
    !Number.isSafeInteger(result.result?.message_id) ||
    String(result.result?.chat?.id) !== env.TELEGRAM_CHAT_ID
  )
    throw new TelegramDeliveryError("TelegramInvalidResponse");
  await db.setting.upsert({
    where: { key: receiptKey },
    create: {
      key: receiptKey,
      value: {
        messageId: result.result!.message_id!,
        chatId: env.TELEGRAM_CHAT_ID,
        sentAt: new Date().toISOString(),
      },
    },
    update: {},
  });
}

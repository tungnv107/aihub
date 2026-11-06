import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db, serial } from "@/server/db";
import { actor, requireRole, isStaff } from "@/server/auth";
import {
  ApiError,
  fail,
  readBody,
  sameOrigin,
  limit,
  clientBucket,
  digest,
} from "@/server/security";
import { logger } from "@/server/logger";
import {
  checkout,
  checkoutSchema,
  verifyWebhook,
  reconcilePayment,
  manualPayment,
} from "@/server/commerce";
import {
  paymentForOrder,
  adminPaymentConfiguration,
  savePaymentSettings,
} from "@/server/payments";
import { telegramConfigured } from "@/server/telegram";
import {
  challenge,
  bearer,
  deviceSchema,
  deviceAction,
  revealKey,
  manageDevice,
  revokeLicense,
} from "@/server/licenses";
import {
  customerData,
  publicData,
  adminOverview,
  adminList,
} from "@/server/queries";
import {
  ticketSchema,
  createTicket,
  getTicket,
  replyTicket,
  updateTicket,
} from "@/server/support";
import {
  savePlan,
  planSchema,
  updateUser,
  saveContent,
  deleteContent,
  siteSchema,
  extendLicense,
} from "@/server/admin";
import { env } from "@/server/env";
import { csvCell } from "@/server/csv";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
const json = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { "cache-control": "no-store" },
  });
async function handler(request: Request, context: Context) {
  try {
    const { path } = await context.params;
    const [resource, id, action, extra] = path,
      url = new URL(request.url),
      method = request.method;
    if (path.length > 4) fail(404, "not_found");
    if (resource === "health" && method === "GET") {
      await db.$queryRaw`SELECT 1`;
      return json({ status: "ok", service: "aihub" });
    }
    if (resource === "categories" && method === "GET")
      return json(
        await db.contentCategory.findMany({
          orderBy: { sortOrder: "asc" },
          select: { id: true, name: true },
        }),
      );
    if (resource === "public" && method === "GET")
      return json(
        await publicData(url.searchParams.get("locale") === "en" ? "en" : "vi"),
      );
    if (resource === "documents" && method === "GET") {
      const locale = url.searchParams.get("locale") === "en" ? "en" : "vi",
        kind =
          url.searchParams.get("kind") === "help"
            ? "help"
            : url.searchParams.get("kind") === "legal"
              ? "legal"
              : "docs",
        q = url.searchParams.get("q")?.slice(0, 100);
      if (id) {
        const document = await db.document.findFirst({
          where: { slug: id, locale, kind, published: true },
        });
        if (!document) fail(404, "document_not_found");
        return json(document);
      }
      return json(
        await db.document.findMany({
          where: {
            published: true,
            locale,
            kind,
            ...(q
              ? {
                  OR: [
                    { title: { contains: q, mode: "insensitive" } },
                    { body: { contains: q, mode: "insensitive" } },
                  ],
                }
              : {}),
          },
          select: {
            id: true,
            slug: true,
            title: true,
            description: true,
            categoryId: true,
            updatedAt: true,
          },
          orderBy: { sortOrder: "asc" },
          take: 100,
        }),
      );
    }
    if (resource === "webhooks" && method === "POST") {
      const raw = await readBody(request);
      await verifyWebhook(id, raw, request.headers);
      const result = await reconcilePayment(id, raw);
      return json({ success: true, ...result });
    }
    if (resource === "license" && method === "POST") {
      const key = bearer(request);
      await limit("license-ip:" + clientBucket(request), 1200);
      if (id === "challenge") return json(await challenge(key));
      if (
        ["activate", "validate", "heartbeat", "deactivate", "status"].includes(
          id,
        )
      ) {
        const input = deviceSchema.parse(
          JSON.parse(await readBody(request, 4096)),
        );
        return json(
          await deviceAction(
            key,
            id === "status"
              ? "validate"
              : (id as "activate" | "validate" | "heartbeat" | "deactivate"),
            input,
          ),
        );
      }
      fail(404, "not_found");
    }
    const user = await actor(request.headers);
    await limit("api:" + user.id, 240);
    if (method !== "GET") sameOrigin(request);
    const input = async () => JSON.parse(await readBody(request)) as unknown;
    if (resource === "me") {
      if (method === "GET") return json(await customerData(user));
      if (method === "PATCH") {
        const data = z
          .object({
            name: z.string().trim().min(2).max(100),
            locale: z.enum(["vi", "en"]),
            notificationsEnabled: z.boolean(),
          })
          .parse(await input());
        await db.user.update({ where: { id: user.id }, data });
        return json({ updated: true });
      }
    }
    if (resource === "notifications" && method === "POST") {
      await db.notification.updateMany({
        where: { userId: user.id, ...(id ? { id } : {}) },
        data: { readAt: new Date() },
      });
      return json({ updated: true });
    }
    if (resource === "checkout" && method === "POST") {
      await limit("checkout:" + user.id, 10, 3600);
      return json(
        await checkout(user, checkoutSchema.parse(await input())),
        201,
      );
    }
    if (resource === "orders" && id) {
      const order = await db.order.findFirst({
        where: { id, ...(!isStaff(user) ? { userId: user.id } : {}) },
        include: {
          items: true,
          payments: true,
          license: { select: { id: true, status: true } },
        },
      });
      if (!order) fail(404, "order_not_found");
      if (method === "GET" && !action)
        return json({
          ...order,
          status:
            order.status === "PENDING" && order.expiresAt.getTime() < Date.now()
              ? "EXPIRED"
              : order.status,
          payment: paymentForOrder(order),
        });
      if (action === "cancel" && method === "POST") {
        await serial(async (tx) => {
          const changed = await tx.order.updateMany({
            where: { id, status: "PENDING" },
            data: { status: "CANCELLED" },
          });
          if (!changed.count) fail(409, "order_not_pending");
          await tx.auditLog.create({
            data: {
              actorId: user.id,
              action: "order.cancel",
              target: id,
              metadata: {},
            },
          });
        });
        return json({ cancelled: true });
      }
      if (action === "refund-request" && method === "POST") {
        const data = z
          .object({ reason: z.string().trim().min(10).max(2000) })
          .parse(await input());
        if (order.status !== "PAID") fail(409, "order_not_paid");
        await db.order.update({
          where: { id },
          data: { refundRequestedAt: new Date(), refundReason: data.reason },
        });
        return json({ requested: true });
      }
      if (action === "receipt" && method === "GET") {
        if (order.status !== "PAID" && order.status !== "REFUNDED")
          fail(409, "receipt_unavailable");
        const body = [
          "AIHub — Chứng từ giao dịch (không phải hóa đơn VAT)",
          `Mã đơn: ${order.code}`,
          `Khách hàng: ${order.billingName}`,
          `Email: ${order.billingEmail}`,
          `Số tiền: ${order.amount} ${order.currency}`,
          `Trạng thái: ${order.status}`,
          `Thanh toán: ${order.paidAt?.toISOString()}`,
          ...order.payments.map(
            (p) => `Tham chiếu: ${p.provider} / ${p.reference}`,
          ),
        ].join("\n");
        return new Response(body, {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "content-disposition": `attachment; filename="${order.code}.txt"`,
            "cache-control": "no-store",
          },
        });
      }
    }
    if (
      resource === "licenses" &&
      id &&
      action === "reveal" &&
      method === "POST"
    )
      return json(await revealKey(user, id));
    if (resource === "devices" && id && method === "PATCH") {
      const data = z
        .discriminatedUnion("action", [
          z.object({
            action: z.literal("rename"),
            name: z.string().trim().min(1).max(80),
          }),
          z.object({ action: z.literal("revoke") }),
        ])
        .parse(await input());
      return json(await manageDevice(user, id, data));
    }
    if (resource === "tickets") {
      if (!id && method === "POST") {
        await limit("tickets:" + user.id, 10, 3600);
        return json(
          await createTicket(user, ticketSchema.parse(await input())),
          201,
        );
      }
      if (id && method === "GET") return json(await getTicket(user, id));
      if (id && action === "messages" && method === "POST") {
        const data = z
          .object({ body: z.string().trim().min(1).max(10000) })
          .parse(await input());
        return json(await replyTicket(user, id, data.body), 201);
      }
      if (id && method === "PATCH") {
        const data = z
          .object({
            status: z
              .enum([
                "OPEN",
                "IN_PROGRESS",
                "WAITING_CUSTOMER",
                "RESOLVED",
                "CLOSED",
              ])
              .optional(),
            priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
            assigneeId: z.string().nullable().optional(),
          })
          .parse(await input());
        return json(await updateTicket(user, id, data));
      }
    }
    if (
      resource === "documents" &&
      id &&
      action === "feedback" &&
      method === "POST"
    ) {
      const { helpful } = z
        .object({ helpful: z.boolean() })
        .parse(await input());
      const document = await db.document.findFirst({
        where: { id, published: true },
      });
      if (!document) fail(404, "document_not_found");
      const visitorHash = digest(user.id);
      await db.documentFeedback.upsert({
        where: { documentId_visitorHash: { documentId: id, visitorHash } },
        create: { documentId: id, visitorHash, helpful },
        update: { helpful },
      });
      return json({ saved: true });
    }
    if (resource === "admin") {
      requireRole(
        user,
        ...(id === "support" ? ["ADMIN", "SUPPORT"] : ["ADMIN"]),
      );
      if (method === "GET" && id === "overview")
        return json(await adminOverview());
      if (id === "payment-settings" && method === "GET")
        return json(await adminPaymentConfiguration());
      if (id === "payment-settings" && method === "PATCH")
        return json(await savePaymentSettings(user, await input()));
      if (method === "GET" && id === "users" && action && extra === "detail") {
        const target = await db.user.findUnique({
          where: { id: action },
          select: {
            id: true,
            name: true,
            email: true,
            disabled: true,
            emailVerified: true,
            createdAt: true,
            orders: {
              include: { items: true },
              take: 50,
              orderBy: { createdAt: "desc" },
            },
            licenses: {
              select: {
                id: true,
                status: true,
                keySuffix: true,
                expiresAt: true,
                maxDevices: true,
              },
            },
            roles: { include: { role: true } },
          },
        });
        if (!target) fail(404, "user_not_found");
        return json(target);
      }
      if (method === "GET" && id === "settings") {
        const site = await db.setting.findUnique({ where: { key: "site" } });
        return json({
          site: site?.value,
          payment: await adminPaymentConfiguration(),
          emailConfigured: !!env.SMTP_HOST,
          telegramConfigured: telegramConfigured(),
          sub2apiConfigured:
            !!env.SUB2API_ADMIN_API_KEY || !!env.SUB2API_ADMIN_TOKEN,
          releaseVerified: env.AIHUB_NPM_RELEASE_VERIFIED === "true",
        });
      }
      if (method === "GET" && id === "orders" && action === "export") {
        const orders = await db.order.findMany({
          take: 10000,
          orderBy: { createdAt: "desc" },
        });
        const csv =
          "\uFEFF" +
          [
            "code,email,status,amount,currency,createdAt",
            ...orders.map((o) =>
              [
                o.code,
                o.billingEmail,
                o.status,
                o.amount,
                o.currency,
                o.createdAt.toISOString(),
              ]
                .map(csvCell)
                .join(","),
            ),
          ].join("\r\n");
        return new Response(csv, {
          headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": 'attachment; filename="aihub-orders.csv"',
            "cache-control": "no-store",
          },
        });
      }
      if (method === "GET")
        return json(
          await adminList(
            id,
            url.searchParams.get("q")?.slice(0, 100) ?? "",
            Math.max(
              1,
              Math.min(100000, Number(url.searchParams.get("page")) || 1),
            ),
            url.searchParams.get("filter") ?? "",
          ),
        );
      if (id === "plans" && ["POST", "PATCH"].includes(method))
        return json(
          await savePlan(user, action, planSchema.parse(await input())),
        );
      if (id === "plans" && action && method === "DELETE") {
        await db.plan.update({
          where: { id: action },
          data: { active: false },
        });
        await db.auditLog.create({
          data: {
            actorId: user.id,
            action: "plan.archive",
            target: action,
            metadata: {},
          },
        });
        return json({ archived: true });
      }
      if (id === "users" && action && method === "PATCH")
        return json(
          await updateUser(
            user,
            action,
            z
              .object({
                disabled: z.boolean().optional(),
                role: z.enum(["CUSTOMER", "SUPPORT", "ADMIN"]).optional(),
              })
              .parse(await input()),
          ),
        );
      if (
        id === "orders" &&
        action &&
        extra === "reconcile" &&
        method === "POST"
      )
        return json(
          await manualPayment(
            user,
            action,
            z
              .object({
                reference: z.string().trim().min(5).max(100),
                amount: z.number().int().positive(),
                reason: z.string().trim().min(10).max(1000),
              })
              .parse(await input()),
          ),
        );
      if (
        id === "orders" &&
        action &&
        extra === "refund" &&
        method === "POST"
      ) {
        const data = z
          .object({
            reference: z.string().trim().min(5).max(100),
            reason: z.string().trim().min(10).max(1000),
          })
          .parse(await input());
        const refunded = await serial(async (tx) => {
          const order = await tx.order.findUnique({
            where: { id: action },
            include: { license: true },
          });
          if (!order || order.status !== "PAID" || !order.refundRequestedAt)
            fail(409, "refund_request_required");
          await tx.order.update({
            where: { id: action },
            data: { status: "REFUNDED" },
          });
          const licenseId = order.license?.id ?? order.renewalLicenseId;
          if (licenseId) {
            await tx.license.update({
              where: { id: licenseId },
              data: { status: "REVOKED" },
            });
            await tx.job.upsert({
              where: { dedupeKey: "revoke:" + licenseId },
              create: {
                dedupeKey: "revoke:" + licenseId,
                type: "REVOKE",
                payload: { licenseId },
              },
              update: { status: "PENDING", availableAt: new Date() },
            });
          }
          await tx.auditLog.create({
            data: {
              actorId: user.id,
              action: "order.refund_confirmed",
              target: action,
              metadata: data,
            },
          });
          return { refunded: true };
        });
        return json(refunded);
      }
      if (
        id === "licenses" &&
        action &&
        extra === "revoke" &&
        method === "POST"
      ) {
        const data = z
          .object({ reason: z.string().trim().min(10).max(1000) })
          .parse(await input());
        return json(await revokeLicense(user, action, data.reason));
      }
      if (
        id === "licenses" &&
        action &&
        extra === "extend" &&
        method === "POST"
      ) {
        const data = z
          .object({
            days: z.number().int().min(1).max(3650),
            reason: z.string().trim().min(10).max(1000),
          })
          .parse(await input());
        return json(await extendLicense(user, action, data), 201);
      }
      if (id === "licenses" && !action && method === "POST") {
        const data = z
          .object({
            userId: z.string(),
            planId: z.string(),
            reason: z.string().trim().min(10).max(1000),
          })
          .parse(await input());
        const result = await serial(async (tx) => {
          const target = await tx.user.findUniqueOrThrow({
            where: { id: data.userId },
          });
          const plan = await tx.plan.findUniqueOrThrow({
            where: { id: data.planId },
          });
          const order = await tx.order.create({
            data: {
              code:
                "GRANT" + crypto.randomUUID().replaceAll("-", "").toUpperCase(),
              userId: target.id,
              billingName: target.name,
              billingEmail: target.email,
              amount: 0,
              status: "PAID",
              paidAt: new Date(),
              expiresAt: new Date(),
              items: {
                create: {
                  planId: plan.id,
                  name: plan.name,
                  price: 0,
                  durationDays: plan.durationDays,
                  maxDevices: plan.maxDevices,
                },
              },
            },
          });
          await tx.job.create({
            data: {
              dedupeKey: "provision:" + order.id,
              type: "PROVISION",
              payload: { orderId: order.id },
            },
          });
          await tx.auditLog.create({
            data: {
              actorId: user.id,
              action: "license.grant",
              target: order.id,
              metadata: data,
            },
          });
          return order;
        });
        return json(result, 201);
      }
      if (
        [
          "documents",
          "faqs",
          "announcements",
          "testimonials",
          "categories",
        ].includes(id)
      ) {
        if (["POST", "PATCH"].includes(method))
          return json(await saveContent(user, id, action, await input()));
        if (method === "DELETE" && action)
          return json(await deleteContent(user, id, action));
      }
      if (id === "settings" && method === "PATCH") {
        const value = siteSchema.parse(await input());
        await serial(async (tx) => {
          await tx.setting.upsert({
            where: { key: "site" },
            create: { key: "site", value },
            update: { value },
          });
          await tx.auditLog.create({
            data: {
              actorId: user.id,
              action: "settings.update",
              target: "site",
              metadata: {},
            },
          });
        });
        return json({ saved: true });
      }
      if (id === "jobs" && action && method === "POST") {
        await db.job.updateMany({
          where: { id: action, status: "PENDING" },
          data: { availableAt: new Date() },
        });
        await db.auditLog.create({
          data: {
            actorId: user.id,
            action: "job.retry",
            target: action,
            metadata: {},
          },
        });
        return json({ scheduled: true });
      }
    }
    fail(404, "not_found");
  } catch (error) {
    if (error instanceof ApiError)
      return json({ error: { code: error.code } }, error.status);
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return json({ error: { code: "invalid_input" } }, 400);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002", "P2025"].includes(error.code)
    )
      return json(
        {
          error: {
            code: error.code === "P2002" ? "already_exists" : "not_found",
          },
        },
        error.code === "P2002" ? 409 : 404,
      );
    logger.error(
      { errorType: error instanceof Error ? error.name : "UnknownError" },
      "API request failed",
    );
    return json({ error: { code: "service_unavailable" } }, 503);
  }
}
export { handler as GET, handler as POST, handler as PATCH, handler as DELETE };

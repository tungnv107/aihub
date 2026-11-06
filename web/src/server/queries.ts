import { db } from "./db";
import { env } from "./env";
import { paymentConfiguration } from "./commerce";
import type { Actor } from "./auth";
import {
  OrderStatus,
  LicenseStatus,
  TicketStatus,
} from "@/generated/prisma/enums";
import { adminFilters } from "@/lib/admin-filters";
export const publicLicense = {
  id: true,
  orderId: true,
  keySuffix: true,
  status: true,
  maxDevices: true,
  activatedAt: true,
  expiresAt: true,
  createdAt: true,
  deviceChangeAfter: true,
  devices: {
    select: {
      id: true,
      name: true,
      os: true,
      fingerprint: true,
      activatedAt: true,
      lastSeenAt: true,
      revokedAt: true,
    },
  },
  events: { orderBy: { createdAt: "desc" as const }, take: 30 },
  order: { select: { code: true, items: true } },
} as const;
export async function customerData(user: Actor) {
  const [
    licenses,
    orders,
    tickets,
    notifications,
    usage,
    quota,
    announcements,
  ] = await Promise.all([
    db.license.findMany({
      where: { userId: user.id },
      select: publicLicense,
      orderBy: { createdAt: "desc" },
    }),
    db.order.findMany({
      where: { userId: user.id },
      include: { items: true, payments: true },
      take: 100,
      orderBy: { createdAt: "desc" },
    }),
    db.ticket.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    db.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    db.usageAggregate.findMany({
      where: {
        userId: user.id,
        day: { gte: new Date(Date.now() - 90 * 86400000) },
      },
      orderBy: { day: "asc" },
    }),
    db.quotaSnapshot.findFirst({
      where: { userId: user.id },
      orderBy: { capturedAt: "desc" },
    }),
    db.announcement.findMany({
      where: { published: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);
  return {
    licenses,
    orders,
    tickets,
    notifications,
    usage,
    quota,
    announcements,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      locale: user.locale,
      notificationsEnabled: user.notificationsEnabled,
      roles: user.roleNames,
    },
  };
}
export async function publicData(locale = "vi") {
  const [plans, faqs, testimonials, site] = await Promise.all([
    db.plan.findMany({
      where: { active: true },
      include: { features: { orderBy: { sortOrder: "asc" } } },
      orderBy: { sortOrder: "asc" },
    }),
    db.fAQ.findMany({
      where: { published: true, locale },
      orderBy: { sortOrder: "asc" },
    }),
    db.testimonial.findMany({ where: { verified: true, published: true } }),
    db.setting.findUnique({ where: { key: "site" } }),
  ]);
  return {
    plans,
    faqs,
    testimonials,
    site: site?.value,
    payment: paymentConfiguration(),
    release:
      env.AIHUB_NPM_RELEASE_VERIFIED === "true" &&
      env.AIHUB_NPM_PACKAGE_NAME &&
      env.AIHUB_NPM_PACKAGE_VERSION
        ? { name: env.AIHUB_NPM_PACKAGE_NAME, version: env.AIHUB_NPM_PACKAGE_VERSION }
        : null,
    googleEnabled: !!env.GOOGLE_CLIENT_ID,
    emailConfigured: !!env.SMTP_HOST,
  };
}
export async function adminOverview() {
  const [
    users,
    orders,
    licenses,
    tickets,
    revenue,
    recentOrders,
    recentUsers,
    payments,
    planDistribution,
    jobs,
  ] = await Promise.all([
    db.user.count(),
    db.order.count(),
    db.license.count({
      where: { status: "ACTIVE", expiresAt: { gt: new Date() } },
    }),
    db.ticket.count({
      where: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER"] } },
    }),
    db.order.aggregate({ where: { status: "PAID" }, _sum: { amount: true } }),
    db.order.findMany({
      take: 6,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, email: true } } },
    }),
    db.user.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, email: true, createdAt: true },
    }),
    db.order.findMany({
      where: {
        status: "PAID",
        paidAt: { gte: new Date(Date.now() - 30 * 86400000) },
      },
      select: { amount: true, paidAt: true },
    }),
    db.subscription.groupBy({ by: ["planId"], _count: true }),
    db.job.count({ where: { status: "PENDING", attempts: { gt: 0 } } }),
  ]);
  const planNames = await db.plan.findMany({
    where: { id: { in: planDistribution.map((p) => p.planId) } },
    select: { id: true, name: true },
  });
  const orderStatuses = await db.order.groupBy({
    by: ["status"],
    _count: true,
  });
  const expired = await db.license.count({
    where: { status: "ACTIVE", expiresAt: { lte: new Date() } },
  });
  return {
    users,
    orders,
    licenses,
    tickets,
    revenue: revenue._sum.amount ?? 0,
    recentOrders,
    recentUsers,
    payments,
    planDistribution,
    jobs,
    expired,
    orderStatuses,
    distribution: planDistribution.map((p) => ({
      label: planNames.find((n) => n.id === p.planId)?.name ?? p.planId,
      value: p._count,
    })),
  };
}
export async function adminList(
  resource: string,
  search: string,
  page: number,
  requestedFilter = "",
) {
  const filter = adminFilters[resource]?.includes(requestedFilter)
    ? requestedFilter
    : "";
  const published = filter ? { published: filter === "PUBLISHED" } : {};
  const skip = (page - 1) * 20,
    take = 20;
  const text = { contains: search, mode: "insensitive" as const };
  switch (resource) {
    case "categories": {
      const where = search ? { name: text } : {};
      return {
        rows: await db.contentCategory.findMany({
          where,
          skip,
          take,
          orderBy: { sortOrder: "asc" },
        }),
        total: await db.contentCategory.count({ where }),
      };
    }
    case "users": {
      const where = {
        ...(search ? { OR: [{ email: text }, { name: text }] } : {}),
        ...(filter === "UNVERIFIED"
          ? { emailVerified: false }
          : filter
            ? { disabled: filter === "DISABLED" }
            : {}),
      };
      return {
        rows: await db.user.findMany({
          where,
          skip,
          take,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            name: true,
            email: true,
            disabled: true,
            emailVerified: true,
            createdAt: true,
            roles: { include: { role: true } },
            _count: { select: { licenses: true, orders: true } },
          },
        }),
        total: await db.user.count({ where }),
      };
    }
    case "plans": {
      const where = {
        ...(search ? { name: text } : {}),
        ...(filter ? { active: filter === "ACTIVE" } : {}),
      };
      return {
        rows: await db.plan.findMany({
          where,
          skip,
          take,
          include: { features: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        }),
        total: await db.plan.count({ where }),
      };
    }
    case "orders": {
      const where = {
        ...(search ? { OR: [{ code: text }, { billingEmail: text }] } : {}),
        ...(filter ? { status: filter as OrderStatus } : {}),
      };
      return {
        rows: await db.order.findMany({
          where,
          skip,
          take,
          include: {
            items: true,
            payments: true,
            user: { select: { name: true, email: true } },
          },
          orderBy: { createdAt: "desc" },
        }),
        total: await db.order.count({ where }),
      };
    }
    case "licenses": {
      const where = {
        ...(search
          ? { OR: [{ keySuffix: text }, { user: { email: text } }] }
          : {}),
        ...(filter === "EXPIRED"
          ? { status: LicenseStatus.ACTIVE, expiresAt: { lte: new Date() } }
          : filter === "ACTIVE"
            ? { status: LicenseStatus.ACTIVE, expiresAt: { gt: new Date() } }
            : filter
              ? { status: filter as LicenseStatus }
              : {}),
      };
      return {
        rows: await db.license.findMany({
          where,
          skip,
          take,
          select: {
            ...publicLicense,
            user: { select: { name: true, email: true } },
          },
          orderBy: { createdAt: "desc" },
        }),
        total: await db.license.count({ where }),
      };
    }
    case "support": {
      const where = {
        ...(search
          ? { OR: [{ subject: text }, { user: { email: text } }] }
          : {}),
        ...(filter
          ? ["LOW", "NORMAL", "HIGH", "URGENT"].includes(filter)
            ? { priority: filter }
            : { status: filter as TicketStatus }
          : {}),
      };
      return {
        rows: await db.ticket.findMany({
          where,
          skip,
          take,
          include: {
            user: { select: { name: true, email: true } },
            _count: { select: { messages: true } },
          },
          orderBy: { updatedAt: "desc" },
        }),
        total: await db.ticket.count({ where }),
      };
    }
    case "documents": {
      const where = { ...(search ? { title: text } : {}), ...published };
      return {
        rows: await db.document.findMany({
          where,
          skip,
          take,
          orderBy: { updatedAt: "desc" },
        }),
        total: await db.document.count({ where }),
      };
    }
    case "faqs": {
      const where = {
        ...(search ? { OR: [{ question: text }, { answer: text }] } : {}),
        ...published,
      };
      return {
        rows: await db.fAQ.findMany({
          where,
          skip,
          take,
          orderBy: { sortOrder: "asc" },
        }),
        total: await db.fAQ.count({ where }),
      };
    }
    case "announcements": {
      const where = {
        ...(search ? { OR: [{ title: text }, { body: text }] } : {}),
        ...published,
      };
      return {
        rows: await db.announcement.findMany({
          where,
          skip,
          take,
          orderBy: { createdAt: "desc" },
        }),
        total: await db.announcement.count({ where }),
      };
    }
    case "testimonials": {
      const where = {
        ...(search ? { OR: [{ name: text }, { quote: text }] } : {}),
        ...published,
      };
      return {
        rows: await db.testimonial.findMany({ where, skip, take }),
        total: await db.testimonial.count({ where }),
      };
    }
    case "audit": {
      const where = search ? { OR: [{ action: text }, { target: text }] } : {};
      return {
        rows: await db.auditLog.findMany({
          where,
          skip,
          take,
          orderBy: { createdAt: "desc" },
        }),
        total: await db.auditLog.count({ where }),
      };
    }
    case "jobs": {
      const where = {
        ...(search ? { type: text } : {}),
        ...(filter ? { status: filter } : {}),
      };
      return {
        rows: await db.job.findMany({
          where,
          skip,
          take,
          select: {
            id: true,
            type: true,
            status: true,
            attempts: true,
            lastError: true,
            availableAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        }),
        total: await db.job.count({ where }),
      };
    }
    default:
      return { rows: [], total: 0 };
  }
}

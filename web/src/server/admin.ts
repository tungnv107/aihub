import { z } from "zod";
import { serial } from "./db";
import { fail } from "./security";
import type { Actor } from "./auth";
export const planSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{2,80}$/),
  name: z.string().trim().min(2).max(80),
  description: z.string().max(500),
  price: z.number().int().min(1000).max(2_000_000_000),
  originalPrice: z.number().int().positive().nullable().optional(),
  durationDays: z.number().int().min(1).max(3650),
  maxDevices: z.number().int().min(1).max(100),
  active: z.boolean(),
  recommended: z.boolean(),
  sortOrder: z.number().int().min(0).max(999),
  features: z.array(z.string().trim().min(1).max(150)).max(20),
});
export async function savePlan(
  user: Actor,
  id: string | undefined,
  input: z.infer<typeof planSchema>,
) {
  return serial(async (tx) => {
    const { features, ...data } = input;
    const before = id ? await tx.plan.findUnique({ where: { id } }) : null;
    if (id && !before) fail(404, "plan_not_found");
    const plan = id
      ? await tx.plan.update({
          where: { id },
          data: {
            ...data,
            features: {
              deleteMany: {},
              create: features.map((label, sortOrder) => ({
                label,
                sortOrder,
              })),
            },
          },
        })
      : await tx.plan.create({
          data: {
            ...data,
            features: {
              create: features.map((label, sortOrder) => ({
                label,
                sortOrder,
              })),
            },
          },
        });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "plan.save",
        target: plan.id,
        metadata: { oldPrice: before?.price ?? null, newPrice: plan.price },
      },
    });
    return plan;
  });
}
export async function updateUser(
  admin: Actor,
  id: string,
  input: { disabled?: boolean; role?: "CUSTOMER" | "SUPPORT" | "ADMIN" },
) {
  return serial(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id },
      include: { roles: { include: { role: true } } },
    });
    if (!user) fail(404, "user_not_found");
    if (
      admin.id === id &&
      (input.disabled || (input.role && input.role !== "ADMIN"))
    )
      fail(409, "cannot_remove_own_admin_access");
    if (
      user.roles.some((r) => r.role.name === "ADMIN") &&
      (input.disabled || (input.role && input.role !== "ADMIN"))
    ) {
      const admins = await tx.user.count({
        where: {
          disabled: false,
          roles: { some: { role: { name: "ADMIN" } } },
        },
      });
      if (admins <= 1) fail(409, "last_admin_required");
    }
    if (input.disabled !== undefined) {
      await tx.user.update({
        where: { id },
        data: { disabled: input.disabled },
      });
      if (input.disabled)
        await tx.session.deleteMany({ where: { userId: id } });
    }
    if (input.role) {
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.create({ data: { userId: id, roleId: input.role } });
    }
    await tx.auditLog.create({
      data: {
        actorId: admin.id,
        action: "user.update",
        target: id,
        metadata: input,
      },
    });
    return { updated: true };
  });
}
export const documentSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{2,120}$/),
  title: z.string().min(2).max(180),
  description: z.string().max(300),
  body: z.string().max(100000),
  locale: z.enum(["vi", "en"]),
  kind: z.enum(["docs", "help", "legal"]),
  published: z.boolean(),
  sortOrder: z.number().int().min(0).max(999),
  categoryId: z.preprocess(
    (v) => (v === "" ? null : v),
    z.string().nullable().optional(),
  ),
});
export const faqSchema = z.object({
  question: z.string().min(2).max(300),
  answer: z.string().min(2).max(3000),
  locale: z.enum(["vi", "en"]),
  published: z.boolean(),
  sortOrder: z.number().int().min(0).max(999),
});
export const announcementSchema = z.object({
  title: z.string().min(2).max(180),
  body: z.string().min(2).max(3000),
  published: z.boolean(),
});
export const testimonialSchema = z
  .object({
    name: z.string().min(2).max(100),
    role: z.string().max(120),
    quote: z.string().min(10).max(1500),
    consentReference: z.string().min(5).max(300),
    verified: z.boolean(),
    published: z.boolean(),
  })
  .refine(
    (v) => !v.published || v.verified,
    "Published testimonials require verification",
  );
export const siteSchema = z.object({
  maintenanceMode: z.boolean().default(false),
  registrationEnabled: z.boolean().default(true),
  checkoutEnabled: z.boolean().default(true),
  name: z.string().min(2).max(50),
  headline: z.string().min(5).max(160),
  description: z.string().min(5).max(500),
  contactEmail: z.email(),
  supportHours: z.string().max(150),
  seoTitle: z.string().max(100),
  seoDescription: z.string().max(200),
});
export async function extendLicense(
  user: Actor,
  licenseId: string,
  input: { days: number; reason: string },
) {
  return serial(async (tx) => {
    const license = await tx.license.findUnique({
      where: { id: licenseId },
      include: { user: true, subscription: true },
    });
    if (!license || license.status !== "ACTIVE" || !license.subscription)
      fail(409, "renewal_license_inactive");
    const plan = await tx.plan.findUniqueOrThrow({
      where: { id: license.subscription.planId },
    });
    const order = await tx.order.create({
      data: {
        code: "EXTEND" + crypto.randomUUID().replaceAll("-", "").toUpperCase(),
        userId: license.userId,
        billingName: license.user.name,
        billingEmail: license.user.email,
        amount: 0,
        status: "PAID",
        paidAt: new Date(),
        expiresAt: new Date(),
        renewalLicenseId: licenseId,
        items: {
          create: {
            planId: plan.id,
            name: plan.name,
            price: 0,
            durationDays: input.days,
            maxDevices: license.maxDevices,
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
        action: "license.extend",
        target: licenseId,
        metadata: { ...input, orderId: order.id },
      },
    });
    return order;
  });
}
export async function saveContent(
  user: Actor,
  kind: string,
  id: string | undefined,
  raw: unknown,
) {
  return serial(async (tx) => {
    let saved: { id: string };
    if (kind === "categories") {
      const data = z
        .object({
          name: z.string().min(2).max(100),
          slug: z.string().regex(/^[a-z0-9-]{2,100}$/),
          sortOrder: z.number().int().min(0).max(999),
        })
        .parse(raw);
      saved = id
        ? await tx.contentCategory.update({ where: { id }, data })
        : await tx.contentCategory.create({ data });
    } else if (kind === "documents") {
      const data = documentSchema.parse(raw);
      saved = id
        ? await tx.document.update({ where: { id }, data })
        : await tx.document.create({ data });
    } else if (kind === "faqs") {
      const data = faqSchema.parse(raw);
      saved = id
        ? await tx.fAQ.update({ where: { id }, data })
        : await tx.fAQ.create({ data });
    } else if (kind === "announcements") {
      const data = announcementSchema.parse(raw);
      saved = id
        ? await tx.announcement.update({ where: { id }, data })
        : await tx.announcement.create({ data });
    } else if (kind === "testimonials") {
      const data = testimonialSchema.parse(raw);
      saved = id
        ? await tx.testimonial.update({ where: { id }, data })
        : await tx.testimonial.create({ data });
    } else return fail(404, "content_kind_not_found");
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "content.save",
        target: saved.id,
        metadata: { kind },
      },
    });
    return saved;
  });
}
export async function deleteContent(user: Actor, kind: string, id: string) {
  return serial(async (tx) => {
    if (kind === "categories") {
      await tx.document.updateMany({
        where: { categoryId: id },
        data: { categoryId: null },
      });
      await tx.contentCategory.delete({ where: { id } });
    } else if (kind === "documents")
      await tx.document.delete({ where: { id } });
    else if (kind === "faqs") await tx.fAQ.delete({ where: { id } });
    else if (kind === "announcements")
      await tx.announcement.delete({ where: { id } });
    else if (kind === "testimonials")
      await tx.testimonial.delete({ where: { id } });
    else fail(404, "content_kind_not_found");
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "content.delete",
        target: id,
        metadata: { kind },
      },
    });
    return { deleted: true };
  });
}

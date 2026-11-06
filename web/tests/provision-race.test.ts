import { it, expect, afterAll, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import { redis } from "../src/server/security";
import { provisionOrder } from "../src/server/provision";
import { upstreamRevoke } from "../src/server/licenses";
const id = "race-" + randomUUID();
let planId: string, orderId: string, licenseId: string;
afterAll(async () => {
  vi.restoreAllMocks();
  if (licenseId) await upstreamRevoke(licenseId);
  await db.$transaction(async (tx) => {
    await tx.job.deleteMany({
      where: {
        dedupeKey: { in: ["provision:" + orderId, "revoke:" + licenseId] },
      },
    });
    await tx.licenseEvent.deleteMany({ where: { licenseId } });
    await tx.license.deleteMany({ where: { userId: id } });
    await tx.orderItem.deleteMany({ where: { orderId } });
    await tx.order.deleteMany({ where: { userId: id } });
    if (planId) await tx.plan.deleteMany({ where: { id: planId } });
    await tx.user.deleteMany({ where: { id } });
  });
  await db.$disconnect();
  redis.disconnect();
});
it("keeps access revoked when a refund races upstream key creation and reschedules cleanup", async () => {
  await db.user.create({
    data: {
      id,
      email: id + "@example.test",
      name: "Race fixture",
      emailVerified: true,
    },
  });
  const plan = await db.plan.create({
    data: {
      slug: id,
      name: "Race test",
      description: "Test",
      price: 1000,
      durationDays: 1,
      maxDevices: 1,
    },
  });
  planId = plan.id;
  const order = await db.order.create({
    data: {
      code: id,
      userId: id,
      billingName: "Race fixture",
      billingEmail: id + "@example.test",
      amount: 1000,
      status: "PAID",
      paidAt: new Date(),
      expiresAt: new Date(),
      items: {
        create: {
          planId,
          name: "Race test",
          price: 1000,
          durationDays: 1,
          maxDevices: 1,
        },
      },
    },
  });
  orderId = order.id;
  const original = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (...args) => {
    const response = await original(...args);
    if (
      String(args[0]).endsWith("/api/v1/admin/ch-relay/licenses") &&
      args[1]?.method === "POST"
    ) {
      const license = await db.license.findUniqueOrThrow({
        where: { orderId },
      });
      licenseId = license.id;
      await db.order.update({
        where: { id: orderId },
        data: { status: "REFUNDED", refundRequestedAt: new Date() },
      });
      await db.license.update({
        where: { id: licenseId },
        data: { status: "REVOKED" },
      });
      await db.job.create({
        data: {
          dedupeKey: "revoke:" + licenseId,
          type: "REVOKE",
          payload: { licenseId },
          status: "DONE",
          completedAt: new Date(),
        },
      });
    }
    return response;
  });
  await provisionOrder(orderId);
  vi.restoreAllMocks();
  const license = await db.license.findUniqueOrThrow({
    where: { id: licenseId },
  });
  expect(license.status).toBe("REVOKED");
  expect(license.upstreamKeyId).toBeGreaterThan(0);
  expect(
    (
      await db.job.findUniqueOrThrow({
        where: { dedupeKey: "revoke:" + licenseId },
      })
    ).status,
  ).toBe("PENDING");
  expect(await db.subscription.count({ where: { licenseId } })).toBe(0);
});

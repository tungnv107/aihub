import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import path from "node:path";
import { db } from "../../src/server/db";

const base = process.env.BETTER_AUTH_URL!,
  prefix = "bank-ui-" + randomUUID(),
  password = "Fixture-" + randomUUID();
let planId: string;
test.beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))
    throw Error("Bank UI test requires a dedicated test database");
  await db.role.upsert({
    where: { id: "ADMIN" },
    create: { id: "ADMIN", name: "ADMIN" },
    update: {},
  });
  const hash = await hashPassword(password);
  for (const suffix of ["admin", "customer"]) {
    const id = prefix + suffix;
    await db.user.create({
      data: {
        id,
        email: id + "@example.test",
        name: "Bank UI " + suffix,
        emailVerified: true,
        roles: suffix === "admin" ? { create: { roleId: "ADMIN" } } : undefined,
        accounts: {
          create: {
            id: randomUUID(),
            accountId: id,
            providerId: "credential",
            password: hash,
          },
        },
      },
    });
  }
  const plan = await db.plan.create({
    data: {
      slug: prefix,
      name: "Bank payment UI test",
      description: "Local test only",
      price: 99000,
      durationDays: 30,
      maxDevices: 1,
      active: true,
    },
  });
  planId = plan.id;
});
test.afterAll(async () => {
  await db.$disconnect();
});
test("admin sets a bank without SePay; customer receives a stable QR and manual reconciliation completes the order", async ({
  page,
  browser,
}) => {
  await page.goto("/login");
  await page
    .getByLabel("Email", { exact: true })
    .fill(prefix + "admin@example.test");
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.waitForURL(/\/dashboard/);
  await page.goto("/admin/settings");
  const panel = page.getByRole("region", {
    name: "Tài khoản ngân hàng nhận tiền",
  });
  await panel.getByLabel("Tên ngân hàng", { exact: true }).fill("VIETINBANK");
  await panel.getByLabel("Mã BIN ngân hàng", { exact: false }).fill("970415");
  await panel.getByLabel("Số tài khoản", { exact: true }).fill("000123456789");
  await panel
    .getByLabel("Tên chủ tài khoản", { exact: true })
    .fill("BANK UI TEST FIXTURE");
  await panel
    .getByLabel(
      "Tôi có quyền và đồng ý hiển thị thông tin nhận tiền này cho khách hàng.",
      { exact: true },
    )
    .check();
  await panel
    .getByLabel("Mở mua gói bằng chuyển khoản ngân hàng", { exact: true })
    .check();
  await panel
    .getByText("SePay — tự động đối soát (tùy chọn)", { exact: true })
    .click();
  await expect(
    panel.getByLabel("Bật đối soát tự động qua SePay", { exact: true }),
  ).toBeDisabled();
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/v1/admin/payment-settings") &&
      r.request().method() === "PATCH",
  );
  await panel
    .getByRole("button", { name: "Lưu thông tin thanh toán", exact: true })
    .click();
  expect((await saved).status()).toBe(200);
  await expect(panel.getByText("Đã cấu hình", { exact: true })).toBeVisible();
  await page.screenshot({
    path: path.resolve("../.runtime/bank-admin-desktop.png"),
    fullPage: true,
  });
  const customer = await browser.newPage();
  await customer.goto(base + "/login");
  await customer
    .getByLabel("Email", { exact: true })
    .fill(prefix + "customer@example.test");
  await customer.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await customer
    .getByRole("button", { name: "Đăng nhập", exact: true })
    .click();
  await customer.waitForURL(/\/dashboard/);
  await customer.goto(base + "/checkout?plan=" + planId);
  await customer.getByRole("checkbox").check();
  await customer
    .getByRole("button", { name: "Tạo đơn & xem mã QR", exact: true })
    .click();
  await customer.waitForURL(/\/orders\//);
  const orderId = new URL(customer.url()).pathname.split("/").at(-1)!;
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  expect(order.status).toBe("PENDING");
  expect(await db.payment.count({ where: { orderId } })).toBe(0);
  expect(await db.license.count({ where: { orderId } })).toBe(0);
  const qr = customer.getByRole("img", { name: "Mã QR thanh toán đơn hàng" });
  await expect(qr).toBeVisible();
  const original = await qr.getAttribute("src"),
    url = new URL(original!);
  expect(url.pathname).toContain("970415-000123456789-compact2.svg");
  expect(url.searchParams.get("amount")).toBe("99000");
  expect(url.searchParams.get("addInfo")).toBe(order.code);
  await expect
    .poll(
      () =>
        qr.evaluate(
          (element: HTMLImageElement) =>
            element.complete && element.naturalWidth > 0,
        ),
      { timeout: 30000 },
    )
    .toBe(true);
  await expect(
    customer.getByText(/Hiển thị mã QR chưa phải thanh toán thành công/),
  ).toBeVisible();
  await customer.screenshot({
    path: path.resolve("../.runtime/bank-order-desktop.png"),
    fullPage: true,
  });
  await customer.setViewportSize({ width: 390, height: 844 });
  expect(
    await customer.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await customer.screenshot({
    path: path.resolve("../.runtime/bank-order-mobile.png"),
    fullPage: true,
  });
  await panel.getByLabel("Số tài khoản", { exact: true }).fill("999123456789");
  const edited = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/v1/admin/payment-settings") &&
      r.request().method() === "PATCH",
  );
  await panel
    .getByRole("button", { name: "Lưu thông tin thanh toán", exact: true })
    .click();
  expect((await edited).status()).toBe(200);
  await customer.reload();
  await expect(qr).toHaveAttribute("src", original!);
  const forbidden = await customer.request.post(
    base + "/api/v1/admin/orders/" + orderId + "/reconcile",
    {
      headers: { origin: base },
      data: {
        amount: 99000,
        reference: prefix,
        reason: "Unauthorized fixture reconciliation",
      },
    },
  );
  expect(forbidden.status()).toBe(403);
  await page.goto("/admin/orders?q=" + order.code);
  await page.getByRole("button", { name: "Đối soát", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Mã giao dịch / Transaction reference", { exact: true })
    .fill(prefix);
  await dialog
    .getByLabel("Lý do đối soát / Reconciliation reason", { exact: true })
    .fill("Local fixture: bank statement verified by admin");
  const reconciled = page.waitForResponse(
    (r) => r.url().endsWith("/reconcile") && r.request().method() === "POST",
  );
  await dialog
    .getByRole("button", { name: "Lưu thay đổi", exact: true })
    .click();
  expect((await reconciled).status()).toBe(200);
  await expect(
    customer.getByRole("heading", {
      name: "Thanh toán đã xác nhận",
      exact: true,
    }),
  ).toBeVisible();
  await expect(qr).toHaveCount(0);
  expect(
    await db.job.count({ where: { dedupeKey: "provision:" + orderId } }),
  ).toBe(1);
  await customer.close();
});

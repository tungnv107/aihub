import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import path from "node:path";
import { db } from "../../src/server/db";

const id = "contact-ui-" + randomUUID(),
  email = id + "@example.test",
  password = "Fixture-" + randomUUID();
test.beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))
    throw Error("Dedicated test database required");
  await db.role.upsert({
    where: { id: "ADMIN" },
    create: { id: "ADMIN", name: "ADMIN" },
    update: {},
  });
  await db.user.create({
    data: {
      id,
      email,
      name: "Contact fixture",
      emailVerified: true,
      roles: { create: { roleId: "ADMIN" } },
      accounts: {
        create: {
          id: randomUUID(),
          accountId: id,
          providerId: "credential",
          password: await hashPassword(password),
        },
      },
    },
  });
  const site = {
    name: "AIHub",
    headline: "AIHub contact UI fixture",
    description: "Contact integration test fixture",
    contactEmail: "fixture@example.test",
    supportHours: "",
    seoTitle: "AIHub",
    seoDescription: "Fixture",
    maintenanceMode: false,
    registrationEnabled: false,
    checkoutEnabled: false,
  };
  await db.setting.upsert({
    where: { key: "site" },
    create: { key: "site", value: site },
    update: { value: site },
  });
});
test.afterAll(async () => {
  await db.$disconnect();
});

test("admin saves Telegram contact; public footer and support show the correct safe link", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.waitForURL(/\/dashboard/);
  await page.goto("/admin/settings");
  await page
    .getByLabel("Telegram hỗ trợ (https://t.me/username) / Support Telegram", {
      exact: true,
    })
    .fill("https://t.me/tungnv91");
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/v1/admin/settings") &&
      r.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  expect((await saved).status()).toBe(200);
  await page.goto("/");
  const contact = page.getByRole("link", {
    name: "Telegram: @tungnv91",
    exact: true,
  });
  await expect(contact).toHaveAttribute("href", "https://t.me/tungnv91");
  await expect(contact).toHaveAttribute("rel", "noopener noreferrer");
  await page
    .locator(".site-footer")
    .screenshot({
      path: path.resolve("../.runtime/telegram-footer-desktop.png"),
    });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .locator(".site-footer")
    .screenshot({
      path: path.resolve("../.runtime/telegram-footer-mobile.png"),
    });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.goto("/support");
  await expect(
    page.getByRole("link", {
      name: "Liên hệ hỗ trợ qua Telegram: @tungnv91",
      exact: true,
    }),
  ).toHaveAttribute("href", "https://t.me/tungnv91");
  await page.screenshot({
    path: path.resolve("../.runtime/telegram-support-mobile.png"),
    fullPage: true,
  });
});

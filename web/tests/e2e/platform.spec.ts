import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID, createHmac } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
// @ts-expect-error Existing JavaScript CLI module is exercised directly in this integration test.
import { Sub2ApiLicense } from "../../../ch_relay/sub2api-license.mjs";
// @ts-expect-error Existing JavaScript credential store is exercised directly in this integration test.
import { CredentialStore } from "../../../ch_relay/credentials.mjs";
import fs from "node:fs";
import path from "node:path";
const base = process.env.BETTER_AUTH_URL!,
  email = "e2e-" + randomUUID() + "@example.test",
  password = "Test-only-" + randomUUID();
let userId: string,
  orderId: string,
  licenseId: string,
  licenseKey: string,
  ticketId: string;
const extraUsers: string[] = [],
  fixturePlans: string[] = [];
async function request(
  api: APIRequestContext,
  route: string,
  body: unknown,
  method = "POST",
) {
  return api.fetch("/api/v1/" + route, {
    method,
    headers: { origin: base },
    data: body,
  });
}
async function login(
  api: APIRequestContext,
  admin = false,
  expected = 200,
  currentPassword = password,
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await api.post("/api/auth/sign-in/email", {
      headers: { origin: base },
      data: {
        email: admin ? process.env.BOOTSTRAP_ADMIN_EMAIL : email,
        password: admin
          ? process.env.BOOTSTRAP_ADMIN_PASSWORD
          : currentPassword,
      },
    });
    if (response.status() === 429 && attempt < 2) {
      await new Promise((r) =>
        setTimeout(
          r,
          Math.min(
            12000,
            (Number(response.headers()["x-retry-after"]) || 10) * 1000 + 1000,
          ),
        ),
      );
      continue;
    }
    expect(response.status()).toBe(expected);
    return response;
  }
  throw Error("authentication_rate_limited");
}
async function mailLink(recipient: string) {
  for (let i = 0; i < 30; i++) {
    const data = await (
      await fetch("http://127.0.0.1:18025/api/v1/messages")
    ).json();
    const item = data.messages.find((m: { To: { Address: string }[] }) =>
      m.To.some((t) => t.Address === recipient),
    );
    if (item) {
      const mail = await (
        await fetch("http://127.0.0.1:18025/api/v1/message/" + item.ID)
      ).json();
      const link = mail.Text.match(/https?:\/\/[^\s]+/);
      if (link) return link[0];
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw Error("verification_email_not_received");
}
test.describe.serial("AIHub end-to-end on local services", () => {
  test.afterAll(async ({ playwright }) => {
    if (!userId) return;
    const admin = await playwright.request.newContext({ baseURL: base });
    await login(admin, true);
    const detail = await (
      await admin.get("/api/v1/admin/users/" + userId + "/detail")
    ).json();
    for (const license of detail.licenses ?? []) {
      if (license.status !== "REVOKED")
        await request(admin, "admin/licenses/" + license.id + "/revoke", {
          reason: "Completed local E2E fixture cleanup",
        });
    }
    for (const id of [userId, ...extraUsers])
      await request(admin, "admin/users/" + id, { disabled: true }, "PATCH");
    for (const id of fixturePlans)
      await request(admin, "admin/plans/" + id, undefined, "DELETE");
    await admin.dispose();
  });
  test("registers, verifies email, signs in, and enforces customer/admin boundary", async ({
    page,
    request: client,
  }) => {
    await page.goto("/register");
    await page.getByLabel("Tên của bạn").fill("AIHub Test Customer");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Tạo tài khoản", exact: true })
      .click();
    await expect(
      page.getByText("Kiểm tra hộp thư của bạn", { exact: true }),
    ).toBeVisible({ timeout: 45000 });
    const unverified = await client.post("/api/auth/sign-in/email", {
      headers: { origin: base },
      data: { email, password },
    });
    expect(unverified.status()).toBe(403);
    await page.goto(await mailLink(email));
    await page.waitForURL("**/dashboard");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Customer",
    );
    const me = await page.request.get("/api/v1/me");
    userId = (await me.json()).user.id;
    expect((await page.request.get("/api/v1/admin/overview")).status()).toBe(
      403,
    );
    const mutation = await page.request.patch("/api/v1/me", {
      headers: { origin: "https://attacker.example" },
      data: { name: "Bad", locale: "vi", notificationsEnabled: true },
    });
    expect(mutation.status()).toBe(403);
  });
  test("creates an order, rejects fake success, verifies payment and issues exactly one license", async ({
    page,
  }) => {
    await login(page.request);
    await page.goto("/pricing");
    await page.getByRole("link", { name: "Chọn gói" }).first().click();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Tạo đơn & xem mã QR" }).click();
    await page.waitForURL("**/orders/*");
    orderId = page.url().split("/").at(-1)!;
    await page.goto("/payment/success?order=" + orderId);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "đang chờ",
    );
    const order = await (
      await page.request.get("/api/v1/orders/" + orderId)
    ).json();
    const raw = JSON.stringify({
      id: "e2e-" + randomUUID(),
      transferType: "in",
      transferAmount: order.amount,
      accountNumber: "sandbox",
      content: order.code,
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const invalid = await page.request.post("/api/v1/webhooks/sandbox", {
      data: raw,
      headers: {
        "content-type": "application/json",
        "x-sepay-timestamp": timestamp,
        "x-sepay-signature": "sha256=bad",
      },
    });
    expect(invalid.status()).toBe(401);
    const signature =
      "sha256=" +
      createHmac("sha256", process.env.SANDBOX_PAYMENT_SECRET!)
        .update(timestamp + "." + raw)
        .digest("hex");
    for (let i = 0; i < 2; i++) {
      const response = await page.request.post("/api/v1/webhooks/sandbox", {
        data: raw,
        headers: {
          "content-type": "application/json",
          "x-sepay-timestamp": timestamp,
          "x-sepay-signature": signature,
        },
      });
      expect(response.ok()).toBeTruthy();
    }
    await expect
      .poll(
        async () => {
          const me = await (await page.request.get("/api/v1/me")).json();
          return me.licenses.filter(
            (l: { orderId: string; status: string }) =>
              l.orderId === orderId && l.status === "ACTIVE",
          ).length;
        },
        { timeout: 30000 },
      )
      .toBe(1);
    const me = await (await page.request.get("/api/v1/me")).json();
    licenseId = me.licenses.find(
      (l: { orderId: string }) => l.orderId === orderId,
    ).id;
    const revealed = await request(
      page.request,
      "licenses/" + licenseId + "/reveal",
      {},
    );
    licenseKey = (await revealed.json()).key;
    expect(licenseKey).toMatch(/^sk-/);
    await page.goto("/dashboard/licenses");
    await expect(page.getByRole("button", { name: "Xem key" })).toBeVisible();
    const receipt = await page.request.get(
      "/api/v1/orders/" + orderId + "/receipt",
    );
    expect(receipt.headers()["content-disposition"]).toContain("attachment");
    expect(await receipt.text()).toContain(order.code);
  });
  test("authenticates the actual CLI device and blocks it after owner revocation", async ({
    page,
  }) => {
    await login(page.request);
    const home = path.resolve("../.runtime/e2e-device-" + randomUUID());
    const store = new CredentialStore(home);
    store.save({ server: base, key: licenseKey });
    const client = new Sub2ApiLicense({ credentials: store });
    try {
      expect((await client.ensure()).keyId).toBeGreaterThan(0);
      const me = await (await page.request.get("/api/v1/me")).json();
      const license = me.licenses.find(
        (l: { id: string }) => l.id === licenseId,
      );
      expect(license.devices).toHaveLength(1);
      expect(
        (
          await request(
            page.request,
            "devices/" + license.devices[0].id,
            { action: "revoke" },
            "PATCH",
          )
        ).ok(),
      ).toBeTruthy();
      await expect(client.ensure()).rejects.toThrow();
    } finally {
      store.clear();
      fs.rmSync(path.join(home, "device-identity.json"), { force: true });
    }
  });
  test("creates a support ticket, attaches a private file, receives a staff reply, and blocks other customers", async ({
    page,
    playwright,
  }) => {
    await login(page.request);
    await page.goto("/support/new");
    await page
      .getByLabel("Chủ đề", { exact: true })
      .fill("Activation test request");
    await page
      .getByLabel("Nội dung", { exact: true })
      .fill("This is a local integration test support request.");
    await page.getByLabel(/Đính kèm/).setInputFiles({
      name: "test.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\nTest-only fixture\n%%EOF"),
    });
    await page
      .getByRole("button", { name: "Gửi yêu cầu", exact: true })
      .click();
    await page.waitForURL("**/support/tickets/*");
    ticketId = page.url().split("/").at(-1)!;
    await expect(page.getByRole("link", { name: /test.pdf/ })).toBeVisible();
    const ticket = await (
      await page.request.get("/api/v1/tickets/" + ticketId)
    ).json();
    const attachment = ticket.messages[0].attachments[0];
    const download = await page.request.get(
      "/api/attachments?id=" + attachment.id,
    );
    expect(download.status()).toBe(200);
    const stranger = await playwright.request.newContext({ baseURL: base });
    expect(
      (await stranger.get("/api/attachments?id=" + attachment.id)).status(),
    ).toBe(401);
    await stranger.dispose();
    const admin = await playwright.request.newContext({ baseURL: base });
    await login(admin, true);
    const reply = await request(admin, "tickets/" + ticketId + "/messages", {
      body: "Verified staff reply from local E2E test.",
    });
    expect(reply.status()).toBe(201);
    await admin.dispose();
    await page.reload();
    const updated = await (
      await page.request.get("/api/v1/tickets/" + ticketId)
    ).json();
    expect(
      updated.messages.filter(
        (m: { body: string }) =>
          m.body === "Verified staff reply from local E2E test.",
      ),
    ).toHaveLength(1);
    await expect(
      page
        .getByRole("main")
        .getByText("Verified staff reply from local E2E test.", {
          exact: true,
        }),
    ).toBeVisible();
  });
  test("admin CRUD, audit, customer blocking and responsive navigation are functional", async ({
    page,
  }) => {
    const planName = "E2E plan " + randomUUID().slice(0, 8);
    await login(page.request, true);
    await page.goto("/admin/plans");
    await page.getByRole("button", { name: "Tạo mới", exact: true }).click();
    await page.getByLabel("Tên gói / Plan name").fill(planName);
    await page.getByLabel("Slug", { exact: true }).fill("e2e-" + randomUUID());
    await page.getByLabel("Giá / Price (VND)", { exact: true }).fill("1000");
    await page.getByLabel("Thời hạn / Days").fill("7");
    await page.getByLabel("Thiết bị / Devices").fill("1");
    await page
      .getByRole("button", { name: "Lưu thay đổi", exact: true })
      .click();
    await expect(page.getByText(planName, { exact: true })).toBeVisible();
    const createdPlans = await (
      await page.request.get(
        "/api/v1/admin/plans?q=" + encodeURIComponent(planName),
      )
    ).json();
    fixturePlans.push(...createdPlans.rows.map((p: { id: string }) => p.id));
    const audit = await (
      await page.request.get("/api/v1/admin/audit?q=plan.save")
    ).json();
    expect(audit.total).toBeGreaterThan(0);
    expect(
      (
        await request(
          page.request,
          "admin/users/" + userId,
          { disabled: true },
          "PATCH",
        )
      ).ok(),
    ).toBeTruthy();
    const disabled = await login(page.request, false, 403);
    expect(disabled.status()).toBe(403);
    expect(
      (
        await request(
          page.request,
          "admin/users/" + userId,
          { disabled: false },
          "PATCH",
        )
      ).ok(),
    ).toBeTruthy();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard");
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.goto("/docs/getting-started");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  });
  test("audits extensions, manual payments and refunds, and enforces maintenance flags", async ({
    page,
    playwright,
  }) => {
    test.setTimeout(120000);
    await login(page.request);
    const admin = await playwright.request.newContext({ baseURL: base });
    await login(admin, true);
    const current = await (await page.request.get("/api/v1/me")).json();
    const before = current.licenses.find(
      (l: { id: string }) => l.id === licenseId,
    );
    expect(
      (
        await request(page.request, "admin/licenses/" + licenseId + "/extend", {
          days: 2,
          reason: "Unauthorized test extension",
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await request(admin, "admin/licenses/" + licenseId + "/extend", {
          days: 2,
          reason: "Audited local integration extension",
        })
      ).status(),
    ).toBe(201);
    await expect
      .poll(
        async () => {
          const me = await (await page.request.get("/api/v1/me")).json();
          return Date.parse(
            me.licenses.find((l: { id: string }) => l.id === licenseId)
              .expiresAt,
          );
        },
        { timeout: 30000 },
      )
      .toBe(Date.parse(before.expiresAt) + 2 * 86400000);
    const plans = await (await page.request.get("/api/v1/public")).json();
    const orderResponse = await request(page.request, "checkout", {
      planId: plans.plans[0].id,
      billingName: "E2E manual payment",
    });
    expect(orderResponse.ok()).toBeTruthy();
    const order = await orderResponse.json();
    const payment = {
      amount: order.amount,
      reference: "fixture-" + randomUUID(),
      reason: "Local test reconciliation; no bank transfer",
    };
    expect(
      (
        await request(admin, "admin/orders/" + order.id + "/reconcile", {
          ...payment,
          amount: order.amount + 1,
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await request(admin, "admin/orders/" + order.id + "/reconcile", payment)
      ).ok(),
    ).toBeTruthy();
    await expect
      .poll(
        async () => {
          const me = await (await page.request.get("/api/v1/me")).json();
          return me.licenses.some(
            (l: { orderId: string; status: string }) =>
              l.orderId === order.id && l.status === "ACTIVE",
          );
        },
        { timeout: 30000 },
      )
      .toBe(true);
    const refund = {
      reference: "fixture-refund-" + randomUUID(),
      reason: "Local test refund; no bank transfer",
    };
    expect(
      (
        await request(admin, "admin/orders/" + order.id + "/refund", refund)
      ).status(),
    ).toBe(409);
    expect(
      (
        await request(page.request, "orders/" + order.id + "/refund-request", {
          reason: "Local integration refund request",
        })
      ).ok(),
    ).toBeTruthy();
    expect(
      (
        await request(admin, "admin/orders/" + order.id + "/refund", refund)
      ).ok(),
    ).toBeTruthy();
    const refunded = await (await page.request.get("/api/v1/me")).json();
    expect(
      refunded.licenses.find((l: { orderId: string }) => l.orderId === order.id)
        .status,
    ).toBe("REVOKED");
    const filtered = await (
      await admin.get("/api/v1/admin/orders?filter=REFUNDED&q=" + order.code)
    ).json();
    expect(filtered.total).toBe(1);
    const config = await (await admin.get("/api/v1/admin/settings")).json();
    const site = {
      name: "AIHub",
      headline: "Your AI coding workspace",
      description: "License and device management for your workspace",
      contactEmail: "support@example.test",
      supportHours: "",
      seoTitle: "",
      seoDescription: "",
      registrationEnabled: true,
      checkoutEnabled: true,
      maintenanceMode: false,
      ...config.site,
    };
    try {
      expect(
        (
          await request(
            admin,
            "admin/settings",
            { ...site, maintenanceMode: true },
            "PATCH",
          )
        ).ok(),
      ).toBeTruthy();
      expect(
        (
          await request(page.request, "checkout", {
            planId: plans.plans[0].id,
            billingName: "Paused checkout",
          })
        ).status(),
      ).toBe(503);
      const blocked = await page.request.post("/api/auth/sign-up/email", {
        headers: { origin: base },
        data: {
          name: "Blocked signup",
          email: "blocked-" + randomUUID() + "@example.test",
          password,
        },
      });
      expect(blocked.status()).toBe(403);
      expect((await admin.get("/api/v1/admin/overview")).ok()).toBeTruthy();
    } finally {
      expect(
        (await request(admin, "admin/settings", site, "PATCH")).ok(),
      ).toBeTruthy();
      await admin.dispose();
    }
  });
  test("enforces ownership, supports safe content CRUD and completes password reset", async ({
    page,
    playwright,
  }) => {
    const admin = await playwright.request.newContext({ baseURL: base });
    await login(admin, true);
    const mine = await (await admin.get("/api/v1/me")).json();
    expect(
      (
        await request(
          admin,
          "admin/users/" + mine.user.id,
          { disabled: true },
          "PATCH",
        )
      ).status(),
    ).toBe(409);
    const slug = "e2e-doc-" + randomUUID();
    const category = await request(admin, "admin/categories", {
      name: "E2E category",
      slug: "e2e-category-" + randomUUID(),
      sortOrder: 9,
    });
    expect(category.ok()).toBeTruthy();
    const categoryId = (await category.json()).id;
    const content = {
      slug,
      title: "E2E documentation",
      description: "A tested content entry",
      body: "## A useful guide\nSafe Markdown content.",
      locale: "vi",
      kind: "docs",
      published: true,
      sortOrder: 99,
      categoryId,
    };
    const created = await request(admin, "admin/documents", content);
    expect(created.ok()).toBeTruthy();
    const documentId = (await created.json()).id;
    expect(
      (await page.request.get("/api/v1/documents/" + slug)).ok(),
    ).toBeTruthy();
    expect(
      (
        await request(
          admin,
          "admin/documents/" + documentId,
          { ...content, title: "Edited E2E documentation" },
          "PATCH",
        )
      ).ok(),
    ).toBeTruthy();
    expect(
      (
        await request(
          admin,
          "admin/documents/" + documentId,
          undefined,
          "DELETE",
        )
      ).ok(),
    ).toBeTruthy();
    expect((await page.request.get("/api/v1/documents/" + slug)).status()).toBe(
      404,
    );
    expect(
      (
        await request(
          admin,
          "admin/categories/" + categoryId,
          undefined,
          "DELETE",
        )
      ).ok(),
    ).toBeTruthy();
    const other = await playwright.request.newContext({ baseURL: base }),
      otherEmail = "other-" + randomUUID() + "@example.test";
    const signup = await other.post("/api/auth/sign-up/email", {
      headers: { origin: base },
      data: {
        email: otherEmail,
        password: "Test-" + randomUUID(),
        name: "Other E2E account",
        callbackURL: "/dashboard",
      },
    });
    expect(signup.ok()).toBeTruthy();
    extraUsers.push((await signup.json()).user.id);
    await other.get(await mailLink(otherEmail));
    expect((await other.get("/api/v1/orders/" + orderId)).status()).toBe(404);
    expect(
      (await request(other, "licenses/" + licenseId + "/reveal", {})).status(),
    ).toBe(404);
    expect((await other.get("/api/v1/tickets/" + ticketId)).status()).toBe(404);
    await other.dispose();
    await admin.dispose();
    await page.goto("/forgot-password");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page
      .getByRole("button", { name: "Gửi liên kết", exact: true })
      .click();
    await expect(
      page.getByText("Kiểm tra hộp thư của bạn", { exact: true }),
    ).toBeVisible();
    await page.goto(await mailLink(email));
    await page.waitForURL("**/reset-password?*");
    const nextPassword = "Changed-test-" + randomUUID();
    await page.getByLabel("Mật khẩu", { exact: true }).fill(nextPassword);
    await page
      .getByRole("button", { name: "Lưu mật khẩu", exact: true })
      .click();
    await expect(
      page.getByText("Mật khẩu đã cập nhật", { exact: true }),
    ).toBeVisible();
    const signed = await login(page.request, false, 200, nextPassword);
    expect(signed.ok()).toBeTruthy();
  });
  test("marketing is accessible in both themes and mobile menus work", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.locator(".hero-copy")).toBeVisible();
    await page.waitForFunction(
      () =>
        !!document.querySelector(".hero-copy") &&
        getComputedStyle(document.querySelector(".hero-copy")!).opacity === "1",
    );
    const dark = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      dark.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
    await page.getByRole("button", { name: "Đổi giao diện sáng/tối" }).click();
    await expect(page.locator("html")).toHaveClass(/light/);
    const light = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      light.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.getByRole("button", { name: "Mở menu", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.screenshot({
      path: "../.runtime/aihub-mobile-light.png",
      fullPage: true,
    });
  });
});

import { defineConfig } from "@playwright/test";
import "dotenv/config";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120000,
  expect: { timeout: 20000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000",
    channel: process.platform === "win32" ? "msedge" : undefined,
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});

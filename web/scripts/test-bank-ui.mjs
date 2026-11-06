import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import dotenv from "dotenv";
import pg from "pg";
const root = path.resolve(import.meta.dirname, "../.."),
  web = path.join(root, "web");
// A separate app with its own lockfile avoids the running dev server's lock.
// Keep it on the same drive: Next's webpack entries cannot cross Windows drives.
const app = fs.mkdtempSync(path.join(root, ".runtime", "bank-ui-app-"));
for (const item of [
  "src",
  "public",
  "next.config.ts",
  "next-env.d.ts",
  "tsconfig.json",
  "postcss.config.mjs",
  "package.json",
  "package-lock.json",
])
  fs.cpSync(path.join(web, item), path.join(app, item), { recursive: true });
fs.symlinkSync(
  path.join(web, "node_modules"),
  path.join(app, "node_modules"),
  process.platform === "win32" ? "junction" : "dir",
);
// Match the source scan used by the real app; generated caches must not become
// Tailwind inputs in a temporary directory without the repository's ignore rules.
fs.writeFileSync(path.join(app, ".gitignore"), "node_modules/\n.next/\n");
const cssFile = path.join(app, "src/app/globals.css");
fs.writeFileSync(
  cssFile,
  fs
    .readFileSync(cssFile, "utf8")
    .replace('@import "tailwindcss";', '@import "tailwindcss" source("../");'),
);
const local = dotenv.parse(fs.readFileSync(path.join(web, ".env")));
const source = new URL(local.DATABASE_URL);
if (!["127.0.0.1", "localhost"].includes(source.hostname))
  throw Error("Local test database only");
const database = "aihub_bank_" + Date.now() + "_test",
  target = new URL(source),
  adminUrl = new URL(source);
target.pathname = "/" + database;
adminUrl.pathname = "/postgres";
const admin = new pg.Client({ connectionString: adminUrl.toString() });
await admin.connect();
const env = {
  ...process.env,
  ...local,
  DATABASE_URL: target.toString(),
  BETTER_AUTH_URL: "http://127.0.0.1:3107",
  PAYMENT_PROVIDER: "disabled",
  SEPAY_WEBHOOK_SECRET: "",
  NODE_ENV: "development",
};
const log = fs.openSync(path.join(root, ".runtime/bank-ui-server.log"), "w");
let server;
async function run(file, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file, ...args], {
      cwd: web,
      env,
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(Error("process_exit_" + code)),
    );
  });
}
try {
  await admin.query("CREATE DATABASE " + database);
  await run(path.join(web, "node_modules/prisma/build/index.js"), [
    "migrate",
    "deploy",
  ]);
  server = spawn(
    process.execPath,
    [
      path.join(web, "node_modules/next/dist/bin/next"),
      "dev",
      "--webpack",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3107",
    ],
    { cwd: app, env, stdio: ["ignore", log, log], windowsHide: true },
  );
  let ready = false;
  for (let n = 0; n < 100; n++) {
    if (server.exitCode !== null)
      throw Error("test_server_exit_" + server.exitCode);
    try {
      if (
        (
          await fetch(env.BETTER_AUTH_URL + "/api/v1/health", {
            signal: AbortSignal.timeout(4000),
          })
        ).ok
      ) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!ready) throw Error("test_server_not_ready");
  await run(path.join(web, "node_modules/@playwright/test/cli.js"), [
    "test",
    "tests/e2e/bank-payment.spec.ts",
  ]);
} finally {
  if (server?.pid) {
    if (process.platform === "win32") {
      try {
        execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], {
          stdio: "ignore",
          windowsHide: true,
        });
      } catch {}
    } else server.kill("SIGTERM");
  }
  fs.closeSync(log);
  await admin.query("DROP DATABASE IF EXISTS " + database + " WITH (FORCE)");
  await admin.end();
}

import { afterAll, expect, it } from "vitest";
import { csvCell } from "../src/server/csv";
import { ApiError, readBody, redis } from "../src/server/security";
import { auth } from "../src/server/auth";
import { db } from "../src/server/db";
import { POST } from "../src/app/api/auth/[...all]/route";

afterAll(async () => {
  redis.disconnect();
  await db.$disconnect();
});

it("neutralizes formulas including whitespace/control prefixes while preserving CSV escaping", () => {
  for (const input of [
    "=1+1",
    "+1+1",
    "-1+1",
    "@SUM(1)",
    "\t=1+1",
    "\r=1+1",
    " \t=1+1",
    "\n+1+1",
  ])
    expect(csvCell(input)).toBe("\"'" + input + '"');
  expect(csvCell('a,"b"')).toBe('"a,""b"""');
  expect(csvCell("customer@example.com")).toBe('"customer@example.com"');
});

it("rotating forwarded IP headers cannot evade the sign-in rate limit", async () => {
  const ip = "198.51.100." + (10 + Math.floor(Math.random() * 200));
  const attempt = (n: number, realIp = ip) =>
    auth.handler(
      new Request("http://127.0.0.1:3000/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://127.0.0.1:3000",
          "x-real-ip": realIp,
          "x-forwarded-for": `203.0.113.${n}`,
        },
        body: JSON.stringify({
          email: "missing-rate-test@example.test",
          password: "wrong-fixture-password",
        }),
      }),
    );
  const responses = [];
  for (let i = 0; i < 4; i++) responses.push((await attempt(i)).status);
  expect(responses.at(-1)).toBe(429);
  expect((await attempt(9, "192.0.2.200")).status).not.toBe(429);
  await db.rateLimit.deleteMany({ where: { key: { contains: ip } } });
  await db.rateLimit.deleteMany({
    where: { key: { contains: "192.0.2.200" } },
  });
});

it("bounds actual request bytes even with a forged Content-Length", async () => {
  const request = new Request("http://localhost/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-length": "1" },
    body: "x".repeat(65537),
  });
  await expect(readBody(request)).rejects.toMatchObject({
    status: 413,
  } satisfies Partial<ApiError>);
  const response = await POST(
    new Request("http://localhost/api/auth/sign-in/email", {
      method: "POST",
      body: "x".repeat(65537),
    }),
  );
  expect(response.status).toBe(413);
});

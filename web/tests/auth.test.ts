import { it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { auth } from "../src/server/auth";
import { db } from "../src/server/db";
import { redis } from "../src/server/security";
const email = "auth-test-" + randomUUID() + "@example.test",
  password = "Auth-fixture-" + randomUUID();
afterAll(async () => {
  await db.user.deleteMany({ where: { email } });
  await db.$disconnect();
  redis.disconnect();
});
it("rejects duplicate email and wrong passwords, then invalidates expired database sessions", async () => {
  const created = await auth.api.signUpEmail({
    body: { email, password, name: "Authentication fixture" },
  });
  await expect(
    auth.api.signInEmail({
      body: { email, password: "Wrong-password-fixture" },
    }),
  ).rejects.toThrow();
  await expect(
    auth.api.signInEmail({ body: { email, password } }),
  ).rejects.toThrow();
  await db.user.update({
    where: { id: created.user.id },
    data: { emailVerified: true },
  });
  await auth.api
    .signUpEmail({ body: { email, password, name: "Duplicate fixture" } })
    .catch(() => undefined);
  expect(await db.user.count({ where: { email } })).toBe(1);
  const response = await auth.api.signInEmail({
    body: { email, password },
    asResponse: true,
  });
  expect(response.status).toBe(200);
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const headers = new Headers({ cookie });
  expect((await auth.api.getSession({ headers }))?.user.id).toBe(
    created.user.id,
  );
  await db.session.updateMany({
    where: { userId: created.user.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  expect(await auth.api.getSession({ headers })).toBeNull();
});

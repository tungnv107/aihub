import { db } from "../src/server/db";
import { env, localSandbox } from "../src/server/env";
import { upstreamRevoke } from "../src/server/licenses";
import { redis } from "../src/server/security";
if (
  !localSandbox ||
  !["127.0.0.1", "localhost"].includes(new URL(env.BETTER_AUTH_URL).hostname)
)
  throw Error("Local sandbox only");
try {
  const users = await db.user.findMany({
    where: {
      email: { endsWith: "@example.test" },
      name: {
        in: ["AIHub Test Customer", "Other E2E account", "Blocked signup"],
      },
    },
    select: { id: true },
  });
  const ids = users.map((user) => user.id);
  const licenses = await db.license.findMany({
    where: { userId: { in: ids } },
  });
  for (const license of licenses) {
    await db.license.update({
      where: { id: license.id },
      data: { status: "REVOKED" },
    });
    await upstreamRevoke(license.id);
  }
  await db.user.updateMany({
    where: { id: { in: ids } },
    data: { disabled: true },
  });
  await db.session.deleteMany({ where: { userId: { in: ids } } });
  await db.plan.updateMany({
    where: { slug: { startsWith: "e2e-" }, name: { startsWith: "E2E plan " } },
    data: { active: false },
  });
  await db.setting.deleteMany({
    where: {
      key: "site",
      value: { path: ["contactEmail"], equals: "support@example.test" },
    },
  });
  await db.auditLog.create({
    data: {
      action: "fixture.cleanup",
      target: "local-e2e",
      metadata: { users: ids.length, licenses: licenses.length },
    },
  });
  console.log("Local fixtures disabled; financial and audit history retained.");
} finally {
  await db.$disconnect();
  redis.disconnect();
}

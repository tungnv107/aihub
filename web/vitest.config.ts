import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import "dotenv/config";
const testDatabase = new URL(
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!,
);
if (!process.env.TEST_DATABASE_URL) {
  if (!["127.0.0.1", "localhost"].includes(testDatabase.hostname))
    throw Error("Set a dedicated TEST_DATABASE_URL");
  testDatabase.pathname = "/aihub_test";
}
if (!testDatabase.pathname.endsWith("_test"))
  throw Error("Test database name must end with _test");
process.env.DATABASE_URL = testDatabase.toString();
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});

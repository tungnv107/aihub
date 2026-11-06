import { PrismaClient, Prisma } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "./env";
const shared = globalThis as unknown as { aihubDb?: PrismaClient };
export const db =
  shared.aihubDb ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
  });
if (process.env.NODE_ENV !== "production") shared.aihubDb = db;
export type Tx = Prisma.TransactionClient;
export async function serial<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++)
    try {
      return await db.$transaction(fn, {
        isolationLevel: "Serializable",
        timeout: 15000,
      });
    } catch (error) {
      if (
        attempt >= 4 ||
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        !["P2034", "P2002"].includes(error.code)
      )
        throw error;
      await new Promise((r) => setTimeout(r, 20 * (attempt + 1)));
    }
}

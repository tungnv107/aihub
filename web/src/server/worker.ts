import "dotenv/config";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { db } from "./db";
import { env } from "./env";
import { provisionOrder } from "./provision";
import { upstreamRevoke } from "./licenses";
import { sendMail } from "./mail";
import { logger } from "./logger";
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const queue = new Queue("aihub-jobs", { connection });
const worker = new Worker(
  "aihub-jobs",
  async (queued) => {
    const job = await db.job.findUniqueOrThrow({
      where: { id: queued.data.id as string },
    });
    if (job.status === "DONE") return;
    const data = job.payload as Record<string, string>;
    try {
      if (job.type === "PROVISION") await provisionOrder(data.orderId);
      else if (job.type === "REVOKE") await upstreamRevoke(data.licenseId);
      else if (job.type === "MAIL") {
        const user = await db.user.findUniqueOrThrow({
          where: { id: data.userId },
        });
        if (user.notificationsEnabled)
          await sendMail(user.email, data.subject, data.text);
      } else throw Error("unknown_job_type");
      await db.job.update({
        where: { id: job.id },
        data: { status: "DONE", completedAt: new Date(), lastError: null },
      });
    } catch (error) {
      const code = error instanceof Error ? error.name : "JobError";
      await db.job.update({
        where: { id: job.id },
        data: {
          attempts: { increment: 1 },
          lastError: code,
          status: "PENDING",
          availableAt: new Date(
            Date.now() +
              Math.min(3600000, 30000 * 2 ** Math.min(job.attempts, 7)),
          ),
        },
      });
      logger.warn({ jobId: job.id, code }, "job retry scheduled");
      throw error;
    }
  },
  { connection, concurrency: 4 },
);
worker.on("error", () => logger.error("worker connection failed"));
async function dispatch() {
  await db.order.updateMany({
    where: { status: "PENDING", expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });
  const jobs = await db.job.findMany({
    where: { status: "PENDING", availableAt: { lte: new Date() } },
    take: 100,
    orderBy: { createdAt: "asc" },
  });
  for (const job of jobs)
    await queue.add(
      job.type,
      { id: job.id },
      { jobId: job.id, removeOnComplete: true, removeOnFail: true },
    );
}
let stopping = false;
async function loop() {
  while (!stopping) {
    try {
      await dispatch();
    } catch {
      logger.error("outbox dispatch unavailable");
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, async () => {
    stopping = true;
    await worker.close();
    await queue.close();
    await connection.quit();
    await db.$disconnect();
  });
logger.info("AIHub outbox worker started");
await loop();

import { z } from "zod";
import { db, serial } from "./db";
import { fail } from "./security";
import { isStaff, type Actor } from "./auth";
export const ticketSchema = z.object({
  subject: z.string().trim().min(4).max(160),
  category: z.enum(["ACTIVATION", "BILLING", "TECHNICAL", "OTHER"]),
  body: z.string().trim().min(10).max(10000),
});
export async function createTicket(
  user: Actor,
  input: z.infer<typeof ticketSchema>,
) {
  return db.ticket.create({
    data: {
      userId: user.id,
      subject: input.subject,
      category: input.category,
      messages: { create: { authorId: user.id, body: input.body } },
    },
  });
}
export async function getTicket(user: Actor, id: string) {
  const ticket = await db.ticket.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: { id: true, name: true } },
          attachments: {
            select: { id: true, name: true, mime: true, bytes: true },
          },
        },
      },
    },
  });
  if (!ticket || (ticket.userId !== user.id && !isStaff(user)))
    fail(404, "ticket_not_found");
  return ticket;
}
export async function replyTicket(user: Actor, id: string, body: string) {
  return serial(async (tx) => {
    const ticket = await tx.ticket.findUnique({ where: { id } });
    if (!ticket || (ticket.userId !== user.id && !isStaff(user)))
      fail(404, "ticket_not_found");
    if (ticket.status === "CLOSED") fail(409, "ticket_closed");
    const staff = isStaff(user);
    const message = await tx.ticketMessage.create({
      data: { ticketId: id, authorId: user.id, body },
    });
    await tx.ticket.update({
      where: { id },
      data: {
        status: staff ? "WAITING_CUSTOMER" : "OPEN",
        firstResponseAt:
          staff && !ticket.firstResponseAt
            ? new Date()
            : ticket.firstResponseAt,
        updatedAt: new Date(),
      },
    });
    if (staff && user.id !== ticket.userId) {
      await tx.notification.create({
        data: {
          userId: ticket.userId,
          title: "Hỗ trợ đã phản hồi",
          body: ticket.subject,
          href: "/support/tickets/" + id,
        },
      });
      await tx.job.create({
        data: {
          dedupeKey: "reply:" + message.id,
          type: "MAIL",
          payload: {
            userId: ticket.userId,
            subject: "AIHub · " + ticket.subject,
            text: "Bạn có phản hồi mới trong ticket hỗ trợ. Đăng nhập AIHub để xem.",
          },
        },
      });
    }
    return message;
  });
}
export async function updateTicket(
  user: Actor,
  id: string,
  input: {
    status?:
      "OPEN" | "IN_PROGRESS" | "WAITING_CUSTOMER" | "RESOLVED" | "CLOSED";
    assigneeId?: string | null;
    priority?: string;
  },
) {
  return serial(async (tx) => {
    const ticket = await tx.ticket.findUnique({ where: { id } });
    if (!ticket || (ticket.userId !== user.id && !isStaff(user)))
      fail(404, "ticket_not_found");
    if (
      !isStaff(user) &&
      (input.assigneeId !== undefined ||
        input.priority !== undefined ||
        !["OPEN", "CLOSED"].includes(input.status ?? ""))
    )
      fail(403, "insufficient_permissions");
    if (
      !isStaff(user) &&
      input.status === "OPEN" &&
      ticket.updatedAt.getTime() < Date.now() - 30 * 86400000
    )
      fail(409, "reopen_window_closed");
    if (input.assigneeId) {
      const assignee = await tx.userRole.findFirst({
        where: {
          userId: input.assigneeId,
          role: { name: { in: ["ADMIN", "SUPPORT"] } },
        },
      });
      if (!assignee) fail(400, "invalid_assignee");
    }
    const updated = await tx.ticket.update({ where: { id }, data: input });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "ticket.update",
        target: id,
        metadata: input,
      },
    });
    return updated;
  });
}

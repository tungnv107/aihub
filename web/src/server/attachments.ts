import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { db, serial } from "./db";
import { env } from "./env";
import { fail } from "./security";
import { getTicket } from "./support";
import type { Actor } from "./auth";
const root = path.resolve(env.UPLOAD_DIR);
export function detectMime(bytes: Buffer) {
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return "image/jpeg";
  if (bytes.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  return null;
}
export async function uploadAttachment(
  user: Actor,
  ticketId: string,
  messageId: string,
  file: File,
) {
  const ticket = await getTicket(user, ticketId);
  if (ticket.status === "CLOSED") fail(409, "ticket_closed");
  const message = ticket.messages.find(
    (m) => m.id === messageId && m.authorId === user.id,
  );
  if (!message) fail(404, "message_not_found");
  if (file.size < 1 || file.size > 5 * 1024 * 1024)
    fail(413, "attachment_too_large");
  if (message.attachments.length >= 3) fail(409, "attachment_limit_reached");
  const buffer = Buffer.from(await file.arrayBuffer()),
    mime = detectMime(buffer);
  if (!mime || file.type !== mime) fail(400, "unsupported_attachment");
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const storageKey = randomUUID();
  await fs.writeFile(path.join(root, storageKey), buffer, {
    flag: "wx",
    mode: 0o600,
  });
  try {
    return await serial(async (tx) => {
      if ((await tx.attachment.count({ where: { messageId } })) >= 3)
        fail(409, "attachment_limit_reached");
      return tx.attachment.create({
        data: {
          messageId,
          name:
            path
              .basename(file.name)
              .replace(/[\r\n\x00-\x1f]/g, "")
              .slice(0, 120) || "attachment",
          mime,
          bytes: buffer.length,
          storageKey,
        },
        select: { id: true, name: true, bytes: true, mime: true },
      });
    });
  } catch (error) {
    await fs.unlink(path.join(root, storageKey));
    throw error;
  }
}
export async function downloadAttachment(user: Actor, id: string) {
  const attachment = await db.attachment.findUnique({
    where: { id },
    include: { message: { select: { ticketId: true } } },
  });
  if (!attachment) fail(404, "attachment_not_found");
  await getTicket(user, attachment.message.ticketId);
  if (!/^[a-f0-9-]{36}$/.test(attachment.storageKey))
    fail(404, "attachment_not_found");
  return {
    attachment,
    buffer: await fs.readFile(path.join(root, attachment.storageKey)),
  };
}

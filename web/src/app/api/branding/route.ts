import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { actor, requireRole } from "@/server/auth";
import { db, serial } from "@/server/db";
import { env } from "@/server/env";
import { ApiError, fail, sameOrigin } from "@/server/security";
import { detectMime } from "@/server/attachments";
const root = path.resolve(env.UPLOAD_DIR);
export async function GET(request: Request) {
  try {
    const asset = new URL(request.url).searchParams.get("asset");
    if (!["logo", "favicon"].includes(asset ?? "")) fail(404, "not_found");
    const setting = await db.setting.findUnique({
      where: { key: "branding:" + asset },
    });
    if (!setting) fail(404, "not_found");
    const value = setting.value as { storageKey: string; mime: string };
    if (!/^[a-f0-9-]{36}$/.test(value.storageKey)) fail(404, "not_found");
    return new Response(
      new Uint8Array(await fs.readFile(path.join(root, value.storageKey))),
      {
        headers: {
          "content-type": value.mime,
          "x-content-type-options": "nosniff",
          "cache-control": "public, max-age=300",
        },
      },
    );
  } catch {
    return new Response(null, { status: 404 });
  }
}
export async function POST(request: Request) {
  try {
    const user = await actor(request.headers);
    requireRole(user, "ADMIN");
    sameOrigin(request);
    const asset = new URL(request.url).searchParams.get("asset");
    if (!["logo", "favicon"].includes(asset ?? "")) fail(400, "invalid_asset");
    const reader = request.body?.getReader();
    if (!reader) fail(400, "file_required");
    const chunks: Uint8Array[] = [];
    let length = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 1024 * 1024) {
        await reader.cancel();
        fail(413, "image_too_large");
      }
      chunks.push(value);
    }
    const buffer = Buffer.concat(chunks),
      mime = detectMime(buffer);
    if (!mime || !["image/png", "image/jpeg"].includes(mime))
      fail(400, "image_required");
    await fs.mkdir(root, { recursive: true, mode: 0o700 });
    const storageKey = randomUUID();
    await fs.writeFile(path.join(root, storageKey), buffer, {
      flag: "wx",
      mode: 0o600,
    });
    try {
      await serial(async (tx) => {
        await tx.setting.upsert({
          where: { key: "branding:" + asset },
          create: { key: "branding:" + asset, value: { storageKey, mime } },
          update: { value: { storageKey, mime } },
        });
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            action: "branding.upload",
            target: asset!,
            metadata: { mime, bytes: length },
          },
        });
      });
    } catch (error) {
      await fs.unlink(path.join(root, storageKey));
      throw error;
    }
    return NextResponse.json({ saved: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: error instanceof ApiError ? error.code : "upload_failed",
        },
      },
      { status: error instanceof ApiError ? error.status : 400 },
    );
  }
}

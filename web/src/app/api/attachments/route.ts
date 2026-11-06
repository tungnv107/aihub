import { NextResponse } from "next/server";
import { actor } from "@/server/auth";
import { ApiError, sameOrigin, limit, fail } from "@/server/security";
import { uploadAttachment, downloadAttachment } from "@/server/attachments";
export async function POST(request: Request) {
  try {
    const user = await actor(request.headers);
    sameOrigin(request);
    await limit("uploads:" + user.id, 20, 3600);
    const length = Number(request.headers.get("content-length"));
    if (
      !Number.isFinite(length) ||
      length <= 0 ||
      length > 5 * 1024 * 1024 + 8192
    )
      fail(413, "attachment_too_large");
    // Bound actual bytes as well; Content-Length alone is not trusted.
    const reader = request.body?.getReader();
    if (!reader) fail(400, "file_required");
    let size = 0;
    const parts: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 5 * 1024 * 1024 + 8192) {
        await reader.cancel();
        fail(413, "attachment_too_large");
      }
      parts.push(value);
    }
    const bounded = new Request(request.url, {
      method: "POST",
      headers: { "content-type": request.headers.get("content-type") ?? "" },
      body: Buffer.concat(parts),
    });
    const form = await bounded.formData(),
      file = form.get("file");
    if (!(file instanceof File)) fail(400, "file_required");
    return NextResponse.json(
      await uploadAttachment(
        user,
        String(form.get("ticketId")),
        String(form.get("messageId")),
        file,
      ),
      { status: 201 },
    );
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
export async function GET(request: Request) {
  try {
    const user = await actor(request.headers);
    const { attachment, buffer } = await downloadAttachment(
      user,
      new URL(request.url).searchParams.get("id") ?? "",
    );
    return new Response(new Uint8Array(buffer), {
      headers: {
        "content-type": attachment.mime,
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: error instanceof ApiError ? error.code : "download_failed",
        },
      },
      { status: error instanceof ApiError ? error.status : 404 },
    );
  }
}

import { auth } from "@/server/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { ApiError, readBody } from "@/server/security";
const handlers = toNextJsHandler(auth);
export const GET = handlers.GET;
export async function POST(request: Request) {
  try {
    const body = await readBody(request);
    return await handlers.POST(
      new Request(request.url, {
        method: request.method,
        headers: request.headers,
        body,
      }),
    );
  } catch (error) {
    return Response.json(
      {
        error: {
          code: error instanceof ApiError ? error.code : "auth_unavailable",
        },
      },
      { status: error instanceof ApiError ? error.status : 503 },
    );
  }
}

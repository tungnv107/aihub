import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json(
    {
      error: {
        code: "device_activation_required",
        message: "Use AIHub device activation",
      },
    },
    { status: 403, headers: { "cache-control": "no-store" } },
  );
}

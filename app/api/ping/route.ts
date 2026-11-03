import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Connectivity probe: deliberately contains no protected data. */
export function GET() {
  return new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } });
}

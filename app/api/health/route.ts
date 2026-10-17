import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const hasDatabaseUrl = Boolean(
    [
      process.env.DATABASE_URL_RUNTIME,
      process.env.DATABASE_URL,
      process.env.POSTGRES_URL,
    ].some((value) => Boolean(value?.trim())),
  );

  if (!hasDatabaseUrl) {
    return NextResponse.json(
      { status: "not_ready", database: "missing_runtime_url" },
      { status: 503 },
    );
  }

  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({ status: "ok", database: "reachable" });
  } catch (error) {
    console.error("[health] database check failed", error);
    return NextResponse.json(
      { status: "not_ready", database: "unreachable" },
      { status: 503 },
    );
  }
}

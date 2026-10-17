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
    const [tables, columns] = await Promise.all([
      db.execute(sql`
        select table_name
        from information_schema.tables
        where table_schema = 'public'
          and table_name in ('user_profiles', 'parties', 'party_roles', 'items', 'wrr_documents')
      `),
      db.execute(sql`
        select table_name, column_name
        from information_schema.columns
        where table_schema = 'public'
          and (
            (table_name = 'user_profiles' and column_name = 'status') or
            (table_name = 'parties' and column_name = 'is_active') or
            (table_name = 'party_roles' and column_name = 'role') or
            (table_name = 'items' and column_name = 'is_active') or
            (table_name = 'wrr_documents' and column_name = 'status')
          )
      `),
    ]);
    const presentTables = new Set(tables.map((row) => String(row.table_name)));
    const presentColumns = new Set(columns.map((row) => `${row.table_name}.${row.column_name}`));
    const requiredTables = ["user_profiles", "parties", "party_roles", "items", "wrr_documents"];
    const requiredColumns = [
      "user_profiles.status",
      "parties.is_active",
      "party_roles.role",
      "items.is_active",
      "wrr_documents.status",
    ];
    const missingTables = requiredTables.filter((table) => !presentTables.has(table));
    const missingColumns = requiredColumns.filter((column) => !presentColumns.has(column));

    if (missingTables.length > 0 || missingColumns.length > 0) {
      return NextResponse.json(
        { status: "not_ready", database: "schema_incomplete", missingTables, missingColumns },
        { status: 503 },
      );
    }

    return NextResponse.json({ status: "ok", database: "reachable", schema: "ready" });
  } catch (error) {
    console.error("[health] database check failed", error);
    return NextResponse.json(
      { status: "not_ready", database: "unreachable" },
      { status: 503 },
    );
  }
}

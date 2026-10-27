import { NextResponse } from "next/server";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { parties, partyRoles, partyRbeClassifications, items, locations } from "@/lib/db/schema";
import { asc } from "drizzle-orm";

function csvCell(value: unknown): string {
  const text = value instanceof Date ? value.toISOString() : String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return [columns.map(csvCell).join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\n") + "\n";
}

export async function GET(request: Request) {
  const tab = new URL(request.url).searchParams.get("tab") ?? "parties";
  const resolver = await createPageResolver();
  const capability = tab === "items" ? "items.read" : tab === "locations" ? "locations.read" : "parties.read";
  const permission = await requirePermission(resolver, capability);
  if (permission.kind !== "authorized") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let rows: Array<Record<string, unknown>>;
  if (tab === "items") {
    rows = (await db.select().from(items).orderBy(asc(items.code))) as Array<Record<string, unknown>>;
  } else if (tab === "locations") {
    rows = (await db.select().from(locations).orderBy(asc(locations.label))) as Array<Record<string, unknown>>;
  } else {
    const partyRows = await db.select().from(parties).orderBy(asc(parties.code));
    const roleRows = await db.select({ partyId: partyRoles.partyId, role: partyRoles.role }).from(partyRoles);
    let rbeRows: Array<{ partyId: string; classification: string }>;
    try {
      rbeRows = await db
        .select({
          partyId: partyRbeClassifications.partyId,
          classification: partyRbeClassifications.classification,
        })
        .from(partyRbeClassifications);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const causeMessage =
        error && typeof error === "object" && "cause" in error
          ? String((error as { cause?: unknown }).cause)
          : "";
      if (
        message.includes('relation "party_rbe_classifications" does not exist') ||
        causeMessage.includes('relation "party_rbe_classifications" does not exist')
      ) {
        return NextResponse.json(
          {
            error:
              "Organization export is temporarily unavailable because the canonical RBE classification table is not installed. Apply the approved enrollment migration before exporting party data.",
          },
          { status: 503 },
        );
      }
      throw error;
    }
    const roles = new Map<string, string[]>();
    const rbes = new Map<string, string[]>();
    for (const row of roleRows) roles.set(row.partyId, [...(roles.get(row.partyId) ?? []), row.role]);
    for (const row of rbeRows) rbes.set(row.partyId, [...(rbes.get(row.partyId) ?? []), row.classification.toUpperCase()]);
    rows = partyRows.map((row) => ({ ...row, roles: roles.get(row.id)?.join("|") ?? "", rbe_classifications: rbes.get(row.id)?.join("|") ?? "" })) as Array<Record<string, unknown>>;
  }
  return new NextResponse(toCsv(rows), { status: 200, headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="data-management-${tab}.csv"`, "Cache-Control": "no-store" } });
}

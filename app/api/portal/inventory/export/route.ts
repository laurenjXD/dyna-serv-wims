import { NextResponse } from "next/server";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { resolveActivePartyScope } from "@/lib/portal/resolve-party-scope";
import { db } from "@/lib/db/client";
import { listPartyVmiInventory } from "@/lib/db/queries/inventory";

export async function GET(request: Request) {
  const resolver = await createPageResolver();
  const context = await resolver.getContext();
  if (context.kind !== "authorized") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const scope = resolveActivePartyScope(context.context);
  if (!scope) return NextResponse.json({ error: "No organization scope" }, { status: 403 });
  const permission = await requirePermission(resolver, "reporting.read", { partyId: scope.partyId, flowType: "vmi" });
  if (permission.kind !== "authorized") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const rows = await listPartyVmiInventory(db, scope.partyId, {
    location: url.searchParams.get("location") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
  });
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [
    ["Item Code", "Item Name", "Category", "Lot Number", "Location", "Qty On Hand", "Boxes On Hand", "Status"].join(","),
    ...rows.map((row) => [row.itemCode, row.itemName, row.categoryName, row.lotNumber, row.locationLabel, row.qtyOnHand, row.boxesOnHand, row.lotStatus].map(escape).join(",")),
  ].join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=organization-vmi-inventory.csv",
      "Cache-Control": "private, no-store",
    },
  });
}

"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { withRlsTransaction } from "@/lib/db/rls-transaction";
import { rlsPool } from "@/lib/db/rls-pool";
import { db as defaultDb } from "@/lib/db/client";
import { getAuthenticatedSession } from "@/lib/auth/get-authenticated-session";
import { parties, partyFlowRelationships } from "@/lib/db/schema/parties";
import { itemCategories, items } from "@/lib/db/schema/items";
import { parseMaterialImport } from "@/lib/enrollment/material-import";

const rlsDeps = { getAuthenticatedSession, pool: rlsPool };

export type BulkImportState = {
  ok?: boolean;
  error?: string;
  imported?: number;
  warnings?: string[];
};

export async function importMaterialsAction(
  _previous: BulkImportState,
  formData: FormData,
): Promise<BulkImportState> {
  const resolver = await createPageResolver();
  const permission = await requirePermission(resolver, "items.manage");
  if (permission.kind !== "authorized") return { error: "You do not have permission to enroll materials." };

  const partyId = String(formData.get("partyId") ?? "").trim();
  const file = formData.get("file");
  if (!partyId) return { error: "Select the material-origin organization first." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV or Excel file first." };

  const parsed = parseMaterialImport(Buffer.from(await file.arrayBuffer()));
  if (parsed.error) return { error: parsed.error };
  if (parsed.rows.length === 0) return { error: "No material rows were found." };

  const result = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as typeof defaultDb;
    const originRows = await db.select({
      id: parties.id,
      isActive: parties.isActive,
      relationship: partyFlowRelationships.relationship,
    }).from(parties)
      .innerJoin(partyFlowRelationships, eq(partyFlowRelationships.partyId, parties.id))
      .where(and(
        eq(parties.id, partyId),
        eq(parties.isActive, true),
        eq(partyFlowRelationships.isActive, true),
        sql`${partyFlowRelationships.relationship} IN ('vmi_customer', 'trading_supplier')`,
      ));
    if (originRows.length !== 1) return { ok: false as const, error: "Choose an active organization with exactly one active VMI Customer or Trading Supplier relationship." };

    const codes = parsed.rows.map((row) => row.code);
    const duplicateCodes = [...new Set(codes.filter((code, index) => codes.indexOf(code) !== index))];
    if (duplicateCodes.length > 0) return { ok: false as const, error: `Duplicate item codes in the file: ${duplicateCodes.slice(0, 8).join(", ")}${duplicateCodes.length > 8 ? "…" : ""}.` };
    const existing = await db.select({ code: items.code }).from(items).where(inArray(items.code, codes));
    if (existing.length > 0) return { ok: false as const, error: `These item codes already exist: ${existing.slice(0, 8).map((row) => row.code).join(", ")}${existing.length > 8 ? "…" : ""}.` };

    const categoryRows = await db.select({ id: itemCategories.id, name: itemCategories.name }).from(itemCategories);
    const categoryByName = new Map(categoryRows.map((category) => [category.name.trim().toLowerCase(), category.id]));
    await db.insert(items).values(parsed.rows.map((row) => ({
      code: row.code,
      name: row.name,
      description: row.description ?? undefined,
      barcode: row.code,
      itemType: "standard",
      categoryId: row.category ? categoryByName.get(row.category.toLowerCase()) : undefined,
      defaultSupplierPartyId: partyId,
      uom: "piece",
      currency: "USD",
      spq: row.spq,
      lengthCm: row.lengthCm ?? undefined,
      widthCm: row.widthCm ?? undefined,
      heightCm: row.heightCm ?? undefined,
      volumeCm3: row.volumeCm3 ?? undefined,
      volumeCbm: row.volumeCbm,
      boxesPerPallet: row.boxesPerPallet ?? undefined,
      minReorderLevel: 0,
      isPerishable: false,
      isActive: true,
    })));
    return { ok: true as const, imported: parsed.rows.length };
  });

  if (result.kind === "unauthenticated") return { error: "Your session is no longer authenticated." };
  if (!result.value.ok) return { error: result.value.error };
  revalidatePath("/enrollment");
  revalidatePath("/master-data/items");
  return { ok: true, imported: result.value.imported, warnings: parsed.warnings.map((warning) => `Row ${warning.rowNumber}: ${warning.message}`) };
}

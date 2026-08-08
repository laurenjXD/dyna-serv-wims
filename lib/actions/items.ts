// Item server actions — create, update, deactivate.
//
// Traceability:
//   specs/06-party-and-item-enrollment/requirements.md R4, R6.1
//   specs/06-party-and-item-enrollment/design.md §4 (Command boundary),
//     §6 (Item model, Barcode immutability, Item deactivation impact)
//   specs/00-steering/tech.md — RBAC from session, never from client params

import { eq } from "drizzle-orm";
import type { RequestAuthorizationResolver } from "@/lib/rbac/session";
import { requirePermission } from "@/lib/rbac/guard";
import { parseItemInput, checkBarcodeUpdate } from "@/lib/enrollment/item-schema";
import { items } from "@/lib/db/schema/items";

// ---------------------------------------------------------------------------
// Shared result types
// ---------------------------------------------------------------------------

export type ActionCreateResult =
  | { ok: true; data: { id: string } }
  | { ok: false; error: string }
  | { ok: false; fieldErrors: Record<string, string> };

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string }
  | { ok: false; fieldErrors: Record<string, string> };

export type ActionSimpleResult = { ok: true } | { ok: false; error: string };

// Minimal structural type that both the real Drizzle db instance and test
// stubs satisfy.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbLike = { [key: string]: (...args: any[]) => any };

// ---------------------------------------------------------------------------
// Authorization helper
// ---------------------------------------------------------------------------
async function checkPermission(
  resolver: RequestAuthorizationResolver,
  capability: string,
): Promise<{ ok: false; error: string } | null> {
  const perm = await requirePermission(resolver, capability);
  if (perm.kind !== "authorized") {
    return { ok: false, error: "Forbidden" };
  }
  return null;
}

// ---------------------------------------------------------------------------
// createItem
// ---------------------------------------------------------------------------

/**
 * Creates an item. Requires items.manage.
 * Calls parseItemInput for validation, then inserts via db.
 * Reference prices (buyingPrice/sellingPrice) are stored as nullable
 * references only — they never finalize Trading prices or VMI billing.
 */
export async function createItem(
  resolver: RequestAuthorizationResolver,
  db: DbLike,
  input: unknown,
): Promise<ActionCreateResult> {
  const denied = await checkPermission(resolver, "items.manage");
  if (denied) return denied;

  const parsed = parseItemInput(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const err of parsed.errors) {
      fieldErrors[err.field] = err.message;
    }
    return { ok: false, fieldErrors };
  }

  const data = parsed.data;
  const [inserted] = await db
    .insert(items)
    .values({
      code: data.code,
      name: data.name,
      barcode: data.barcode,
      supplierItemCode: data.supplierItemCode ?? undefined,
      customerItemCode: data.customerItemCode ?? undefined,
      dsgcItemNumber: data.dsgcItemNumber ?? undefined,
      description: data.description ?? undefined,
      itemType: data.itemType ?? undefined,
      categoryId: data.categoryId ?? undefined,
      defaultSupplierPartyId: data.defaultSupplierPartyId ?? undefined,
      uom: data.uom,
      currency: data.currency,
      spq: data.spq,
      spqMeter: data.spqMeter ?? undefined,
      lengthCm: data.lengthCm ?? undefined,
      widthCm: data.widthCm ?? undefined,
      heightCm: data.heightCm ?? undefined,
      volumeCm3: data.volumeCm3 ?? undefined,
      volumeCbm: data.volumeCbm,
      boxesPerPallet: data.boxesPerPallet ?? undefined,
      weightKg: data.weightKg ?? undefined,
      minReorderLevel: data.minReorderLevel,
      isPerishable: data.isPerishable,
      isActive: data.isActive ?? true,
      buyingPrice: data.buyingPrice ?? undefined,
      sellingPrice: data.sellingPrice ?? undefined,
    })
    .returning({ id: items.id });

  return { ok: true, data: { id: inserted.id } };
}

// ---------------------------------------------------------------------------
// updateItem
// ---------------------------------------------------------------------------

/**
 * Updates an item. Requires items.manage.
 * Stale-edit guard on submittedUpdatedAt vs DB row's updated_at.
 * Barcode-change guard: if barcode differs from current value and
 * deps.getBarcodeCheckData returns any true flag, returns
 * { ok: false, fieldErrors: { barcode: '...' } } (barcode immutability
 * per design.md §6).
 */
export async function updateItem(
  resolver: RequestAuthorizationResolver,
  db: DbLike,
  id: string,
  input: unknown,
  submittedUpdatedAt: string,
  deps?: {
    getBarcodeCheckData?: (
      db: DbLike,
      itemId: string,
    ) => Promise<{
      hasRelatedLots: boolean;
      hasRelatedWrrItems: boolean;
      hasRelatedInventoryTransactions: boolean;
    }>;
  },
): Promise<ActionResult> {
  const denied = await checkPermission(resolver, "items.manage");
  if (denied) return denied;

  const parsed = parseItemInput(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const err of parsed.errors) {
      fieldErrors[err.field] = err.message;
    }
    return { ok: false, fieldErrors };
  }

  // Fetch current row for stale-edit and barcode immutability checks
  const [currentRow] = await db
    .select({
      id: items.id,
      barcode: items.barcode,
      updated_at: items.updatedAt,
    })
    .from(items)
    .where(eq(items.id, id))
    .limit(1);

  if (!currentRow) {
    return { ok: false, error: "Not found" };
  }

  const row = currentRow as { id: string; barcode: string; updated_at: Date };

  // Stale-edit guard
  const dbTimestamp = row.updated_at.getTime();
  const submittedTimestamp = new Date(submittedUpdatedAt).getTime();
  if (dbTimestamp !== submittedTimestamp) {
    return { ok: false, error: "Conflict" };
  }

  // Barcode immutability guard (design.md §6)
  const newBarcode = parsed.data.barcode;
  if (newBarcode !== row.barcode && deps?.getBarcodeCheckData) {
    const checkData = await deps.getBarcodeCheckData(db, id);
    const barcodeCheck = checkBarcodeUpdate(checkData);
    if (!barcodeCheck.allowed) {
      return {
        ok: false,
        fieldErrors: { barcode: barcodeCheck.reason },
      };
    }
  }

  const data = parsed.data;
  await db
    .update(items)
    .set({
      code: data.code,
      name: data.name,
      barcode: data.barcode,
      supplierItemCode: data.supplierItemCode ?? undefined,
      customerItemCode: data.customerItemCode ?? undefined,
      dsgcItemNumber: data.dsgcItemNumber ?? undefined,
      description: data.description ?? undefined,
      itemType: data.itemType ?? undefined,
      categoryId: data.categoryId ?? undefined,
      defaultSupplierPartyId: data.defaultSupplierPartyId ?? undefined,
      uom: data.uom,
      currency: data.currency,
      spq: data.spq,
      spqMeter: data.spqMeter ?? undefined,
      lengthCm: data.lengthCm ?? undefined,
      widthCm: data.widthCm ?? undefined,
      heightCm: data.heightCm ?? undefined,
      volumeCm3: data.volumeCm3 ?? undefined,
      volumeCbm: data.volumeCbm,
      boxesPerPallet: data.boxesPerPallet ?? undefined,
      weightKg: data.weightKg ?? undefined,
      minReorderLevel: data.minReorderLevel,
      isPerishable: data.isPerishable,
      isActive: data.isActive ?? true,
      buyingPrice: data.buyingPrice ?? undefined,
      sellingPrice: data.sellingPrice ?? undefined,
    })
    .where(eq(items.id, id))
    .returning({ id: items.id });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// deactivateItem
// ---------------------------------------------------------------------------

/**
 * Deactivates an item (sets is_active = false). Requires items.manage.
 * Warn-not-block: succeeds even when itemHasOperationalRecords returns true.
 * Existing committed lots, open wrr_items lines, and already-allocated
 * inventory_commitment_lines are NOT automatically cancelled — deactivation
 * only gates new use of the inactive item in downstream workflows.
 */
export async function deactivateItem(
  resolver: RequestAuthorizationResolver,
  db: DbLike,
  id: string,
  deps?: {
    itemHasOperationalRecords?: (
      db: DbLike,
      itemId: string,
    ) => Promise<boolean>;
  },
): Promise<ActionSimpleResult> {
  const denied = await checkPermission(resolver, "items.manage");
  if (denied) return denied;

  // Evaluate impact (warn-not-block — result is intentionally unused here)
  if (deps?.itemHasOperationalRecords) {
    await deps.itemHasOperationalRecords(db, id);
  }

  await db
    .update(items)
    .set({ isActive: false })
    .where(eq(items.id, id))
    .returning({ id: items.id });

  return { ok: true };
}

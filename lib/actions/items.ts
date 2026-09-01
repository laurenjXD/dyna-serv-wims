"use server";
// Item server actions — create, update, deactivate.
//
// Traceability:
//   specs/06-party-and-item-enrollment/requirements.md R4, R6.1
//   specs/06-party-and-item-enrollment/design.md §4 (Command boundary),
//     §6 (Item model, Barcode immutability, Item deactivation impact)
//   specs/00-steering/tech.md — RBAC from session, never from client params

import { and, eq, ne, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { RequestAuthorizationResolver } from "@/lib/rbac/session";
import { requirePermission } from "@/lib/rbac/guard";
import { parseItemInput, checkBarcodeUpdate } from "@/lib/enrollment/item-schema";
import { items } from "@/lib/db/schema/items";
import { parties } from "@/lib/db/schema/parties";
import { withRlsTransaction } from "@/lib/db/rls-transaction";
import type { RlsTransactionDeps } from "@/lib/db/rls-transaction";
import { rlsPool } from "@/lib/db/rls-pool";
import { getAuthenticatedSession } from "@/lib/auth/get-authenticated-session";

const defaultRlsDeps: RlsTransactionDeps = {
  getAuthenticatedSession,
  pool: rlsPool,
};

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

async function validateActiveOrganization(
  db: DbLike,
  organizationId: string,
): Promise<Record<string, string> | null> {
  const rows = await db
    .select({ id: parties.id, isActive: parties.isActive })
    .from(parties)
    .where(eq(parties.id, organizationId))
    .limit(1);

  if (rows.length === 0) {
    return { defaultSupplierPartyId: "The selected Organization no longer exists. Choose an active Organization." };
  }
  if (!rows[0].isActive) {
    return { defaultSupplierPartyId: "The selected Organization is inactive. Choose an active Organization." };
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
  input: unknown,
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
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

  let rlsResult;
  try {
    rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;
    const organizationErrors = await validateActiveOrganization(
      db,
      data.defaultSupplierPartyId!,
    );
    if (organizationErrors) {
      return { ok: false, fieldErrors: organizationErrors } satisfies ActionCreateResult;
    }

    // Duplicate code/barcode check (both have a DB-level UNIQUE constraint)
    // — without this, a collision throws a raw, uncaught Postgres
    // constraint-violation error straight out of the Server Action instead
    // of a friendly field error. Same pattern as updateItem below.
    const collisionRows = await db
      .select({ id: items.id, code: items.code, barcode: items.barcode })
      .from(items)
      .where(or(eq(items.code, data.code), eq(items.barcode, data.barcode)));

    const collisions = collisionRows as { id: string; code: string; barcode: string }[];
    const createFieldErrors: Record<string, string> = {};
    if (collisions.some((row) => row.code === data.code)) {
      createFieldErrors.code = "This item code is already in use.";
    }
    if (collisions.some((row) => row.barcode === data.barcode)) {
      createFieldErrors.barcode = "This barcode is already in use.";
    }
    if (Object.keys(createFieldErrors).length > 0) {
      return { ok: false, fieldErrors: createFieldErrors } satisfies ActionCreateResult;
    }

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
        vmiMovementCategory: data.vmiMovementCategory ?? undefined,
      })
      .returning({ id: items.id });

    return { ok: true, data: { id: inserted.id } } satisfies ActionCreateResult;
    });
  } catch (error) {
    const referenceId = randomUUID();
    console.error("Item create transaction failed", { referenceId, error });
    return {
      ok: false,
      error: `We could not save this item (reference ${referenceId}). The database rejected the request. Verify the Organization and required fields, then try again; contact support with this reference if it persists.`,
    };
  }

  if (rlsResult.kind === "unauthenticated") {
    return { ok: false, error: "Forbidden" };
  }
  return rlsResult.value;
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
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
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

  let rlsResult;
  try {
    rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;

    const organizationErrors = await validateActiveOrganization(
      db,
      parsed.data.defaultSupplierPartyId!,
    );
    if (organizationErrors) {
      return { ok: false, fieldErrors: organizationErrors } satisfies ActionResult;
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
      return { ok: false, error: "Not found" } satisfies ActionResult;
    }

    const row = currentRow as { id: string; barcode: string; updated_at: Date };

    // Stale-edit guard
    const dbTimestamp = row.updated_at.getTime();
    const submittedTimestamp = new Date(submittedUpdatedAt).getTime();
    if (dbTimestamp !== submittedTimestamp) {
      return { ok: false, error: "Conflict" } satisfies ActionResult;
    }

    // Duplicate code/barcode check, excluding this row itself — same
    // reasoning as createItem above.
    const collisionRows = await db
      .select({ id: items.id, code: items.code, barcode: items.barcode })
      .from(items)
      .where(
        and(
          ne(items.id, id),
          or(eq(items.code, parsed.data.code), eq(items.barcode, parsed.data.barcode)),
        ),
      );

    const collisions = collisionRows as { id: string; code: string; barcode: string }[];
    const updateFieldErrors: Record<string, string> = {};
    if (collisions.some((r) => r.code === parsed.data.code)) {
      updateFieldErrors.code = "This item code is already in use.";
    }
    if (collisions.some((r) => r.barcode === parsed.data.barcode)) {
      updateFieldErrors.barcode = "This barcode is already in use.";
    }
    if (Object.keys(updateFieldErrors).length > 0) {
      return { ok: false, fieldErrors: updateFieldErrors } satisfies ActionResult;
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
        } satisfies ActionResult;
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
        vmiMovementCategory: data.vmiMovementCategory ?? undefined,
      })
      .where(eq(items.id, id))
      .returning({ id: items.id });

    return { ok: true } satisfies ActionResult;
    });
  } catch (error) {
    const referenceId = randomUUID();
    console.error("Item update transaction failed", { referenceId, error });
    return {
      ok: false,
      error: `We could not update this item (reference ${referenceId}). The database rejected the request. Reload the item and try again; contact support with this reference if it persists.`,
    };
  }

  if (rlsResult.kind === "unauthenticated") {
    return { ok: false, error: "Forbidden" };
  }
  return rlsResult.value;
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
  id: string,
  deps?: {
    itemHasOperationalRecords?: (
      db: DbLike,
      itemId: string,
    ) => Promise<boolean>;
  },
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<ActionSimpleResult> {
  const denied = await checkPermission(resolver, "items.manage");
  if (denied) return denied;

  const rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;

    // Evaluate impact (warn-not-block — result is intentionally unused here)
    if (deps?.itemHasOperationalRecords) {
      await deps.itemHasOperationalRecords(db, id);
    }

    await db
      .update(items)
      .set({ isActive: false })
      .where(eq(items.id, id))
      .returning({ id: items.id });

    return { ok: true } satisfies ActionSimpleResult;
  });

  if (rlsResult.kind === "unauthenticated") {
    return { ok: false, error: "Forbidden" };
  }
  return rlsResult.value;
}

// Item list and detail query helpers, including helpers for dropdowns.
//
// Traceability:
//   specs/06-party-and-item-enrollment/design.md §6 (Item model), §7

import { eq, ilike, or, and, isNotNull, desc, sql } from "drizzle-orm";
import { items, itemCategories, parties, partyRoles, lots, wrrItems, inventoryTransactions } from "@/lib/db/schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbLike = { select: (...args: any[]) => any };

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ItemListRow = {
  id: string;
  code: string;
  name: string;
  barcode: string;
  uom: string;
  isActive: boolean;
  createdAt: Date;
};

export type ItemDetail = {
  id: string;
  code: string;
  supplierItemCode: string | null;
  customerItemCode: string | null;
  dsgcItemNumber: string | null;
  name: string;
  description: string | null;
  barcode: string;
  itemType: string;
  categoryId: string | null;
  defaultSupplierPartyId: string | null;
  uom: string;
  currency: string;
  buyingPrice: string | null;
  sellingPrice: string | null;
  spq: number;
  spqMeter: string | null;
  lengthCm: string | null;
  widthCm: string | null;
  heightCm: string | null;
  volumeCm3: string | null;
  volumeCbm: string;
  boxesPerPallet: number | null;
  weightKg: string | null;
  minReorderLevel: number;
  isPerishable: boolean;
  isActive: boolean;
  vmiMovementCategory: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CategoryOption = {
  id: string;
  name: string;
  flowType: string | null;
  parentId: string | null;
};

export type SupplierPartyOption = {
  id: string;
  code: string;
  name: string;
  roles?: string[];
  defaultInventoryModel?: "vmi" | "trading" | "supplies";
};

/** A catalog projection safe for the WRR pre-receiving form. */
export type WrrItemOption = {
  id: string;
  defaultSupplierPartyId: string | null;
  code: string;
  name: string;
  supplierItemCode: string | null;
  customerItemCode: string | null;
  dsgcItemNumber: string | null;
  uom: string;
  volumeCbm: string;
  spq: number;
};

/**
 * Lists active catalog items with the owning/supplying organization relation.
 * The client filters this small office-form projection after the operator
 * chooses the Vendor Organization; the server action still resolves the item
 * ID independently before staging the WRR.
 */
export async function listActiveWrrItemOptions(db: DbLike): Promise<WrrItemOption[]> {
  const rows = (await db
    .select({
      id: items.id,
      defaultSupplierPartyId: items.defaultSupplierPartyId,
      code: items.code,
      name: items.name,
      supplierItemCode: items.supplierItemCode,
      customerItemCode: items.customerItemCode,
      dsgcItemNumber: items.dsgcItemNumber,
      uom: items.uom,
      volumeCbm: items.volumeCbm,
      spq: items.spq,
    })
    .from(items)
    .where(eq(items.isActive, true))
    .orderBy(items.code)) as WrrItemOption[];

  return rows.map((r) => ({
    ...r,
    uom: r.uom.toLowerCase() === "pallet" ? "piece" : r.uom,
  }));
}

export type ItemOperationalRecords = {
  hasRelatedLots: boolean;
  hasRelatedWrrItems: boolean;
  hasRelatedInventoryTransactions: boolean;
};

export type ListResult<T> = {
  rows: T[];
  total: number;
};

export type ListItemsOpts = {
  search?: string | null;
  limit?: number;
  offset?: number;
};

// ---------------------------------------------------------------------------
// listItems
// ---------------------------------------------------------------------------

/**
 * Returns a paginated list of items, optionally filtered by search string
 * matched against code, name, and barcode. Ordered by created_at DESC.
 */
export async function listItems(
  db: DbLike,
  opts: ListItemsOpts = {},
): Promise<ListResult<ItemListRow>> {
  const limit = opts.limit ?? 25;
  const offset = opts.offset ?? 0;
  const search = opts.search?.trim() ?? null;

  const whereClause = search
    ? or(
        ilike(items.code, `%${search}%`),
        ilike(items.name, `%${search}%`),
        ilike(items.barcode, `%${search}%`),
        ilike(items.supplierItemCode, `%${search}%`),
        ilike(items.customerItemCode, `%${search}%`),
      )
    : undefined;

  const rawRows = await db
    .select({
      id: items.id,
      code: items.code,
      name: items.name,
      barcode: items.barcode,
      uom: items.uom,
      isActive: items.isActive,
      createdAt: items.createdAt,
    })
    .from(items)
    .where(whereClause)
    .orderBy(desc(items.createdAt))
    .limit(limit)
    .offset(offset);

  const [countRow] = await db
    .select({ count: sql<string>`count(*)` })
    .from(items)
    .where(whereClause);

  return {
    rows: (rawRows as ItemListRow[]).map((row) => ({
      ...row,
      uom: row.uom.toLowerCase() === "pallet" ? "piece" : row.uom,
    })),
    total: Number(countRow?.count ?? 0),
  };
}

// ---------------------------------------------------------------------------
// getItem
// ---------------------------------------------------------------------------

/**
 * Returns a single item's full detail, or null if not found.
 *
 * COLUMN SENSITIVITY: returns buyingPrice and sellingPrice from the base items
 * table. Per design.md §6 Price boundary and 02-rbac-roles §7.4, party users
 * must never receive these fields. Callers MUST gate by items.read (global)
 * before invoking — if a future code path calls this without that gate, those
 * columns are silently exposed. No RLS enforces this yet (cycle 2.4 pending).
 */
export async function getItem(
  db: DbLike,
  id: string,
): Promise<ItemDetail | null> {
  const rows = await db
    .select({
      id: items.id,
      code: items.code,
      supplierItemCode: items.supplierItemCode,
      customerItemCode: items.customerItemCode,
      dsgcItemNumber: items.dsgcItemNumber,
      name: items.name,
      description: items.description,
      barcode: items.barcode,
      itemType: items.itemType,
      categoryId: items.categoryId,
      defaultSupplierPartyId: items.defaultSupplierPartyId,
      uom: items.uom,
      currency: items.currency,
      buyingPrice: items.buyingPrice,
      sellingPrice: items.sellingPrice,
      spq: items.spq,
      spqMeter: items.spqMeter,
      lengthCm: items.lengthCm,
      widthCm: items.widthCm,
      heightCm: items.heightCm,
      volumeCm3: items.volumeCm3,
      volumeCbm: items.volumeCbm,
      boxesPerPallet: items.boxesPerPallet,
      weightKg: items.weightKg,
      minReorderLevel: items.minReorderLevel,
      isPerishable: items.isPerishable,
      isActive: items.isActive,
      createdAt: items.createdAt,
      updatedAt: items.updatedAt,
    })
    .from(items)
    .where(eq(items.id, id))
    .limit(1);

  const item = (rows[0] as ItemDetail | undefined) ?? null;
  if (item && item.uom.toLowerCase() === "pallet") {
    item.uom = "piece";
  }
  return item;
}

// ---------------------------------------------------------------------------
// getItemOperationalRecords
// ---------------------------------------------------------------------------

/**
 * Checks whether the item has any operational records that would block a
 * barcode change. Used in the edit page to conditionally disable the barcode
 * field per design.md §6 Barcode immutability.
 */
export async function getItemOperationalRecords(
  db: DbLike,
  itemId: string,
): Promise<ItemOperationalRecords> {
  const [lotCheck] = await db
    .select({ count: sql<string>`count(*)` })
    .from(lots)
    .where(eq(lots.itemId, itemId));

  const [wrrCheck] = await db
    .select({ count: sql<string>`count(*)` })
    .from(wrrItems)
    .where(and(
      eq(wrrItems.itemId, itemId),
      isNotNull(wrrItems.itemId),
    ));

  const [txCheck] = await db
    .select({ count: sql<string>`count(*)` })
    .from(inventoryTransactions)
    .where(eq(inventoryTransactions.itemId, itemId));

  return {
    hasRelatedLots: Number(lotCheck?.count ?? 0) > 0,
    hasRelatedWrrItems: Number(wrrCheck?.count ?? 0) > 0,
    hasRelatedInventoryTransactions: Number(txCheck?.count ?? 0) > 0,
  };
}

// ---------------------------------------------------------------------------
// getActiveSupplierParties
// ---------------------------------------------------------------------------

/**
 * Returns active parties that hold the vendor or supplier business role.
 * Used in the item create/edit form's default supplier selector.
 * design.md §6 Default supplier: "queries active authorized parties whose
 * party_roles include supplier or vendor".
 */
export async function getActiveSupplierParties(
  db: DbLike,
): Promise<SupplierPartyOption[]> {
  const rows = (await db
    .select({
      id: parties.id,
      code: parties.code,
      name: parties.name,
      role: partyRoles.role,
    })
    .from(parties)
    .innerJoin(partyRoles, eq(partyRoles.partyId, parties.id))
    .where(
      and(
        eq(parties.isActive, true),
        or(
          eq(partyRoles.role, "vendor" as const),
          eq(partyRoles.role, "supplier" as const),
          eq(partyRoles.role, "customer" as const),
          eq(partyRoles.role, "end_customer" as const),
          eq(partyRoles.role, "internal_warehouse" as const),
        ),
      ),
    )
    .orderBy(parties.name)) as Array<{
      id: string;
      code: string;
      name: string;
      role: string;
    }>;

  // Group roles by party
  const map = new Map<string, { id: string; code: string; name: string; roles: string[] }>();
  for (const row of rows) {
    const existing = map.get(row.id);
    if (!existing) {
      map.set(row.id, {
        id: row.id,
        code: row.code,
        name: row.name,
        roles: [row.role],
      });
    } else {
      if (!existing.roles.includes(row.role)) {
        existing.roles.push(row.role);
      }
    }
  }

  return Array.from(map.values()).map((p) => {
    // Map assigned party role to automatic default inventory model
    let defaultInventoryModel: "vmi" | "trading" | "supplies" | undefined;
    if (p.roles.includes("vendor")) {
      defaultInventoryModel = "vmi";
    } else if (p.roles.includes("supplier")) {
      defaultInventoryModel = "trading";
    } else if (p.roles.includes("internal_warehouse")) {
      defaultInventoryModel = "supplies";
    } else if (p.roles.includes("customer") || p.roles.includes("end_customer")) {
      defaultInventoryModel = "trading";
    }

    return {
      id: p.id,
      code: p.code,
      name: p.name,
      roles: p.roles,
      defaultInventoryModel,
    };
  });
}

// ---------------------------------------------------------------------------
// getItemCategories
// ---------------------------------------------------------------------------

/**
 * Returns all item_categories records for the category dropdown.
 * This feature reads them read-only; creation/management belongs to spec 17.
 * design.md §6 Category ownership.
 *
 * Callers MUST gate by items.read (global) before invoking — access to category
 * reference data is covered by items.read per design.md §4.
 */
export async function getItemCategories(
  db: DbLike,
): Promise<CategoryOption[]> {
  const rows = await db
    .select({
      id: itemCategories.id,
      name: itemCategories.name,
      flowType: itemCategories.flowType,
      parentId: itemCategories.parentId,
    })
    .from(itemCategories)
    .orderBy(itemCategories.name);

  return rows as CategoryOption[];
}

// Item list and detail query helpers, including helpers for dropdowns.
//
// Traceability:
//   specs/06-party-and-item-enrollment/design.md §6 (Item model), §7

import { eq, ilike, or, and, isNotNull, desc, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { items, itemCategories, parties, partyRoles, partyFlowRelationships, lots, wrrItems, inventoryTransactions } from "@/lib/db/schema";

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
  relationship?: "vmi_customer" | "trading_customer" | "trading_supplier" | "internal_supplies";
  relationships?: Array<"vmi_customer" | "trading_customer" | "trading_supplier" | "internal_supplies">;
  defaultInventoryModel?: "vmi" | "trading" | "supplies";
};

/** A catalog projection safe for the WRR pre-receiving form. */
export type WrrItemOption = {
  id: string;
  defaultSupplierPartyId: string | null;
  code: string;
  name: string;
  description: string | null;
  supplierItemCode: string | null;
  customerItemCode: string | null;
  dsgcItemNumber: string | null;
  uom: string;
  volumeCbm: string;
  spq: number;
  isPerishable: boolean;
};

/**
 * Lists active catalog items for the WRR office form. Existing inventory
 * imports predate the required item-to-organization field and therefore have
 * a nullable `defaultSupplierPartyId`; they must still be selectable so an
 * operator can receive them against the WRR's selected source organization.
 * The client marks those legacy rows as unassigned, while the server action
 * still rejects an explicitly assigned item from a different organization.
 */
export async function listActiveWrrItemOptions(db: DbLike): Promise<WrrItemOption[]> {
  try {
    const rows = (await db
      .select({
        id: items.id,
        defaultSupplierPartyId: items.defaultSupplierPartyId,
        code: items.code,
        name: items.name,
        description: items.description,
        supplierItemCode: items.supplierItemCode,
        customerItemCode: items.customerItemCode,
        dsgcItemNumber: items.dsgcItemNumber,
        uom: items.uom,
        volumeCbm: items.volumeCbm,
        spq: items.spq,
        isPerishable: items.isPerishable,
      })
      .from(items)
      .where(eq(items.isActive, true))
      .orderBy(items.code)) as WrrItemOption[];

    return rows.map((r) => ({
      ...r,
      uom: r.uom.toLowerCase() === "pallet" ? "piece" : r.uom,
    }));
  } catch (error) {
    // Keep the receiving picker useful during a rolling deployment where a
    // newly-added catalog identity column may not yet exist on the database.
    // The assignment filter and server-side assignment validation remain in
    // force; this fallback only omits optional display aliases.
    console.error("[items] full WRR item options unavailable; retrying core catalog projection", error);
    try {
      const rows = (await db
        .select({
          id: items.id,
          defaultSupplierPartyId: items.defaultSupplierPartyId,
          code: items.code,
          name: items.name,
          description: items.description,
          customerItemCode: items.customerItemCode,
          uom: items.uom,
          volumeCbm: items.volumeCbm,
          spq: items.spq,
          isPerishable: items.isPerishable,
        })
        .from(items)
        .where(eq(items.isActive, true))
        .orderBy(items.code)) as Array<Omit<WrrItemOption, "supplierItemCode" | "dsgcItemNumber">>;

      return rows.map((row) => ({
        ...row,
        supplierItemCode: null,
        dsgcItemNumber: null,
        uom: row.uom.toLowerCase() === "pallet" ? "piece" : row.uom,
      }));
    } catch (fallbackError) {
      console.error("[items] core WRR item options unavailable", fallbackError);
      return [];
    }
  }
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

export const getItemDetail = getItem;

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
 * Returns active organizations that may be selected as the source party for
 * receiving and item setup. The role column is cast to text deliberately:
 * party_role was canonicalized by migration 0049, and comparing it to a
 * value that is no longer present in the live enum makes PostgreSQL reject
 * the entire query (which previously made the WRR selector look empty).
 *
 * design.md §6 Default supplier: "queries active authorized parties whose
 * party_roles include supplier or vendor".
 */
export async function getActiveSupplierParties(
  db: DbLike,
): Promise<SupplierPartyOption[]> {
  return listActivePartyOptions(
    db,
    sql`(${partyRoles.role}::text = 'supplier' OR ${partyFlowRelationships.relationship}::text = 'vmi_customer')`,
    new Set(["supplier"]),
  );
}

/**
 * Returns the active organizations allowed as the source organization on a
 * WRR. End customers and internal organizations are deliberately excluded:
 * they may exist in the party directory, but they are not inbound source
 * organizations for this form.
 */
export async function getActiveWrrOrganizations(
  db: DbLike,
): Promise<SupplierPartyOption[]> {
  return listActivePartyOptions(
    db,
    sql`${partyRoles.role}::text IN ('vendor', 'supplier', 'customer', 'internal_warehouse', 'internal_supplies')`,
    new Set(["supplier", "customer"]),
  );
}

async function listActivePartyOptions(
  db: DbLike,
  roleFilter: SQL<unknown>,
  allowedRoles?: ReadonlySet<string>,
): Promise<SupplierPartyOption[]> {
  let rows: Array<{ id: string; code: string; name: string; role: string; relationship: string | null }>;
  let hasRelationshipJoin = false;
  try {
    const baseQuery = db
      .select({
        id: parties.id,
        code: parties.code,
        name: parties.name,
        role: partyRoles.role,
        relationship: partyFlowRelationships.relationship,
      })
      .from(parties)
      .innerJoin(partyRoles, eq(partyRoles.partyId, parties.id));
    hasRelationshipJoin = typeof baseQuery.leftJoin === "function";
    const relationshipQuery = hasRelationshipJoin
      ? baseQuery.leftJoin(partyFlowRelationships, eq(partyFlowRelationships.partyId, parties.id))
      : baseQuery;
    rows = (await relationshipQuery.where(
        and(
          eq(parties.isActive, true),
          // Keep this comparison enum-version tolerant. The live database's
          // canonical enum does not contain the historical
          // `internal_supplies` value, so binding that string as an enum
          // parameter would fail the whole query before any rows are read.
          roleFilter,
          sql`${partyFlowRelationships.id} IS NULL OR ${partyFlowRelationships.isActive} = true`,
        ),
      )
      .orderBy(parties.name)) as Array<{
        id: string;
        code: string;
        name: string;
        role: string;
        relationship: string | null;
      }>;
  } catch (error) {
    console.error("[items] active supplier parties unavailable", error);
    rows = [];
  }

  const map = new Map<string, SupplierPartyOption>();
  for (const row of rows) {
    // Normalize legacy role labels for the presentation model. Migration
    // 0049 maps these values in the canonical database, but keeping this
    // boundary tolerant also supports older environments during rollout.
    const role = row.role === "vendor"
      ? "supplier"
      : row.role === "internal_warehouse"
        ? "internal_supplies"
        : row.role;
    const relationship = row.relationship === "vmi_customer" || row.relationship === "trading_customer" || row.relationship === "trading_supplier"
      ? row.relationship
      : role === "supplier"
        ? "trading_supplier"
        : role === "internal_supplies"
          ? "internal_supplies"
          : undefined;
    if (allowedRoles && !allowedRoles.has(role) && relationship !== "vmi_customer") continue;
    const existing = map.get(row.id);
    if (!existing) {
      map.set(row.id, {
        id: row.id,
        code: row.code,
        name: row.name,
        roles: [role],
        relationship,
        relationships: relationship ? [relationship] : [],
      });
    } else {
      if (!existing.roles?.includes(role)) existing.roles = [...(existing.roles ?? []), role];
      if (relationship && !existing.relationships?.includes(relationship)) {
        existing.relationships = [...(existing.relationships ?? []), relationship];
      }
    }
  }

  return Array.from(map.values()).map((p) => {
    // Older lightweight query doubles do not expose the relationship join.
    // Preserve their established option contract while the real query uses
    // explicit relationship metadata for organization-scoped selectors.
    const fallbackModel = p.roles?.includes("customer") ? "vmi" : "trading";
    if (!hasRelationshipJoin) {
      return {
        id: p.id,
        code: p.code,
        name: p.name,
        roles: p.roles,
        defaultInventoryModel: fallbackModel as "vmi" | "trading",
      };
    }
    return {
      ...p,
      defaultInventoryModel: p.relationships?.length === 1
        ? p.relationships[0] === "vmi_customer" ? "vmi" : p.relationships[0] === "internal_supplies" ? "supplies" : "trading"
        : undefined,
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

// ---------------------------------------------------------------------------
// getNextSuggestedItemCodes
// ---------------------------------------------------------------------------

export type SuggestedItemCodes = {
  nextDsgcCode: string;
  nextGenericCode: string;
};

/**
 * Scans existing items to calculate the next available serialized codes:
 * - DSGC Trading code: DSGC-TRD-XXXX (e.g. DSGC-TRD-0001, DSGC-TRD-0002)
 * - Generic Item code: ITM-XXXXX (e.g. ITM-00001, ITM-00002)
 */
export async function getNextSuggestedItemCodes(
  db: DbLike,
): Promise<SuggestedItemCodes> {
  try {
    const rows = await db
      .select({
        code: items.code,
        dsgcItemNumber: items.dsgcItemNumber,
      })
      .from(items);

    let maxDsgcNum = 0;
    let maxGenericNum = 0;

    for (const row of rows as { code: string; dsgcItemNumber: string | null }[]) {
      // Check DSGC-TRD-XXXX pattern across code and dsgcItemNumber
      const dsgcCandidate = row.dsgcItemNumber || row.code;
      if (dsgcCandidate) {
        const dsgcMatch = dsgcCandidate.match(/^DSGC-TRD-(\d+)$/i);
        if (dsgcMatch && dsgcMatch[1]) {
          const num = parseInt(dsgcMatch[1], 10);
          if (!isNaN(num) && num > maxDsgcNum) {
            maxDsgcNum = num;
          }
        }
      }

      // Check ITM-XXXXX pattern across code
      if (row.code) {
        const itmMatch = row.code.match(/^ITM-(\d+)$/i);
        if (itmMatch && itmMatch[1]) {
          const num = parseInt(itmMatch[1], 10);
          if (!isNaN(num) && num > maxGenericNum) {
            maxGenericNum = num;
          }
        }
      }
    }

    const nextDsgcNum = maxDsgcNum + 1;
    const nextGenericNum = maxGenericNum + 1;

    return {
      nextDsgcCode: `DSGC-TRD-${String(nextDsgcNum).padStart(4, "0")}`,
      nextGenericCode: `ITM-${String(nextGenericNum).padStart(5, "0")}`,
    };
  } catch {
    return {
      nextDsgcCode: "DSGC-TRD-0001",
      nextGenericCode: "ITM-00001",
    };
  }
}

// Live Stock View query and read-only FIFO/FEFO allocation preview.
//
// Traceability:
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/design.md §5
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/requirements.md R3

import { and, asc, eq, gt, sql } from "drizzle-orm";
import { items } from "@/lib/db/schema/items";
import { locations } from "@/lib/db/schema/locations";
import { lotLocationBalances } from "@/lib/db/schema/lot_location_balances";
import { lots } from "@/lib/db/schema/lots";
import { allocate, type AllocationResult } from "@/lib/withdrawal/allocation";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbLike = { select: (...args: any[]) => any };

export type StockViewRow = {
  itemId: string;
  itemCode: string;
  itemName: string;
  flowType?: "vmi" | "trading" | "supplies";
  uom: string;
  isPerishable: boolean;
  lotId: string;
  lotNumber: string;
  lotStatus: string;
  expiryDate: string | null;
  receivedAt: Date;
  locationId: string;
  locationLabel: string;
  qtyRemaining: number;
  qtyCommitted: number;
};

export type StockAllocationPreview =
  | { ok: true; strategy: "FIFO" | "FEFO"; lines: Array<{ lotId: string; locationId: string; qtyAllocated: number }> }
  | { ok: false; strategy: "FIFO" | "FEFO"; error: "insufficient_stock" };

/**
 * Reads only uncommitted, pickable stock. The availability predicate is kept
 * at the database boundary; `buildStockAllocationPreview` re-applies the
 * domain gate so a stale or broader caller cannot allocate held stock.
 */
export async function listStockView(db: DbLike): Promise<StockViewRow[]> {
  return (await db
    .select({
      itemId: items.id,
      itemCode: items.code,
      itemName: items.name,
      flowType: lots.flowType,
      uom: items.uom,
      isPerishable: items.isPerishable,
      lotId: lots.id,
      lotNumber: lots.lotNumber,
      lotStatus: lots.status,
      expiryDate: lots.expiryDate,
      receivedAt: lots.createdAt,
      locationId: locations.id,
      locationLabel: locations.label,
      qtyRemaining: lotLocationBalances.qtyRemaining,
      qtyCommitted: lotLocationBalances.qtyCommitted,
    })
    .from(lotLocationBalances)
    .innerJoin(lots, eq(lotLocationBalances.lotId, lots.id))
    .innerJoin(items, eq(lots.itemId, items.id))
    .innerJoin(locations, eq(lotLocationBalances.locationId, locations.id))
    .where(and(
      eq(lots.status, "available"),
      gt(sql`${lotLocationBalances.qtyRemaining} - ${lotLocationBalances.qtyCommitted}`, 0),
    ))
    .orderBy(asc(items.code), asc(lots.expiryDate), asc(lots.createdAt))) as StockViewRow[];
}

export type PartyVmiInventoryRow = {
  id: string;
  itemCode: string;
  itemName: string;
  lotNumber: string;
  locationLabel: string;
  qtyOnHand: number;
  lotStatus: string;
};

/**
 * Party Portal — VMI inventory-position read, scoped to the caller's own
 * party.
 *
 * Traceability: specs/22-parties-portal/design.md §5, tasks.md Task 3 —
 * "Build the scoped lot_location_balances read joined to parent lots,
 * using exactly the can_access_party_resource('lot_location_balances',
 * 'read', lots.owner_party_id, 'vmi') RLS pattern." `flow_type = 'vmi'`
 * and `owner_party_id = partyId` are both applied here at the query-shape
 * level; the caller MUST have already authorized `reporting.read` scoped
 * to this exact partyId via requirePermission before invoking this.
 *
 * Never selects buying_price, selling_price, default_supplier_party_id, or
 * min_reorder_level (requirements.md R2), and never queries
 * inventory_transactions (requirements.md R2.4).
 */
export async function listPartyVmiInventory(
  db: DbLike,
  partyId: string,
): Promise<PartyVmiInventoryRow[]> {
  return (await db
    .select({
      id: lotLocationBalances.id,
      itemCode: items.code,
      itemName: items.name,
      lotNumber: lots.lotNumber,
      locationLabel: locations.label,
      qtyOnHand: lotLocationBalances.qtyRemaining,
      lotStatus: lots.status,
    })
    .from(lotLocationBalances)
    .innerJoin(lots, eq(lotLocationBalances.lotId, lots.id))
    .innerJoin(items, eq(lots.itemId, items.id))
    .innerJoin(locations, eq(lotLocationBalances.locationId, locations.id))
    .where(
      and(eq(lots.flowType, "vmi"), eq(lots.ownerPartyId, partyId)),
    )
    .orderBy(asc(items.code), asc(lots.lotNumber))) as PartyVmiInventoryRow[];
}

/**
 * Derives the standard allocation plan for one item without reserving stock.
 * Commitment must always re-query and revalidate this plan inside its own
 * transaction; this helper is intentionally a preview only.
 */
export function buildStockAllocationPreview(
  rows: StockViewRow[],
  itemId: string,
  requestedQty: number,
): StockAllocationPreview {
  const itemRows = rows.filter((row) => row.itemId === itemId);
  const isPerishable = itemRows[0]?.isPerishable ?? false;
  const strategy = isPerishable ? "FEFO" : "FIFO";
  const result: AllocationResult = allocate(
    itemRows.map((row) => ({
      lotId: row.lotId,
      locationId: row.locationId,
      lotStatus: row.lotStatus,
      qtyRemaining: row.qtyRemaining,
      qtyCommitted: row.qtyCommitted,
      receivedAt: row.receivedAt,
      expiryDate: row.expiryDate ? new Date(`${row.expiryDate}T00:00:00.000Z`) : null,
    })),
    requestedQty,
    isPerishable,
  );

  return result.ok
    ? { ok: true, strategy, lines: result.lines }
    : { ok: false, strategy, error: "insufficient_stock" };
}

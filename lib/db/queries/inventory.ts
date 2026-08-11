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
  uom: string;
  isPerishable: boolean;
  minReorderLevel: number;
  spq: number;
  volumeCbm: number;
  lotId: string;
  lotNumber: string;
  lotStatus: string;
  flowType: string;
  unitCost: string | null;
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
      uom: items.uom,
      isPerishable: items.isPerishable,
      minReorderLevel: items.minReorderLevel,
      spq: items.spq,
      volumeCbm: items.volumeCbm,
      lotId: lots.id,
      lotNumber: lots.lotNumber,
      lotStatus: lots.status,
      flowType: lots.flowType,
      unitCost: lots.unitCost,
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

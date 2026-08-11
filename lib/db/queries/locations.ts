// Location list and detail query helpers.
//
// Traceability:
//   specs/06-party-and-item-enrollment/design.md §6a (Location model), §7
//   specs/01-core-data-model/design.md §5 item 10 (Smart Dispersed Putaway
//     Location Recommendation Engine — "queries available storage slots
//     (max_cbm_capacity - occupied_cbm), filtering locations that fit the
//     item's box CBM (volume_cbm)")
//   specs/07-incoming-receiving/design.md §6.2 (store-disposition sequence:
//     suggested location via "the §10 location/capacity suggestion interface
//     (remaining CBM vs. candidate locations)"), §10 (Incoming Ledger/receiving
//     "consumes the approved location/capacity suggestion interface... does
//     not create a second capacity calculation")

import { and, eq, ilike, or, desc, sql } from "drizzle-orm";
import { locations, lotLocationBalances, lots, items } from "@/lib/db/schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbLike = { select: (...args: any[]) => any };

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type LocationListRow = {
  id: string;
  zone: string;
  rack: string;
  level: string;
  position: string;
  label: string;
  locationType: string;
  maxCbmCapacity: string;
  maxWeightCapacity: string;
  isActive: boolean;
  createdAt: Date;
};

export type LocationDetail = {
  id: string;
  zone: string;
  rack: string;
  level: string;
  position: string;
  label: string;
  locationType: string;
  maxCbmCapacity: string;
  maxWeightCapacity: string;
  isActive: boolean;
  createdAt: Date;
};

export type ListResult<T> = {
  rows: T[];
  total: number;
};

export type ListLocationsOpts = {
  search?: string | null;
  limit?: number;
  offset?: number;
};

// ---------------------------------------------------------------------------
// listLocations
// ---------------------------------------------------------------------------

/**
 * Returns a paginated list of locations, optionally filtered by search string
 * matched against zone, rack, level, position, label, and location_type.
 * Ordered by label ASC for predictable rack ordering.
 *
 * Callers must gate by locations.read before invoking.
 */
export async function listLocations(
  db: DbLike,
  opts: ListLocationsOpts = {},
): Promise<ListResult<LocationListRow>> {
  const limit = opts.limit ?? 25;
  const offset = opts.offset ?? 0;
  const search = opts.search?.trim() ?? null;

  const whereClause = search
    ? or(
        ilike(locations.zone, `%${search}%`),
        ilike(locations.rack, `%${search}%`),
        ilike(locations.level, `%${search}%`),
        ilike(locations.position, `%${search}%`),
        ilike(locations.label, `%${search}%`),
        ilike(locations.locationType, `%${search}%`),
      )
    : undefined;

  const rawRows = await db
    .select({
      id: locations.id,
      zone: locations.zone,
      rack: locations.rack,
      level: locations.level,
      position: locations.position,
      label: locations.label,
      locationType: locations.locationType,
      maxCbmCapacity: locations.maxCbmCapacity,
      maxWeightCapacity: locations.maxWeightCapacity,
      isActive: locations.isActive,
      createdAt: locations.createdAt,
    })
    .from(locations)
    .where(whereClause)
    .orderBy(locations.label)
    .limit(limit)
    .offset(offset);

  const [countRow] = await db
    .select({ count: sql<string>`count(*)` })
    .from(locations)
    .where(whereClause);

  return {
    rows: rawRows as LocationListRow[],
    total: Number(countRow?.count ?? 0),
  };
}

// ---------------------------------------------------------------------------
// getLocation
// ---------------------------------------------------------------------------

/**
 * Returns a single location's full detail, or null if not found.
 * Callers must gate by locations.read before invoking.
 */
export async function getLocation(
  db: DbLike,
  id: string,
): Promise<LocationDetail | null> {
  const rows = await db
    .select({
      id: locations.id,
      zone: locations.zone,
      rack: locations.rack,
      level: locations.level,
      position: locations.position,
      label: locations.label,
      locationType: locations.locationType,
      maxCbmCapacity: locations.maxCbmCapacity,
      maxWeightCapacity: locations.maxWeightCapacity,
      isActive: locations.isActive,
      createdAt: locations.createdAt,
    })
    .from(locations)
    .where(eq(locations.id, id))
    .limit(1);

  return (rows[0] as LocationDetail | undefined) ?? null;
}

// ---------------------------------------------------------------------------
// suggestPutawayLocations
// ---------------------------------------------------------------------------

export type PutawayCandidate = {
  id: string;
  label: string;
  locationType: string;
  maxCbmCapacity: number;
  occupiedCbm: number;
  remainingCbm: number;
};

export type SuggestPutawayLocationsOpts = {
  /** CBM per unit for the quantity being placed. Callers pass the WRR line's
   *  own `wrr_items.unit_cbm` (design.md §5.1/§6.2), not the item master's
   *  `items.volume_cbm`, since the WRR line is what's specifically being
   *  received and may carry a shipment-specific value. */
  itemUnitCbm: number;
  requestedQty: number;
  /** Max number of candidates to return. Defaults to 5 (one suggestion plus
   *  a small set of override alternatives for the accept/override dropdown). */
  limit?: number;
};

/**
 * Suggests active `storage` locations with enough remaining CBM capacity to
 * hold `requestedQty * itemUnitCbm`, for the floor scan "Store" step
 * (07-incoming-receiving design.md §6.2).
 *
 * `occupied_cbm` is not a stored column — it is computed per location as
 * sum(lot_location_balances.qty_remaining * lots.item's items.volume_cbm)
 * over all balances currently held at that location (01 design.md §5 item 10).
 * `remaining_cbm = max_cbm_capacity - occupied_cbm`.
 *
 * Candidates are ordered best-fit-first: ascending remaining CBM among
 * locations that still satisfy the requested CBM. This is a deliberate,
 * simple choice — tightest-fit-first packs partially-used locations before
 * opening new ones, and is simpler to reason about than "most available
 * capacity first" (which would spread stock thin across many locations).
 *
 * Scope: this returns only the minimal ranked candidate list the floor scan
 * screen needs for one suggested location plus override options. It does not
 * implement multi-location dispersed split, the inventory preview panel, or
 * CBM-utilization-% UI (01 design.md §5 item 10's fuller feature) — those are
 * a separate, larger UI feature and are explicitly out of scope here.
 *
 * Callers must gate by the caller's own receiving capability before invoking;
 * this function performs no authorization itself.
 */
export async function suggestPutawayLocations(
  db: DbLike,
  opts: SuggestPutawayLocationsOpts,
): Promise<PutawayCandidate[]> {
  const requestedCbm = opts.itemUnitCbm * opts.requestedQty;
  const limit = opts.limit ?? 5;

  const occupiedCbmExpr = sql<string>`coalesce(sum(${lotLocationBalances.qtyRemaining} * ${items.volumeCbm}), 0)`;

  const rows = await db
    .select({
      id: locations.id,
      label: locations.label,
      locationType: locations.locationType,
      maxCbmCapacity: locations.maxCbmCapacity,
      occupiedCbm: occupiedCbmExpr,
    })
    .from(locations)
    .leftJoin(lotLocationBalances, eq(lotLocationBalances.locationId, locations.id))
    .leftJoin(lots, eq(lots.id, lotLocationBalances.lotId))
    .leftJoin(items, eq(items.id, lots.itemId))
    .where(and(eq(locations.locationType, "storage"), eq(locations.isActive, true)))
    .groupBy(locations.id, locations.label, locations.locationType, locations.maxCbmCapacity);

  const candidates: PutawayCandidate[] = (rows as Array<{
    id: string;
    label: string;
    locationType: string;
    maxCbmCapacity: string | number;
    occupiedCbm: string | number | null;
  }>).map((row) => {
    const maxCbmCapacity = Number(row.maxCbmCapacity);
    const occupiedCbm = Number(row.occupiedCbm ?? 0);
    return {
      id: row.id,
      label: row.label,
      locationType: row.locationType,
      maxCbmCapacity,
      occupiedCbm,
      remainingCbm: maxCbmCapacity - occupiedCbm,
    };
  });

  return candidates
    .filter((c) => c.remainingCbm >= requestedCbm)
    .sort((a, b) => a.remainingCbm - b.remainingCbm)
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Convenience: re-export desc for external callers that only import from here
// ---------------------------------------------------------------------------
export { desc };

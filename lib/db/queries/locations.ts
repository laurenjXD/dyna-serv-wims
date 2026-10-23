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

import { and, eq, ilike, or, desc, gt, inArray, sql } from "drizzle-orm";
import { locations, lotLocationBalances, lots, items, parties } from "@/lib/db/schema";
import { WAREHOUSE_MAP_CELLS } from "@/lib/location-map/layout";
import { getLocationMapStatus, getLocationUtilizationPct } from "@/lib/location-map/status";
import { piecesToBoxes } from "@/lib/inventory/quantities";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbLike = { select: (...args: any[]) => any };

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type LocationListRow = {
  id: string;
  zone: string;
  rack: string | null;
  level: string | null;
  position: string | null;
  label: string | null;
  locationType: string;
  maxCbmCapacity: string | null;
  isActive: boolean;
  createdAt: Date;
};

export type LocationDetail = {
  id: string;
  zone: string;
  rack: string | null;
  level: string | null;
  position: string | null;
  label: string | null;
  locationType: string;
  maxCbmCapacity: string | null;
  isActive: boolean;
  createdAt: Date;
};

export type LocationMapRow = LocationListRow & {
  occupiedCbm: number;
  utilizationPct: number | null;
  status: ReturnType<typeof getLocationMapStatus>;
  itemCount: number;
  lotCount: number;
  totalUnits: number;
  totalBoxes: number;
  itemCodes: string[];
  lotNumbers: string[];
  organizationNames: string[];
  isMapped: boolean;
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

/**
 * Returns the complete read model used by the warehouse map. The map is
 * intentionally backed by the same lot-location balances as detail and
 * putaway screens; it does not maintain a second inventory projection.
 *
 * Callers must gate by locations.read before invoking.
 */
export async function listLocationMapRows(db: DbLike): Promise<LocationMapRow[]> {
  const mappedLabels = new Set(WAREHOUSE_MAP_CELLS.map((cell) => cell.label));
  const occupiedCbmExpr = sql<string>`coalesce(sum(case when ${lotLocationBalances.qtyRemaining} > 0 then (${lotLocationBalances.qtyRemaining}::numeric / nullif(${items.spq}, 0)) * coalesce(${items.volumeCbm}, 0) else 0 end), 0)`;
  const totalUnitsExpr = sql<string>`coalesce(sum(case when ${lotLocationBalances.qtyRemaining} > 0 then ${lotLocationBalances.qtyRemaining} else 0 end), 0)`;
  const totalBoxesExpr = sql<string>`coalesce(sum(case when ${lotLocationBalances.qtyRemaining} > 0 then (${lotLocationBalances.qtyRemaining}::numeric / nullif(${items.spq}, 0)) else 0 end), 0)`;
  const itemCountExpr = sql<string>`count(distinct ${items.id})`;
  const lotCountExpr = sql<string>`count(distinct ${lots.id})`;
  const itemCodesExpr = sql<string[]>`coalesce(array_agg(distinct ${items.code}) filter (where ${items.code} is not null), '{}')`;
  const lotNumbersExpr = sql<string[]>`coalesce(array_agg(distinct ${lots.lotNumber}) filter (where ${lots.lotNumber} is not null), '{}')`;
  const organizationNamesExpr = sql<string[]>`coalesce(array_agg(distinct ${parties.name}) filter (where ${parties.name} is not null), '{}')`;

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
      isActive: locations.isActive,
      createdAt: locations.createdAt,
      occupiedCbm: occupiedCbmExpr,
      totalUnits: totalUnitsExpr,
      totalBoxes: totalBoxesExpr,
      itemCount: itemCountExpr,
      lotCount: lotCountExpr,
      itemCodes: itemCodesExpr,
      lotNumbers: lotNumbersExpr,
      organizationNames: organizationNamesExpr,
    })
    .from(locations)
    .leftJoin(
      lotLocationBalances,
      and(
        eq(lotLocationBalances.locationId, locations.id),
        gt(lotLocationBalances.qtyRemaining, 0),
      ),
    )
    .leftJoin(lots, eq(lots.id, lotLocationBalances.lotId))
    .leftJoin(items, eq(items.id, lots.itemId))
    .leftJoin(parties, eq(parties.id, lots.ownerPartyId))
    .groupBy(
      locations.id,
      locations.zone,
      locations.rack,
      locations.level,
      locations.position,
      locations.label,
      locations.locationType,
      locations.maxCbmCapacity,
      locations.isActive,
      locations.createdAt,
    )
    .orderBy(locations.label);

  return (rawRows as Array<{
    id: string;
    zone: string;
    rack: string | null;
    level: string | null;
    position: string | null;
    label: string | null;
    locationType: string;
    maxCbmCapacity: string | number | null;
    isActive: boolean;
    createdAt: Date;
    occupiedCbm: string | number | null;
    totalUnits: string | number | null;
    totalBoxes: string | number | null;
    itemCount: string | number | null;
    lotCount: string | number | null;
    itemCodes: string[] | null;
    lotNumbers: string[] | null;
    organizationNames: string[] | null;
  }>).map((row) => {
    const maxCbmCapacity = Number(row.maxCbmCapacity ?? 0);
    const occupiedCbm = Number(row.occupiedCbm ?? 0);
    const isMapped = row.label !== null && mappedLabels.has(row.label);

    return {
      id: row.id,
      zone: row.zone,
      rack: row.rack,
      level: row.level,
      position: row.position,
      label: row.label,
      locationType: row.locationType,
      maxCbmCapacity: row.maxCbmCapacity === null ? null : String(row.maxCbmCapacity),
      isActive: row.isActive,
      createdAt: row.createdAt,
      occupiedCbm,
      utilizationPct: getLocationUtilizationPct(maxCbmCapacity, occupiedCbm),
      status: getLocationMapStatus({
        isActive: row.isActive,
        maxCbmCapacity,
        occupiedCbm,
        isMapped,
      }),
      itemCount: Number(row.itemCount ?? 0),
      lotCount: Number(row.lotCount ?? 0),
      totalUnits: Number(row.totalUnits ?? 0),
      totalBoxes: Number(row.totalBoxes ?? 0),
      itemCodes: row.itemCodes ?? [],
      lotNumbers: row.lotNumbers ?? [],
      organizationNames: row.organizationNames ?? [],
      isMapped,
    } satisfies LocationMapRow;
  });
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

export type LocationStoredItem = {
  itemCode: string;
  itemName: string;
  lotNumber: string;
  qtyRemaining: number;
  boxesRemaining: number;
};

export type LocationInventoryRow = LocationStoredItem & {
  itemId: string;
  spq: number;
  volumeCbm: number;
  occupiedCbm: number;
};

export type LocationInventory = {
  rows: LocationInventoryRow[];
  itemCount: number;
  totalUnits: number;
  totalBoxes: number;
  occupiedCbm: number;
};

/** Returns the live stock currently held at one location, with capacity usage. */
export async function getLocationInventory(
  db: DbLike,
  locationId: string,
): Promise<LocationInventory> {
  const rawRows = await db
    .select({
      itemId: items.id,
      itemCode: items.code,
      itemName: items.name,
      lotNumber: lots.lotNumber,
      qtyRemaining: lotLocationBalances.qtyRemaining,
      spq: items.spq,
      volumeCbm: items.volumeCbm,
    })
    .from(lotLocationBalances)
    .innerJoin(lots, eq(lots.id, lotLocationBalances.lotId))
    .innerJoin(items, eq(items.id, lots.itemId))
    .where(and(eq(lotLocationBalances.locationId, locationId), gt(lotLocationBalances.qtyRemaining, 0)))
    .orderBy(items.code, lots.lotNumber);

  const rows = (rawRows as Array<{
    itemId: string;
    itemCode: string;
    itemName: string;
    lotNumber: string;
    qtyRemaining: number | string;
    spq: number | string | null;
    volumeCbm: number | string | null;
  }>).map((row) => {
    const qtyRemaining = Number(row.qtyRemaining ?? 0);
    const spq = Number(row.spq ?? 1) > 0 ? Number(row.spq) : 1;
    const boxesRemaining = piecesToBoxes(qtyRemaining, spq);
    const volumeCbm = Number(row.volumeCbm ?? 0);
    return {
      itemId: row.itemId,
      itemCode: row.itemCode,
      itemName: row.itemName,
      lotNumber: row.lotNumber,
      qtyRemaining,
      spq,
      boxesRemaining,
      volumeCbm,
      occupiedCbm: boxesRemaining * volumeCbm,
    } satisfies LocationInventoryRow;
  });

  return {
    rows,
    itemCount: new Set(rows.map((row) => row.itemId)).size,
    totalUnits: rows.reduce((sum, row) => sum + row.qtyRemaining, 0),
    totalBoxes: rows.reduce((sum, row) => sum + piecesToBoxes(row.qtyRemaining, row.spq), 0),
    occupiedCbm: rows.reduce((sum, row) => sum + row.occupiedCbm, 0),
  };
}

/**
 * Returns the live stock held in each suggested storage location so an
 * operator can verify the putaway choice before confirming Store.
 */
export async function getPutawayLocationContents(
  db: DbLike,
  locationIds: string[],
): Promise<Record<string, LocationStoredItem[]>> {
  const grouped = Object.fromEntries(locationIds.map((id) => [id, [] as LocationStoredItem[]]));
  if (locationIds.length === 0) return grouped;

  const rows = await db
    .select({
      locationId: lotLocationBalances.locationId,
      itemCode: items.code,
      itemName: items.name,
      lotNumber: lots.lotNumber,
      qtyRemaining: lotLocationBalances.qtyRemaining,
      spq: items.spq,
    })
    .from(lotLocationBalances)
    .innerJoin(lots, eq(lots.id, lotLocationBalances.lotId))
    .innerJoin(items, eq(items.id, lots.itemId))
    .where(and(inArray(lotLocationBalances.locationId, locationIds), gt(lotLocationBalances.qtyRemaining, 0)));

  for (const row of rows as Array<{
    locationId: string;
    itemCode: string;
    itemName: string;
    lotNumber: string;
    qtyRemaining: number;
    spq: number | string | null;
  }>) {
    const qtyRemaining = Number(row.qtyRemaining ?? 0);
    const spq = Number(row.spq ?? 1) > 0 ? Number(row.spq) : 1;
    grouped[row.locationId]?.push({
      itemCode: row.itemCode,
      itemName: row.itemName,
      lotNumber: row.lotNumber,
      qtyRemaining,
      boxesRemaining: piecesToBoxes(qtyRemaining, spq),
    });
  }

  return grouped;
}

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
 * sum((lot_location_balances.qty_remaining / items.spq) * items.volume_cbm)
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

  const occupiedCbmExpr = sql<string>`coalesce(sum((${lotLocationBalances.qtyRemaining}::numeric / nullif(${items.spq}, 0)) * ${items.volumeCbm}), 0)`;

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

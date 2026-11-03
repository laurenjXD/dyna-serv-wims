// lib/withdrawal/allocation.ts
//
// Pure allocation engine — FIFO/FEFO lot selection across dispersed locations.
// No DB calls; no imports from lib/db.
//
// The important grain here is the lot, not the balance row: one received lot
// may be represented by several lot_location_balances rows after putaway.
// We therefore order lot groups first, then consume their locations in a
// deterministic human-readable order.

// Traceability:
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/design.md §5
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/requirements.md R3.1–R3.5, R1.3

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LotLocationRow = {
  lotId: string;
  locationId: string;
  lotStatus: string; // 'available' | 'quarantine' | 'expired' | 'held' | ...
  qtyRemaining: number;
  qtyCommitted: number;
  receivedAt: Date; // FIFO ordering
  expiryDate: Date | null; // non-null for perishable items → FEFO ordering
  lotNumber?: string | null;
  locationLabel?: string | null;
  locationPickSequence?: number | null;
};

export type AllocationLineResult = {
  lotId: string;
  locationId: string;
  qtyAllocated: number;
};

export type AllocationPlanLocation = {
  lotId: string;
  locationId: string;
  locationLabel: string;
  availableQty: number;
  qtyAllocated: number;
};

export type AllocationPlanLot = {
  lotId: string;
  lotNumber: string;
  rank: number;
  receivedAt: Date;
  expiryDate: Date | null;
  availableQty: number;
  qtyAllocated: number;
  locations: AllocationPlanLocation[];
};

export type AllocationPlan = {
  strategy: "FIFO" | "FEFO";
  requestedQty: number;
  totalAvailableQty: number;
  allocatedQty: number;
  remainingQty: number;
  lots: AllocationPlanLot[];
  lines: AllocationLineResult[];
};

export type AllocationResult =
  | { ok: true; lines: AllocationLineResult[]; plan: AllocationPlan }
  | { ok: false; error: "insufficient_stock" | string; plan: AllocationPlan };

export type ProvisionalCheckInput = {
  itemCodeIsProvisional: boolean;
  itemId: string;
};

export type ProvisionalCheckResult =
  | { ok: true }
  | { ok: false; error: "provisional_item_code"; blockingItemIds: string[] };

type PreparedLocation = {
  row: LotLocationRow;
  availableQty: number;
};

type PreparedLot = {
  lotId: string;
  lotNumber: string;
  receivedAt: Date;
  expiryDate: Date | null;
  locations: PreparedLocation[];
};

function dateTime(value: Date | null): number {
  return value?.getTime() ?? Infinity;
}

function text(value: string | null | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function compareLocations(a: PreparedLocation, b: PreparedLocation): number {
  const aSequence = a.row.locationPickSequence;
  const bSequence = b.row.locationPickSequence;
  if (aSequence != null && bSequence != null && aSequence !== bSequence) return aSequence - bSequence;
  if (aSequence != null && bSequence == null) return -1;
  if (aSequence == null && bSequence != null) return 1;

  // The locations table currently has no pick-sequence column. Use its
  // numeric-aware label order as fallback, then the stable location ID.
  const labelOrder = compareText(
    text(a.row.locationLabel, a.row.locationId),
    text(b.row.locationLabel, b.row.locationId),
  );
  return labelOrder !== 0 ? labelOrder : compareText(a.row.locationId, b.row.locationId);
}

function compareLots(a: PreparedLot, b: PreparedLot, isPerishable: boolean): number {
  if (isPerishable) {
    const expiryOrder = dateTime(a.expiryDate) - dateTime(b.expiryDate);
    if (expiryOrder !== 0) return expiryOrder;
  }

  const receivedOrder = a.receivedAt.getTime() - b.receivedAt.getTime();
  if (receivedOrder !== 0) return receivedOrder;

  // Lots remain distinct even when their receipt timestamps tie. Lot number is
  // the stable business tie-breaker; the immutable lot ID breaks duplicate
  // lot-number ties consistently across clients and server calls.
  const lotNumberOrder = compareText(a.lotNumber, b.lotNumber);
  return lotNumberOrder !== 0 ? lotNumberOrder : compareText(a.lotId, b.lotId);
}

function prepareLotGroups(
  rows: LotLocationRow[],
  isPerishable: boolean,
  wholeBoxSize?: number,
): PreparedLot[] {
  const grouped = new Map<string, PreparedLot>();

  for (const row of rows) {
    if (row.lotStatus !== "available") continue;

    const availableQty = Math.max(0, row.qtyRemaining - row.qtyCommitted);
    // When the authoritative caller supplies an SPQ, only complete boxes may
    // be planned. The no-SPQ form preserves the original base-unit allocator.
    const usableQty = wholeBoxSize && wholeBoxSize > 0
      ? Math.floor(availableQty / wholeBoxSize) * wholeBoxSize
      : availableQty;
    if (usableQty <= 0) continue;

    let lot = grouped.get(row.lotId);
    if (!lot) {
      lot = {
        lotId: row.lotId,
        lotNumber: text(row.lotNumber, row.lotId),
        receivedAt: row.receivedAt,
        expiryDate: row.expiryDate,
        locations: [],
      };
      grouped.set(row.lotId, lot);
    }

    lot.locations.push({ row, availableQty: usableQty });
  }

  return [...grouped.values()]
    .map((lot) => ({
      ...lot,
      locations: [...lot.locations].sort(compareLocations),
    }))
    .sort((a, b) => compareLots(a, b, isPerishable));
}

/**
 * Returns the authoritative lot/location order without allocating quantity.
 * This is shared by the browser preview so it cannot invent a different
 * FIFO/FEFO order from the server allocator.
 */
export function orderLotLocationRows(
  rows: LotLocationRow[],
  isPerishable: boolean,
): LotLocationRow[] {
  return prepareLotGroups(rows, isPerishable).flatMap((lot) =>
    lot.locations.map(({ row }) => row),
  );
}

/**
 * Builds the explanatory lot-first plan used by Master Inventory and the
 * authoritative Stage 1 allocator. The plan includes every eligible
 * location under its lot, including locations receiving zero for this
 * request, so operators can see the complete lot/location picture.
 */
export function buildAllocationPlan(
  rows: LotLocationRow[],
  requestedQty: number,
  isPerishable: boolean,
  wholeBoxSize?: number,
): AllocationPlan {
  const preparedLots = prepareLotGroups(rows, isPerishable, wholeBoxSize);
  const lots: AllocationPlanLot[] = preparedLots.map((lot, index) => ({
    lotId: lot.lotId,
    lotNumber: lot.lotNumber,
    rank: index + 1,
    receivedAt: lot.receivedAt,
    expiryDate: lot.expiryDate,
    availableQty: lot.locations.reduce((sum, location) => sum + location.availableQty, 0),
    qtyAllocated: 0,
    locations: lot.locations.map(({ row, availableQty }) => ({
      lotId: row.lotId,
      locationId: row.locationId,
      locationLabel: text(row.locationLabel, row.locationId),
      availableQty,
      qtyAllocated: 0,
    })),
  }));

  const lines: AllocationLineResult[] = [];
  const normalizedRequestedQty = Number.isFinite(requestedQty) ? Math.max(0, requestedQty) : 0;
  let remainingQty = normalizedRequestedQty;

  for (const lot of lots) {
    if (remainingQty <= 0) break;
    for (const location of lot.locations) {
      if (remainingQty <= 0) break;
      const take = wholeBoxSize && wholeBoxSize > 0
        ? Math.min(
            Math.floor(remainingQty / wholeBoxSize) * wholeBoxSize,
            location.availableQty,
          )
        : Math.min(remainingQty, location.availableQty);
      if (take <= 0) continue;

      location.qtyAllocated = take;
      lot.qtyAllocated += take;
      lines.push({ lotId: location.lotId, locationId: location.locationId, qtyAllocated: take });
      remainingQty -= take;
    }
  }

  const totalAvailableQty = lots.reduce((sum, lot) => sum + lot.availableQty, 0);
  const allocatedQty = normalizedRequestedQty - remainingQty;
  return {
    strategy: isPerishable ? "FEFO" : "FIFO",
    requestedQty: normalizedRequestedQty,
    totalAvailableQty,
    allocatedQty,
    remainingQty,
    lots,
    lines,
  };
}

// ---------------------------------------------------------------------------
// allocate
//
// Pure function — no DB access. Takes the full list of lot/location rows for
// the requested item and returns a lot-first allocation plan.
//
// Rules:
//   1. Only rows where lotStatus === 'available' are eligible.
//   2. Available qty per row = qtyRemaining - qtyCommitted; rows where this
//      is ≤ 0 are skipped.
//   3. Same lotId rows are one lot group. Groups are ordered FEFO/FIFO first.
//   4. Locations inside one lot use pick sequence when present, then label and location ID.
//   5. Fill greedily across all locations in the current lot before the next.
//   6. Optional wholeBoxSize keeps every authoritative allocation line at a
//      complete SPQ/box boundary.
// ---------------------------------------------------------------------------

export function allocate(
  rows: LotLocationRow[],
  requestedQty: number,
  isPerishable: boolean,
  wholeBoxSize?: number,
): AllocationResult {
  const plan = buildAllocationPlan(rows, requestedQty, isPerishable, wholeBoxSize);
  if (plan.allocatedQty < requestedQty) {
    return { ok: false, error: "insufficient_stock", plan };
  }
  return { ok: true, lines: plan.lines, plan };
}

// ---------------------------------------------------------------------------
// checkProvisionalItemCodes
// ---------------------------------------------------------------------------

export function checkProvisionalItemCodes(
  lines: ProvisionalCheckInput[],
): ProvisionalCheckResult {
  const blockingItemIds = lines
    .filter((l) => l.itemCodeIsProvisional === true)
    .map((l) => l.itemId);

  if (blockingItemIds.length > 0) {
    return {
      ok: false,
      error: "provisional_item_code",
      blockingItemIds,
    };
  }

  return { ok: true };
}

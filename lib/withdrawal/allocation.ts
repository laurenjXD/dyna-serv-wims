// lib/withdrawal/allocation.ts
//
// Pure allocation engine — FIFO/FEFO lot selection across dispersed locations.
// No DB calls; no imports from lib/db.
//
// Traceability:
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/design.md §5
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/requirements.md R3.1–R3.5, R1.3

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LotLocationRow = {
  lotId: string;
  lotNumber?: string;
  locationId: string;
  locationLabel?: string;
  lotStatus: string; // 'available' | 'quarantine' | 'expired' | 'held' | ...
  qtyRemaining: number;
  qtyCommitted: number;
  receivedAt: Date | string; // FIFO ordering
  expiryDate: Date | string | null; // non-null for perishable items → FEFO ordering
};

function dateOrder(value: Date | string | null): number {
  if (value === null) return Number.POSITIVE_INFINITY;
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
}

function compareLabel(left: string, right: string): number {
  return left.localeCompare(right, "en", { numeric: true, sensitivity: "base" }) ||
    (left < right ? -1 : left > right ? 1 : 0);
}

/**
 * Shared source order for allocation previews, the pick-list draft, DRA
 * suggestions, and the authoritative commitment transaction. Lots rank by
 * FIFO/FEFO first; locations are only ordered after their lot is chosen.
 */
export function compareLotLocationPriority(
  left: Pick<LotLocationRow, "lotId" | "lotNumber" | "locationId" | "locationLabel" | "receivedAt" | "expiryDate">,
  right: Pick<LotLocationRow, "lotId" | "lotNumber" | "locationId" | "locationLabel" | "receivedAt" | "expiryDate">,
  isPerishable: boolean,
): number {
  const expiryOrder = dateOrder(left.expiryDate) - dateOrder(right.expiryDate);
  const receiptOrder = dateOrder(left.receivedAt) - dateOrder(right.receivedAt);
  const lotOrder = compareLabel(left.lotNumber ?? left.lotId, right.lotNumber ?? right.lotId) ||
    compareLabel(left.lotId, right.lotId);

  if (isPerishable) {
    return expiryOrder || receiptOrder || lotOrder ||
      compareLabel(left.locationLabel ?? left.locationId, right.locationLabel ?? right.locationId) ||
      compareLabel(left.locationId, right.locationId);
  }

  return receiptOrder || lotOrder ||
    compareLabel(left.locationLabel ?? left.locationId, right.locationLabel ?? right.locationId) ||
    compareLabel(left.locationId, right.locationId);
}

export type AllocationLineResult = {
  lotId: string;
  locationId: string;
  qtyAllocated: number;
};

export type AllocationResult =
  | { ok: true; lines: AllocationLineResult[] }
  | { ok: false; error: "insufficient_stock" | string };

export type ProvisionalCheckInput = {
  itemCodeIsProvisional: boolean;
  itemId: string;
};

export type ProvisionalCheckResult =
  | { ok: true }
  | { ok: false; error: "provisional_item_code"; blockingItemIds: string[] };

// ---------------------------------------------------------------------------
// allocate
//
// Pure function — no DB access. Takes the full list of available lot/location
// rows for the requested item and returns an allocation plan.
//
// Rules (design.md §5):
//   1. Only rows where lotStatus === 'available' are eligible.
//   2. Available qty per row = qtyRemaining - qtyCommitted; rows where this
//      is ≤ 0 are skipped.
//   3. isPerishable = true → FEFO (sort by expiryDate ascending).
//   4. isPerishable = false → FIFO (sort by receivedAt ascending).
//   5. Rank lots before their locations; within one lot, break ties by the
//      human-readable location label and then location ID.
//   6. Fill greedily: take as much as available from each row in sorted order.
//   7. If total available < requestedQty → { ok: false, error: 'insufficient_stock' }.
//      Never return a partial allocation.
// ---------------------------------------------------------------------------

export function allocate(
  rows: LotLocationRow[],
  requestedQty: number,
  isPerishable: boolean,
): AllocationResult {
  // Step 1 + 2: filter eligible rows with available qty > 0
  const eligible = rows
    .filter((r) => r.lotStatus === "available")
    .map((r) => ({ ...r, availableQty: r.qtyRemaining - r.qtyCommitted }))
    .filter((r) => r.availableQty > 0);

  // Step 3/4: sort by FEFO or FIFO
  eligible.sort((a, b) => compareLotLocationPriority(a, b, isPerishable));

  // Step 6: check total available before committing to allocation
  const totalAvailable = eligible.reduce((sum, r) => sum + r.availableQty, 0);
  if (totalAvailable < requestedQty) {
    return { ok: false, error: "insufficient_stock" };
  }

  // Step 5: greedy fill in sorted order
  const lines: AllocationLineResult[] = [];
  let remaining = requestedQty;

  for (const row of eligible) {
    if (remaining <= 0) break;
    const take = Math.min(row.availableQty, remaining);
    lines.push({
      lotId: row.lotId,
      locationId: row.locationId,
      qtyAllocated: take,
    });
    remaining -= take;
  }

  return { ok: true, lines };
}

// ---------------------------------------------------------------------------
// checkProvisionalItemCodes
//
// Pre-allocation gate per design.md §6 step 4.
// Checks all requested lines; if any have itemCodeIsProvisional = true,
// returns an error naming every blocking itemId (never partial).
// Empty input returns { ok: true }.
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

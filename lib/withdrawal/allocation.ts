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
  locationId: string;
  lotStatus: string; // 'available' | 'quarantine' | 'expired' | 'held' | ...
  qtyRemaining: number;
  qtyCommitted: number;
  receivedAt: Date; // FIFO ordering
  expiryDate: Date | null; // non-null for perishable items → FEFO ordering
};

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
//   5. Fill greedily: take as much as available from each row in sorted order.
//   6. If total available < requestedQty → { ok: false, error: 'insufficient_stock' }.
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
  if (isPerishable) {
    // FEFO: sort by expiryDate ascending; null expiryDate sorts to end
    eligible.sort((a, b) => {
      const aTime = a.expiryDate !== null ? a.expiryDate.getTime() : Infinity;
      const bTime = b.expiryDate !== null ? b.expiryDate.getTime() : Infinity;
      return aTime - bTime;
    });
  } else {
    // FIFO: sort by receivedAt ascending
    eligible.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
  }

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

/**
 * Quantity guard for transfer requests.
 *
 * Traceability:
 *   specs/11-transfer-and-inspection/requirements.md R1.4, R4.4, R5.2
 *   §6 AC — "Source/destination scans reject mismatches and support safe recovery."
 *
 * Validates that every transfer line can be fulfilled from available source stock.
 * "Available" is defined as max(0, qtyRemaining - qtyCommitted) to guard against
 * over-committed balances going negative.  ALL short lines are reported together
 * so the requester can correct the entire set in a single round-trip.
 */

export type TransferLine = {
  lotId: string;
  locationId: string;
  qtyRequested: number;
};

export type BalanceRow = {
  lotId: string;
  locationId: string;
  qtyRemaining: number;
  qtyCommitted: number;
};

export type ShortfallEntry = {
  lotId: string;
  locationId: string;
  available: number;
  requested: number;
};

export type QuantityGuardResult =
  | { ok: true }
  | { ok: false; error: "insufficient_stock"; shortfall: ShortfallEntry[] };

/**
 * Checks whether every transfer line can be satisfied from the provided balances.
 *
 * - Matching is keyed on both lotId AND locationId.
 * - A missing balance row is treated as available = 0.
 * - Over-committed balances are clamped to 0 (never go negative).
 * - All short lines are collected before returning; the first failure does not short-circuit.
 */
export function checkTransferQuantity(
  lines: TransferLine[],
  balances: BalanceRow[]
): QuantityGuardResult {
  const shortfall: ShortfallEntry[] = [];

  for (const line of lines) {
    const balance = balances.find(
      (b) => b.lotId === line.lotId && b.locationId === line.locationId
    );

    const available = balance
      ? Math.max(0, balance.qtyRemaining - balance.qtyCommitted)
      : 0;

    if (available < line.qtyRequested) {
      shortfall.push({
        lotId: line.lotId,
        locationId: line.locationId,
        available,
        requested: line.qtyRequested,
      });
    }
  }

  if (shortfall.length > 0) {
    return { ok: false, error: "insufficient_stock", shortfall };
  }

  return { ok: true };
}

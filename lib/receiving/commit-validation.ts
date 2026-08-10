// lib/receiving/commit-validation.ts
//
// Pure business-logic pre-commit validation for a single WRR line's receipt
// confirmation (per-line commit, Reversed 2026-08-10 — see design.md §9).
//
// Traceability:
//   specs/07-incoming-receiving/design.md §9 — Receipt commit and idempotency
//     ("Reversed 2026-08-10: per-line immediate commit, not a single
//     end-of-WRR atomic gate"). Each line's commit is validated in isolation:
//     scan totals, conformance decisions, disposition value, and (for store)
//     the target location's active `storage` state — or (for inspect) the
//     confirmed `inspection` location.
//   specs/07-incoming-receiving/design.md §5.2 — Scan-line state: under-scanned is not confirmable
//   specs/07-incoming-receiving/requirements.md R7.1 (amended 2026-08-10) — each line's commit
//     SHALL be an explicit, authorized server command executed per line rather than gated on
//     every other line in the WRR being ready first.
//   specs/07-incoming-receiving/requirements.md R7.2 (amended 2026-08-10) — each per-line commit
//     SHALL atomically validate that specific line's scan totals, conformance decisions, active
//     item/party references, flow partition, required lot metadata, disposition value, and (for
//     store) the accepted/overridden putaway location's active `storage` state — or (for
//     inspect) the confirmed `inspection` location — before posting that line alone.
//   specs/07-incoming-receiving/requirements.md R7.6 — a failed per-line commit SHALL leave no
//     partial outcome for that line and SHALL NOT affect any other line's already-committed state.
//   specs/07-incoming-receiving/requirements.md R4.3 — unresolved items block that line's confirmation
//   specs/07-incoming-receiving/requirements.md R5.1 — null disposition blocks that line's commit

export type WrrDocument = {
  id: string;
  status: string;
  flowType: string;
  vendorPartyId: string;
};

export type WrrLine = {
  id: string;
  itemId: string | null;
  itemBarcode: string | null;
  lotNumber: string;
  expectedQty: number;
  scannedQty: number;
  disposition: "store" | "inspect" | null | undefined;
  putawayLocationId?: string | null;
};

// The location accepted/overridden at scan time (store) or confirmed before
// scanning (inspect) — resolved by the caller and passed in for pure
// validation, since this module has no DB access of its own.
export type CommitLocation = {
  id: string;
  isActive: boolean;
  locationType: string;
};

export type CommitValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

/**
 * Validates all preconditions required before a single WRR line's receipt
 * can be committed. Collects ALL errors for that line rather than failing on
 * the first. This function operates on exactly one line — it has no
 * knowledge of any other line on the WRR, so one line's invalidity can never
 * affect another line's independent validation result (R7.1/R7.6).
 */
export function validateLineCommit(
  wrr: WrrDocument,
  line: WrrLine,
  location: CommitLocation | null
): CommitValidationResult {
  const errors: string[] = [];

  // WRR must be in the receiving-in-progress state before a line can commit
  if (wrr.status !== "receiving_in_progress") {
    errors.push(
      `WRR ${wrr.id} must be in 'receiving_in_progress' status to commit (current: '${wrr.status}')`
    );
  }

  // R4.3: unresolved item (not yet enrolled via 06) blocks confirmation
  if (line.itemId === null) {
    errors.push(
      `Line ${line.id} (lot: ${line.lotNumber}) has no resolved itemId; enroll the item before committing`
    );
  }

  // R3.5 / §5.2: under-scanned lines block confirmation
  if (line.scannedQty < line.expectedQty) {
    errors.push(
      `Line ${line.id} (lot: ${line.lotNumber}) is under-scanned (scanned ${line.scannedQty} of ${line.expectedQty})`
    );
  }

  // R5.1: disposition must be set ('store' or 'inspect'); null/undefined blocks commit
  if (line.disposition == null) {
    errors.push(
      `Line ${line.id} (lot: ${line.lotNumber}) has no disposition set; must be 'store' or 'inspect'`
    );
  } else if (line.disposition === "store") {
    // R7.2: store disposition requires an active 'storage' location
    if (location === null) {
      errors.push(
        `Line ${line.id} (lot: ${line.lotNumber}) has no accepted/overridden putaway location for store disposition`
      );
    } else if (!location.isActive) {
      errors.push(
        `Line ${line.id} (lot: ${line.lotNumber}) putaway location ${location.id} is not active`
      );
    } else if (location.locationType !== "storage") {
      errors.push(
        `Line ${line.id} (lot: ${line.lotNumber}) putaway location ${location.id} must be of type 'storage' (got '${location.locationType}')`
      );
    }
  } else if (line.disposition === "inspect") {
    // R7.2: inspect disposition requires an active 'inspection' location
    if (location === null) {
      errors.push(
        `Line ${line.id} (lot: ${line.lotNumber}) has no confirmed inspection location for inspect disposition`
      );
    } else if (!location.isActive) {
      errors.push(
        `Line ${line.id} (lot: ${line.lotNumber}) inspection location ${location.id} is not active`
      );
    } else if (location.locationType !== "inspection") {
      errors.push(
        `Line ${line.id} (lot: ${line.lotNumber}) inspection location ${location.id} must be of type 'inspection' (got '${location.locationType}')`
      );
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true };
}

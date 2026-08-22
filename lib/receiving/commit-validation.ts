// lib/receiving/commit-validation.ts
//
// Pure business-logic pre-commit validation for a single WRR line's receipt
// confirmation. Amended 2026-08-20: the atomic step for a `store`-disposition
// line is now the individual physical unit, not the whole line (see
// design.md §9's "Amended 2026-08-20" note) — `validateLineCommit` validates
// exactly one unit-commit attempt at a time for `store` lines. `inspect`
// lines are unaffected and still validate the whole line as a single event
// (design.md §6.3, §9).
//
// Traceability:
//   specs/07-incoming-receiving/design.md §9 — Receipt commit and idempotency
//     ("Reversed 2026-08-10: per-line immediate commit, not a single
//     end-of-WRR atomic gate"; "Amended 2026-08-20: the atomic step is now
//     the unit, not the line" for `store` lines). Each line's commit is
//     validated in isolation: scan totals, conformance decisions,
//     disposition value, and (for store) the target location's active
//     `storage` state — or (for inspect) the confirmed `inspection` location.
//   specs/07-incoming-receiving/design.md §5.2 — Scan-line state: under-scanned is not confirmable
//     (inspect lines only, after the 2026-08-20 amendment — see below).
//   specs/07-incoming-receiving/requirements.md R7.1 (amended 2026-08-10) — each line's commit
//     SHALL be an explicit, authorized server command executed per line rather than gated on
//     every other line in the WRR being ready first.
//   specs/07-incoming-receiving/requirements.md R7.2 (amended 2026-08-10, further amended
//     2026-08-20) — each per-unit store commit (or per-line inspect commit) SHALL atomically
//     validate that unit's/line's scan totals, conformance decisions, active item/party
//     references, flow partition, required lot metadata, disposition value, and (for store) the
//     accepted/overridden putaway location's active `storage` state — or (for inspect) the
//     confirmed `inspection` location — before posting that unit/line alone. For `store` lines,
//     a commit attempt is valid whenever scannedQty < expectedQty (units remain); an attempt on
//     an already-fully-committed line (scannedQty >= expectedQty) is rejected with a distinct
//     "already fully committed" error, not the "under-scanned" message.
//   specs/07-incoming-receiving/requirements.md R7.6 — a failed per-line commit SHALL leave no
//     partial outcome for that line and SHALL NOT affect any other line's already-committed state.
//   specs/07-incoming-receiving/requirements.md R4.3 — unresolved items block that line's confirmation
//   specs/07-incoming-receiving/requirements.md R5.1 — null disposition blocks that line's commit
//   specs/07-incoming-receiving/requirements.md R3.10 (added 2026-08-20) — each store unit commits
//     as its own atomic step; a line's units MAY be committed one at a time; the line need not be
//     fully scanned before its first unit commits.

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
 * Validates all preconditions required before a single WRR unit-commit
 * (`store` lines, amended 2026-08-20) or whole-line commit (`inspect`
 * lines, unchanged) can proceed. Collects ALL errors rather than failing on
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

  // Amended 2026-08-20: scan-completeness gating now differs by disposition.
  //   - store: a unit-commit is valid whenever units remain
  //     (scannedQty < expectedQty) — this is the normal per-unit-commit-in-
  //     progress state, not an error. An attempt on an already-fully-
  //     committed line (scannedQty >= expectedQty) is rejected with a
  //     distinct "already fully committed" error so a stray extra commit
  //     call cannot silently create an extra unit.
  //   - inspect: UNCHANGED — still a single whole-line commit, still gated
  //     on the full scanned_qty being reached first (§6.3, §9).
  if (line.disposition === "store") {
    if (line.scannedQty >= line.expectedQty) {
      errors.push(
        `Line ${line.id} (lot: ${line.lotNumber}) is already fully committed (${line.scannedQty} of ${line.expectedQty} expected units already committed)`
      );
    }
  } else if (line.disposition === "inspect") {
    // R3.5 / §5.2 / §6.3: under-scanned inspect lines block their single
    // whole-line commit.
    if (line.scannedQty < line.expectedQty) {
      errors.push(
        `Line ${line.id} (lot: ${line.lotNumber}) is under-scanned (scanned ${line.scannedQty} of ${line.expectedQty})`
      );
    }
  }
  // If disposition is null/undefined, scan-completeness isn't evaluated here
  // — the disposition-required error below already blocks the commit.

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

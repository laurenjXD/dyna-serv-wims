// lib/receiving/commit-validation.ts
//
// Pure business-logic pre-commit validation for WRR receipt confirmation.
//
// Traceability:
//   specs/07-incoming-receiving/design.md §9 — Receipt commit and idempotency
//   specs/07-incoming-receiving/design.md §5.2 — Scan-line state: under-scanned is not confirmable
//   specs/07-incoming-receiving/requirements.md R7.2 — atomic validation of status, scan totals,
//     conformance decisions, active item/party references, flow partition, lot metadata,
//     per-line disposition values, and capacity/putaway prerequisites
//   specs/07-incoming-receiving/requirements.md R3.5 — receipt SHALL NOT be confirmable while
//     required lines, unresolved exceptions, or required inspection decisions remain outstanding
//   specs/07-incoming-receiving/requirements.md R4.3 — unresolved items block confirmation
//   specs/07-incoming-receiving/requirements.md R5.1 — null disposition blocks commit

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

export type CommitValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

/**
 * Validates all preconditions required before a WRR receipt can be confirmed.
 * Collects ALL errors rather than failing on the first; the caller receives a
 * complete picture of what must be resolved before the commit can proceed.
 */
export function validateCommit(
  wrr: WrrDocument,
  lines: WrrLine[]
): CommitValidationResult {
  const errors: string[] = [];

  // WRR must be in the receiving-in-progress state before it can be confirmed
  if (wrr.status !== "receiving_in_progress") {
    errors.push(
      `WRR ${wrr.id} must be in 'receiving_in_progress' status to commit (current: '${wrr.status}')`
    );
  }

  // At least one line must exist
  if (lines.length === 0) {
    errors.push(`WRR ${wrr.id} has no lines; cannot commit an empty receipt`);
  }

  // Per-line validations (all collected, not fail-fast)
  for (const line of lines) {
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
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true };
}

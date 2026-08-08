// lib/transfer/inspection-state.ts
//
// Pure business-logic validation for inspection disposition inputs.
//
// Traceability:
//   specs/11-transfer-and-inspection/requirements.md R3.1 — system SHALL maintain a single
//     shared inspection record structure used by 07 (inbound) and 11 (transfer).
//   specs/11-transfer-and-inspection/requirements.md R3.4 — transfer-specific non-conformance
//     SHALL block completion or route to an approved exception/resolution path using
//     inspection_dispositions.
//   specs/11-transfer-and-inspection/design.md §6.1 — inbound available dispositions:
//     store, quarantine, return_to_party, hold, write_off.
//   specs/11-transfer-and-inspection/design.md §6.1 — transfer/aging available dispositions:
//     return_to_stock, reject, return_to_origin, hold.
//   specs/11-transfer-and-inspection/design.md §6.3 — failed inspection disposition table with
//     balance effects per context type.

export type InspectionCase = {
  id: string;
  status: string;
  contextType: "inbound" | "transfer";
  sourceRefType: "wrr_item" | "transfer_line";
};

export type DispositionInput = {
  dispositionType: string;
  quantityAffected: number;
  notes?: string | null;
};

export type DispositionResult =
  | { ok: true }
  | { ok: false; errors: string[] };

// All eight valid disposition types across both context types
const ALL_VALID_DISPOSITIONS = new Set([
  "store",
  "quarantine",
  "return_to_party",
  "hold",
  "write_off",
  "return_to_stock",
  "reject",
  "return_to_origin",
]);

// Dispositions valid only for transfer context (design.md §6.1)
const TRANSFER_ONLY_DISPOSITIONS = new Set([
  "return_to_stock",
  "return_to_origin",
]);

// Dispositions valid only for inbound context (design.md §6.1)
const INBOUND_ONLY_DISPOSITIONS = new Set(["return_to_party"]);

/**
 * Validates that a disposition input is legally applicable to the given inspection case.
 *
 * Collects all errors (non-fail-fast):
 *   1. Case must be in 'open' status — already-resolved cases are immutable.
 *   2. quantityAffected must be > 0.
 *   3. dispositionType must be one of the eight known values.
 *   4. Inbound cases may not use transfer-only dispositions.
 *   5. Transfer cases may not use inbound-only dispositions.
 */
export function validateInspectionDisposition(
  inspectionCase: InspectionCase,
  disposition: DispositionInput
): DispositionResult {
  const errors: string[] = [];

  // 1. Case status must be 'open'
  if (inspectionCase.status !== "open") {
    errors.push(
      `Inspection case '${inspectionCase.id}' is already resolved (status: ${inspectionCase.status})`
    );
  }

  // 2. quantityAffected must be > 0 (design.md §6.3)
  if (
    typeof disposition.quantityAffected !== "number" ||
    disposition.quantityAffected <= 0
  ) {
    errors.push("quantityAffected must be a number greater than 0");
  }

  // 3. dispositionType must be one of the eight recognized values
  const { dispositionType } = disposition;
  const isKnownType =
    typeof dispositionType === "string" &&
    ALL_VALID_DISPOSITIONS.has(dispositionType);

  if (!isKnownType) {
    errors.push(
      `dispositionType must be one of: store, quarantine, return_to_party, hold, write_off, return_to_stock, reject, return_to_origin`
    );
  } else {
    // 4. Inbound case may not use transfer-only dispositions
    if (
      inspectionCase.contextType === "inbound" &&
      TRANSFER_ONLY_DISPOSITIONS.has(dispositionType)
    ) {
      errors.push(
        `dispositionType '${dispositionType}' is not valid for inbound inspection cases`
      );
    }

    // 5. Transfer case may not use inbound-only dispositions
    if (
      inspectionCase.contextType === "transfer" &&
      INBOUND_ONLY_DISPOSITIONS.has(dispositionType)
    ) {
      errors.push(
        `dispositionType '${dispositionType}' is not valid for transfer inspection cases`
      );
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true };
}

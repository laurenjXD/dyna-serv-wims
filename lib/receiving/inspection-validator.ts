/**
 * Inspection record validator for inbound receiving.
 *
 * Traceability:
 *   specs/07-incoming-receiving/requirements.md R5a.2, R5a.3, R5a.4, R6.3, R6.4
 *   §5 AC — conformant/on_hold/reject quantities; on_hold has mandatory remarks/reason;
 *             reject routes to a designated rejects location and RTV workflow.
 *
 * All errors are collected and returned together (never stops at first failure) so that
 * the UI can surface the full correction set in a single server round-trip.
 */

export type NonConformanceReason =
  | "tdc_defect"
  | "quantity_mismatch"
  | "damaged_carton"
  | "wrong_item_code"
  | "missing_paperwork"
  | "other";

const VALID_NON_CONFORMANCE_REASONS: ReadonlySet<NonConformanceReason> =
  new Set([
    "tdc_defect",
    "quantity_mismatch",
    "damaged_carton",
    "wrong_item_code",
    "missing_paperwork",
    "other",
  ]);

export type InspectionRecordInput = {
  disposition: "pass" | "on_hold" | "reject";
  /** Required when disposition is 'on_hold' */
  reason?: string;
  /** Required when disposition is 'reject' */
  rejectLocationId?: string;
  /** Required when disposition is 'on_hold' or 'reject' */
  nonConformanceReason?: NonConformanceReason;
};

export type InspectionValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

/**
 * Validates an inbound inspection record input.
 *
 * For 'pass' with no non-conformance extras, returns ok immediately.
 * For 'on_hold' and 'reject', all applicable field errors are collected and
 * returned together — the caller must address every error in one correction cycle.
 */
export function validateInspectionRecord(
  input: InspectionRecordInput
): InspectionValidationResult {
  const { disposition, reason, rejectLocationId, nonConformanceReason } = input;

  // pass with no additional fields — fast path
  if (disposition === "pass" && nonConformanceReason === undefined) {
    return { ok: true };
  }

  const errors: string[] = [];

  // on_hold requires a reason string
  if (disposition === "on_hold" && !reason) {
    errors.push("reason required for on_hold");
  }

  // on_hold and reject both require a nonConformanceReason
  if (
    (disposition === "on_hold" || disposition === "reject") &&
    nonConformanceReason === undefined
  ) {
    errors.push("nonConformanceReason required for on_hold or reject");
  }

  // reject requires a rejectLocationId
  if (disposition === "reject" && !rejectLocationId) {
    errors.push("rejectLocationId required for reject");
  }

  // If nonConformanceReason is supplied it must be a member of the approved enum
  if (
    nonConformanceReason !== undefined &&
    !VALID_NON_CONFORMANCE_REASONS.has(nonConformanceReason)
  ) {
    errors.push("invalid nonConformanceReason");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true };
}

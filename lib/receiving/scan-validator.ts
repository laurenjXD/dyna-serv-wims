/**
 * Scan validator for incoming receiving (WRR floor scan path).
 *
 * Traceability:
 *   specs/07-incoming-receiving/requirements.md R3.1, R3.2, R3.3
 *   §3 Lifecycle — physical scans are only valid while WRR is in receiving_in_progress
 */

export type ScanInput = {
  wrrId: string;
  wrrStatus: "draft" | "receiving_in_progress" | "completed" | "cancelled";
  lineId: string;
  scannedBarcode: string;
  expectedBarcode: string;
  expectedItemId: string;
  scannedItemId: string;
  /** Already scanned on this line before this scan */
  currentScannedQty: number;
  expectedQty: number;
  /** True if this carton ID was already recorded */
  isDuplicateScan: boolean;
};

export type ScanResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "wrong_wrr_status"
        | "barcode_mismatch"
        | "item_mismatch"
        | "duplicate_scan"
        | "over_quantity";
    };

/**
 * Validates a single floor scan against a WRR line.
 *
 * Checks are performed in priority order; the first failure is returned
 * immediately so the floor worker receives unambiguous, actionable feedback.
 *
 * Priority:
 *   1. wrong_wrr_status  — WRR must be receiving_in_progress
 *   2. barcode_mismatch  — scanned barcode must equal expected barcode
 *   3. item_mismatch     — scanned item must equal expected item
 *   4. duplicate_scan    — carton must not have been scanned already
 *   5. over_quantity     — currentScannedQty must be less than expectedQty
 */
export function validateScan(input: ScanInput): ScanResult {
  if (input.wrrStatus !== "receiving_in_progress") {
    return { ok: false, error: "wrong_wrr_status" };
  }

  if (input.scannedBarcode !== input.expectedBarcode) {
    return { ok: false, error: "barcode_mismatch" };
  }

  if (input.scannedItemId !== input.expectedItemId) {
    return { ok: false, error: "item_mismatch" };
  }

  if (input.isDuplicateScan) {
    return { ok: false, error: "duplicate_scan" };
  }

  if (input.currentScannedQty >= input.expectedQty) {
    return { ok: false, error: "over_quantity" };
  }

  return { ok: true };
}

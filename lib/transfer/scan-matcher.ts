// lib/transfer/scan-matcher.ts
//
// Pure business-logic barcode-to-transfer-line matching for the floor scan workflow.
//
// Traceability:
//   specs/11-transfer-and-inspection/requirements.md R4.2 — source scans SHALL verify the
//     expected item/barcode, lot, location, and quantity before physical movement is accepted.
//   specs/11-transfer-and-inspection/requirements.md R4.3 — destination scans SHALL verify the
//     expected destination location and item/lot before completion.
//   specs/11-transfer-and-inspection/requirements.md R4.4 — wrong item, wrong lot, wrong location,
//     duplicate scan, over-quantity, stale request, and insufficient source quantity SHALL receive
//     immediate recoverable feedback.

export type TransferLine = {
  id: string;
  lotId: string;
  itemId: string;
  qtyRequested: number;
  qtyTransferred: number;
  status: string;
  itemBarcode?: string | null;
  sourceLocationId?: string | null;
  destinationLocationId?: string | null;
};

export type TransferScanResult =
  | { matched: true; line: TransferLine; remainingQty: number }
  | {
      matched: false;
      reason:
        | "invalid_barcode"
        | "unknown_item"
        | "fully_transferred"
        | "wrong_phase"
        | "wrong_location";
    };

/**
 * Attempts to match a scanned barcode against the transfer's expected lines.
 *
 * Priority order for failure reasons:
 * 1. invalid_barcode — barcode is empty or whitespace-only
 * 2. unknown_item — no line matches the barcode, or matched line has null/missing itemBarcode
 * 3. fully_transferred — matched line is completed or qtyTransferred >= qtyRequested
 *
 * When multiple lines share the same barcode, the first non-completed, non-saturated line wins.
 * The -1 in remainingQty accounts for the current scan being recorded.
 *
 * The phase parameter ('source' | 'destination') is accepted for future location-scoped
 * matching but does not gate the barcode-item matching logic at this layer — location
 * verification against sourceLocationId / destinationLocationId is done by the calling
 * commit handler where the physical location scan is available.
 */
export function matchTransferScan(
  barcode: string,
  lines: TransferLine[],
  phase: "source" | "destination"
): TransferScanResult {
  // Guard: reject empty or whitespace-only barcodes
  if (barcode.trim() === "") {
    return { matched: false, reason: "invalid_barcode" };
  }

  // Find all lines whose itemBarcode matches the scanned barcode and is non-null
  const matchingLines = lines.filter(
    (l) => l.itemBarcode != null && l.itemBarcode === barcode
  );

  if (matchingLines.length === 0) {
    return { matched: false, reason: "unknown_item" };
  }

  // Walk matching lines in order; skip completed / saturated ones
  for (const line of matchingLines) {
    // Line explicitly marked completed
    if (line.status === "completed") {
      continue;
    }

    // Line quantity already exhausted (saturated or over-transferred)
    if (line.qtyTransferred >= line.qtyRequested) {
      continue;
    }

    // Line is available for this scan
    const remainingQty = line.qtyRequested - line.qtyTransferred - 1;
    return { matched: true, line, remainingQty };
  }

  // All matching lines are fully transferred or completed
  return { matched: false, reason: "fully_transferred" };
}

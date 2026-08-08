// lib/receiving/scan-matcher.ts
//
// Pure business-logic barcode-to-WRR-line matching for the floor scan workflow.
//
// Traceability:
//   specs/07-incoming-receiving/design.md §6 — Floor scan and reconciliation
//   specs/07-incoming-receiving/design.md §5.2 — Scan-line state table
//   specs/07-incoming-receiving/requirements.md R3.1 — match against expected item/line
//   specs/07-incoming-receiving/requirements.md R3.2 — track scanned vs expected qty; prevent silent over-receipt
//   specs/07-incoming-receiving/requirements.md R3.3 — immediate non-success feedback for wrong/unknown/over-qty scans
//   specs/07-incoming-receiving/requirements.md R4.1 — null itemId means item not enrolled; pause line, explain exception

export type WrrLine = {
  id: string;
  itemId: string | null;
  itemBarcode: string | null;
  lotNumber: string;
  expectedQty: number;
  scannedQty: number;
  disposition: "store" | "inspect";
};

export type ScanMatchResult =
  | { matched: true; line: WrrLine; remainingQty: number }
  | {
      matched: false;
      reason: "invalid_barcode" | "unknown_item" | "fully_scanned" | "over_quantity";
    };

/**
 * Attempts to match a scanned barcode against the WRR's expected lines.
 *
 * Priority order for failure reasons:
 * 1. invalid_barcode — barcode is empty or whitespace-only
 * 2. unknown_item — no line matches the barcode, or matched line has null itemId
 * 3. over_quantity — matched line's scannedQty already exceeds expectedQty (corrupted state)
 * 4. fully_scanned — matched line's scannedQty equals expectedQty
 *
 * When multiple lines share the same barcode, the first non-exhausted line is selected.
 * The -1 in remainingQty accounts for the current scan being recorded.
 */
export function matchScan(barcode: string, lines: WrrLine[]): ScanMatchResult {
  // Guard: reject empty or whitespace-only barcodes
  if (barcode.trim() === "") {
    return { matched: false, reason: "invalid_barcode" };
  }

  // Find all lines whose itemBarcode matches the scanned barcode
  const matchingLines = lines.filter((l) => l.itemBarcode === barcode);

  if (matchingLines.length === 0) {
    return { matched: false, reason: "unknown_item" };
  }

  // Walk matching lines in order; skip exhausted ones to support multi-line shared barcode
  for (const line of matchingLines) {
    // Item not yet enrolled — cannot fulfill this scan (R4.1)
    if (line.itemId === null) {
      return { matched: false, reason: "unknown_item" };
    }

    // Corrupted/malformed state: scanned already exceeds expected
    if (line.scannedQty > line.expectedQty) {
      return { matched: false, reason: "over_quantity" };
    }

    // Line is already fully scanned; continue to next matching line
    if (line.scannedQty >= line.expectedQty) {
      continue;
    }

    // Line is available for scanning
    const remainingQty = line.expectedQty - line.scannedQty - 1;
    return { matched: true, line, remainingQty };
  }

  // All matching lines are fully scanned
  return { matched: false, reason: "fully_scanned" };
}

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
//   specs/07-incoming-receiving/design.md §6.1 — flow-type cross-check (added 2026-08-10):
//     once a scanned barcode resolves to an active item, its own item flow_type is compared
//     against the WRR's own flow_type; a mismatch is rejected through the same exception path.
//   specs/07-incoming-receiving/requirements.md R3.3 (amended 2026-08-10) — a scanned item
//     whose own flow_type does not match the WRR's flow_type SHALL produce immediate
//     non-success feedback and a recoverable exception state.
//   specs/18-barcode-integration/design.md §2.2 (added 2026-08-11) — per-unit WRR
//     labels each carry their own unique unit_id specifically so a duplicate scan
//     of the exact same physical label can be detected and rejected, distinct from
//     the fuzzy scannedQty-counter comparison every other barcode type falls back
//     to. A scan whose unit_id has already been recorded SHALL be rejected through
//     the same exception path as any other wrong/unknown/duplicate scan, and takes
//     priority over quantity-state reasons (over_quantity/fully_scanned) since a
//     duplicate physical label is a rejection independent of the line's quantity.

export type WrrLine = {
  id: string;
  itemId: string | null;
  itemBarcode: string | null;
  lotNumber: string;
  expectedQty: number;
  scannedQty: number;
  disposition: "store" | "inspect";
  putawayLocationId?: string | null;
  itemFlowType?: "vmi" | "trading" | "supplies" | null;
};

export type ScanMatchResult =
  | { matched: true; line: WrrLine; remainingQty: number; unitId?: string }
  | {
      matched: false;
      reason:
        | "invalid_barcode"
        | "unknown_item"
        | "fully_scanned"
        | "over_quantity"
        | "flow_type_mismatch"
        | "duplicate_unit_scan";
    };

/**
 * Attempts to match a scanned barcode against the WRR's expected lines.
 *
 * Priority order for failure reasons:
 * 1. invalid_barcode — barcode is empty or whitespace-only
 * 2. unknown_item — no line matches the barcode, or matched line has null itemId
 * 3. flow_type_mismatch — matched line's itemFlowType differs from the WRR's flowType
 * 4. duplicate_unit_scan — parsed wrr_item_unit payload's unit_id is already present
 *    in alreadyScannedUnitIds (exact same physical label scanned before)
 * 5. over_quantity — matched line's scannedQty already exceeds expectedQty (corrupted state)
 * 6. fully_scanned — matched line's scannedQty equals expectedQty
 *
 * When multiple lines share the same barcode, the first non-exhausted line is selected.
 * The -1 in remainingQty accounts for the current scan being recorded.
 *
 * alreadyScannedUnitIds (optional, Spec 18 §2.2) — the set of unit_id values
 * already recorded as scanned (typically scoped to the matched wrr_item_id by
 * the caller, which has DB access this pure function does not). Only consulted
 * when the barcode parses as a wrr_item_unit JSON payload; ordinary barcodes
 * never populate or check unit_id, regardless of what this set contains. When
 * omitted, no duplicate-unit check is performed — existing callers that have
 * not yet been updated to supply this set keep working unchanged.
 */
export function matchScan(
  barcode: string,
  lines: WrrLine[],
  wrrFlowType?: "vmi" | "trading" | "supplies",
  alreadyScannedUnitIds?: Set<string>
): ScanMatchResult {
  // Guard: reject empty or whitespace-only barcodes
  if (barcode.trim() === "") {
    return { matched: false, reason: "invalid_barcode" };
  }

  // Parse JSON wrr_item_unit payload if present (Spec 18 §2.2)
  let parsedWrrItemId: string | null = null;
  let parsedUnitId: string | null = null;
  if (barcode.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(barcode.trim());
      if (parsed?.type === "wrr_item_unit" && typeof parsed?.wrr_item_id === "string") {
        parsedWrrItemId = parsed.wrr_item_id;
        if (typeof parsed?.unit_id === "string") {
          parsedUnitId = parsed.unit_id;
        }
      }
    } catch {
      // Not valid JSON — fall through to standard string matching
    }
  }

  // Find matching lines by wrr_item_id (JSON payload), itemBarcode, itemId, id, or lotNumber
  const matchingLines = lines.filter((l) => {
    if (parsedWrrItemId) {
      return l.id === parsedWrrItemId;
    }
    return (
      l.itemBarcode === barcode ||
      (l as unknown as { itemCode?: string }).itemCode === barcode ||
      l.itemId === barcode ||
      l.id === barcode ||
      l.lotNumber === barcode
    );
  });

  if (matchingLines.length === 0) {
    return { matched: false, reason: "unknown_item" };
  }

  // Walk matching lines in order; skip exhausted ones to support multi-line shared barcode
  for (const line of matchingLines) {
    // Item not yet enrolled — cannot fulfill this scan (R4.1)
    if (line.itemId === null) {
      return { matched: false, reason: "unknown_item" };
    }

    // Cross-check: resolved item's own flow_type must match the WRR's flow_type (§6.1)
    if (
      wrrFlowType !== undefined &&
      line.itemFlowType !== undefined &&
      line.itemFlowType !== null &&
      line.itemFlowType !== wrrFlowType
    ) {
      return { matched: false, reason: "flow_type_mismatch" };
    }

    // Exact duplicate-physical-label check (Spec 18 §2.2): only applies to
    // wrr_item_unit payloads with a parsed unit_id, and only when the caller
    // supplied a set to check against. Takes priority over quantity-state
    // reasons since a duplicate label is a rejection independent of them.
    if (parsedUnitId !== null && alreadyScannedUnitIds?.has(parsedUnitId)) {
      return { matched: false, reason: "duplicate_unit_scan" };
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
    return parsedUnitId !== null
      ? { matched: true, line, remainingQty, unitId: parsedUnitId }
      : { matched: true, line, remainingQty };
  }

  // All matching lines are fully scanned
  return { matched: false, reason: "fully_scanned" };
}

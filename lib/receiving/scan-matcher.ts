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
  | { matched: true; line: WrrLine; remainingQty: number; scanQty: number; unitId?: string }
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
 * 4. duplicate_unit_scan — the wrr_item_unit payload's unit_id was already scanned (Spec 18 §2.2)
 * 5. over_quantity — matched line's scannedQty already exceeds expectedQty (corrupted state)
 * 6. fully_scanned — matched line's scannedQty equals expectedQty
 *
 * When multiple lines share the same barcode, the first non-exhausted line is selected.
 * Every accepted QR represents one physical pallet or unit.
 *
 * `alreadyScannedUnitIds` (added for Spec 18 §2.2's per-unit duplicate
 * detection): when the barcode parses as a `wrr_item_unit` payload and its
 * `unit_id` is present in this set, the scan is rejected as
 * `duplicate_unit_scan` before quantity-state checks run — an *exact*
 * duplicate-label check, not the fuzzy running-count comparison every other
 * barcode type falls back to. On a successful match, the parsed `unit_id` is
 * returned on the result so the caller can persist it.
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

    // Exact duplicate-label check (§2.2): takes priority over quantity-state
    // checks, since a duplicate physical label is a rejection independent of
    // the line's quantity state, not a consequence of it.
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

    // Each accepted label represents exactly one physical pallet or unit.
    const scanQty = 1;
    const remainingQty = line.expectedQty - line.scannedQty - scanQty;
    return {
      matched: true,
      line,
      remainingQty,
      scanQty,
      ...(parsedUnitId !== null ? { unitId: parsedUnitId } : {}),
    };
  }

  // All matching lines are fully scanned
  return { matched: false, reason: "fully_scanned" };
}

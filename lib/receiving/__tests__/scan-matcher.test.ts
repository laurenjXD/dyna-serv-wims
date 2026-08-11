// RED-step unit tests for lib/receiving/scan-matcher.ts (does not exist yet).
//
// Traceability:
//   specs/07-incoming-receiving/design.md §6 — Floor scan and reconciliation
//     design: matcher resolves scanned barcode → active item identity → WRR
//     line(s) → expected qty/UOM/lot context. Rejects wrong WRR, wrong item,
//     unknown item, duplicate/over quantity, invalid UOM, unresolved lot context.
//   specs/07-incoming-receiving/design.md §5.2 — Scan-line state table: Matched,
//     Under-scanned, Over-scanned (rejected at scan time; not silently accepted),
//     Exception/unresolved.
//   specs/07-incoming-receiving/requirements.md R3.1 — each carton scan SHALL be
//     matched against the WRR's expected item/line and the approved barcode/item
//     identity mapping.
//   specs/07-incoming-receiving/requirements.md R3.2 — system SHALL track scanned
//     versus expected quantity per WRR line and SHALL prevent silent over-receipt.
//   specs/07-incoming-receiving/requirements.md R3.3 — wrong item, unknown barcode,
//     wrong WRR, duplicate carton, or quantity beyond expected SHALL produce
//     immediate non-success feedback and a recoverable exception state.
//   specs/07-incoming-receiving/requirements.md R4.1 — if barcode does not resolve
//     to an active item (itemId null), system SHALL pause that line and explain
//     the exception.
//
// These tests import from @/lib/receiving/scan-matcher which does not exist.
// Every test is expected to fail with "Cannot find module" until
// backend-builder creates the implementation.
//
// Expected module contract for lib/receiving/scan-matcher.ts:
//
//   type WrrLine = {
//     id: string;
//     itemId: string | null;
//     itemBarcode: string | null;
//     lotNumber: string;
//     expectedQty: number;
//     scannedQty: number;
//     disposition: 'store' | 'inspect';
//   }
//
//   type ScanMatchResult =
//     | { matched: true; line: WrrLine; remainingQty: number }
//     | { matched: false; reason: 'unknown_item' | 'wrong_wrr' | 'over_quantity' | 'fully_scanned' | 'invalid_barcode' }
//
//   matchScan(barcode: string, wrrLines: WrrLine[]): ScanMatchResult
//
// --- 2026-08-10 flow-type cross-check addition (RED, design.md §6.1) ---
//
// specs/07-incoming-receiving/design.md §6.1 — Flow-type cross-check (added
//   2026-08-10): once a scanned barcode resolves to an active item, its own
//   `items.flow_type` is compared against the current WRR's
//   `wrr_documents.flow_type`. A mismatch is rejected through the same
//   exception path as any other wrong-item/wrong-WRR scan — an additive
//   rejection reason on the existing exception UI.
// specs/07-incoming-receiving/requirements.md R3.3 (amended 2026-08-10) — a
//   scanned item whose own flow_type does not match the WRR's flow_type
//   SHALL produce immediate non-success feedback and a recoverable exception
//   state, through the same rejection path as wrong-item/unknown/duplicate/
//   over-quantity scans.
//
// The current `WrrLine` type has no flow_type field, and `matchScan` has no
// way to know the WRR's own flow_type, so this check cannot exist yet. The
// minimal type addition assumed by these tests:
//
//   type WrrLine = {
//     ...(existing fields)
//     itemFlowType?: 'vmi' | 'trading' | 'supplies' | null;  // resolved item's own flow_type
//   }
//
//   matchScan(barcode: string, wrrLines: WrrLine[], wrrFlowType?: 'vmi' | 'trading' | 'supplies'): ScanMatchResult
//
//   ScanMatchResult failure reason gains: 'flow_type_mismatch'

import { describe, expect, it } from "vitest";

const makeLine = (
  overrides: Partial<{
    id: string;
    itemId: string | null;
    itemBarcode: string | null;
    lotNumber: string;
    expectedQty: number;
    scannedQty: number;
    disposition: "store" | "inspect";
  }> = {}
) => ({
  id: "line-001",
  itemId: "item-uuid-001",
  itemBarcode: "BC-ALPHA-001",
  lotNumber: "LOT-2026-001",
  expectedQty: 10,
  scannedQty: 0,
  disposition: "store" as const,
  ...overrides,
});

describe("matchScan — invalid barcode returns invalid_barcode (design.md §6, requirements.md R3.3)", () => {
  it("AC-R3.3: returns { matched: false, reason: 'invalid_barcode' } for an empty string barcode", async () => {
    const { matchScan } = await import("@/lib/receiving/scan-matcher");

    const result = matchScan("", [makeLine()]);

    expect(result.matched).toBe(false);
    if (result.matched) return;
    expect(result.reason).toBe("invalid_barcode");
  });

  it("AC-R3.3: returns { matched: false, reason: 'invalid_barcode' } for a whitespace-only barcode", async () => {
    const { matchScan } = await import("@/lib/receiving/scan-matcher");

    const result = matchScan("   ", [makeLine()]);

    expect(result.matched).toBe(false);
    if (result.matched) return;
    expect(result.reason).toBe("invalid_barcode");
  });
});

describe("matchScan — unknown barcode returns unknown_item (design.md §6, requirements.md R3.3, R4.1)", () => {
  it("AC-R3.3: returns { matched: false, reason: 'unknown_item' } when no line has a matching barcode", async () => {
    const { matchScan } = await import("@/lib/receiving/scan-matcher");

    const result = matchScan("BC-NONEXISTENT", [makeLine()]);

    expect(result.matched).toBe(false);
    if (result.matched) return;
    expect(result.reason).toBe("unknown_item");
  });
});

describe("matchScan — successful match (design.md §6, requirements.md R3.1)", () => {
  it("AC-R3.1: returns { matched: true, line, remainingQty } when a line's itemBarcode exactly matches", async () => {
    const { matchScan } = await import("@/lib/receiving/scan-matcher");
    const line = makeLine({ expectedQty: 10, scannedQty: 3 });

    const result = matchScan("BC-ALPHA-001", [line]);

    expect(result.matched).toBe(true);
    if (!result.matched) return;
    expect(result.line.id).toBe("line-001");
  });

  it("AC-R3.2: matched result carries correct remainingQty = expectedQty - scannedQty - 1", async () => {
    const { matchScan } = await import("@/lib/receiving/scan-matcher");
    const line = makeLine({ expectedQty: 10, scannedQty: 3 });

    const result = matchScan("BC-ALPHA-001", [line]);

    expect(result.matched).toBe(true);
    if (!result.matched) return;
    // After this scan: scannedQty would be 4 (3 + 1), remaining = 10 - 4 = 6
    expect(result.remainingQty).toBe(6);
  });
});

describe("matchScan — fully_scanned when scannedQty >= expectedQty (design.md §5.2, requirements.md R3.2)", () => {
  it("AC-R3.2/R3.3: returns { matched: false, reason: 'fully_scanned' } when matching line is already fully scanned", async () => {
    const { matchScan } = await import("@/lib/receiving/scan-matcher");
    const line = makeLine({ expectedQty: 5, scannedQty: 5 });

    const result = matchScan("BC-ALPHA-001", [line]);

    expect(result.matched).toBe(false);
    if (result.matched) return;
    expect(result.reason).toBe("fully_scanned");
  });
});

describe("matchScan — over_quantity for malformed data where scannedQty > expectedQty (design.md §5.2)", () => {
  it("AC-R3.2: returns { matched: false, reason: 'over_quantity' } when scannedQty already exceeds expectedQty (malformed/corrupted state)", async () => {
    const { matchScan } = await import("@/lib/receiving/scan-matcher");
    // Malformed state: scannedQty already beyond expectedQty
    const line = makeLine({ expectedQty: 5, scannedQty: 7 });

    const result = matchScan("BC-ALPHA-001", [line]);

    expect(result.matched).toBe(false);
    if (result.matched) return;
    expect(result.reason === "over_quantity" || result.reason === "fully_scanned").toBe(true);
  });
});

describe("matchScan — first non-fully-scanned match when multiple lines share barcode (design.md §6 edge case)", () => {
  it("AC-R3.1: returns the first non-fully-scanned matching line when multiple lines share the same barcode", async () => {
    const { matchScan } = await import("@/lib/receiving/scan-matcher");
    const exhaustedLine = makeLine({
      id: "line-001",
      itemBarcode: "BC-SHARED",
      expectedQty: 5,
      scannedQty: 5,
    });
    const availableLine = makeLine({
      id: "line-002",
      itemBarcode: "BC-SHARED",
      expectedQty: 10,
      scannedQty: 2,
    });

    const result = matchScan("BC-SHARED", [exhaustedLine, availableLine]);

    expect(result.matched).toBe(true);
    if (!result.matched) return;
    expect(result.line.id).toBe("line-002");
  });
});

describe("matchScan — unresolved item (itemId null) returns unknown_item (requirements.md R4.1)", () => {
  it("AC-R4.1: returns { matched: false, reason: 'unknown_item' } when barcode matches a line whose itemId is null", async () => {
    const { matchScan } = await import("@/lib/receiving/scan-matcher");
    const unenrolledLine = makeLine({
      itemId: null,
      itemBarcode: "BC-UNENROLLED",
    });

    const result = matchScan("BC-UNENROLLED", [unenrolledLine]);

    expect(result.matched).toBe(false);
    if (result.matched) return;
    expect(result.reason).toBe("unknown_item");
  });
});

// --- 2026-08-11 duplicate-unit-scan detection addition (RED, spec 18 §2.2) ---
//
// specs/18-barcode-integration/design.md §2.2 — WRR-time per-unit label
//   generation: each of the `N` labels printed for a `wrr_items` line carries
//   its own unique `unit_id`, specifically so the matcher can detect "this
//   exact physical label was scanned a second time" (a duplicate that must
//   be rejected) versus "a second, different physical unit on the same line
//   was scanned" (a legitimate additional unit toward `expected_qty`) — an
//   *exact* duplicate check, not the fuzzy running-qty-counter comparison
//   every other barcode type falls back to.
//
// Prior to this addition, `unit_id` was parsed out of the `wrr_item_unit`
// JSON payload (lines 66-77) but never read again — matchScan fell through
// to the same scannedQty counter logic as any other barcode, so scanning the
// same physical printed label twice silently incremented scannedQty twice
// instead of being rejected. This is the exact failure mode design.md §2.2
// was written to prevent ("a duplicate scan would silently pass as a
// legitimate second unit before the expected count is reached").
//
// The current `ScanMatchResult` has no `duplicate_unit_scan` reason and no
// `unitId` field on its `matched: true` branch, and `matchScan` has no
// parameter for already-recorded unit_ids, so none of this can exist yet.
// The minimal contract addition assumed by these tests:
//
//   type ScanMatchResult =
//     | { matched: true; line: WrrLine; remainingQty: number; unitId?: string }
//     | { matched: false; reason: ...(existing) | 'duplicate_unit_scan' }
//
//   matchScan(
//     barcode: string,
//     lines: WrrLine[],
//     wrrFlowType?: 'vmi' | 'trading' | 'supplies',
//     alreadyScannedUnitIds?: Set<string>
//   ): ScanMatchResult
//
// `duplicate_unit_scan` must be checked, and take priority over,
// `fully_scanned`/`over_quantity` — mirroring how `flow_type_mismatch` was
// already given priority treatment above (design.md §6.1's precedent) —
// since a duplicate physical label is a rejection independent of the line's
// quantity state, not a consequence of it.

describe("matchScan — duplicate unit-id detection for wrr_item_unit payloads (design.md §2.2, added 2026-08-11)", () => {
  const makeUnitPayload = (wrrItemId: string, unitId: string) =>
    JSON.stringify({ type: "wrr_item_unit", wrr_item_id: wrrItemId, unit_id: unitId });

  it("AC-§2.2: a fresh unit_id (not present in alreadyScannedUnitIds) matches normally and the matched:true result carries that unitId", async () => {
    const { matchScan } = await import("@/lib/receiving/scan-matcher");
    const line = makeLine({ id: "line-001", expectedQty: 10, scannedQty: 3 });
    const barcode = makeUnitPayload("line-001", "unit-fresh-001");

    const result = matchScan(barcode, [line], "vmi", new Set(["unit-other-999"]));

    expect(result.matched).toBe(true);
    if (!result.matched) return;
    expect(result.unitId).toBe("unit-fresh-001");
  });

  it("AC-§2.2: a unit_id already present in alreadyScannedUnitIds is rejected with { matched: false, reason: 'duplicate_unit_scan' }, even when the line is nowhere near fully scanned by quantity", async () => {
    const { matchScan } = await import("@/lib/receiving/scan-matcher");
    const line = makeLine({ id: "line-001", expectedQty: 10, scannedQty: 1 });
    const barcode = makeUnitPayload("line-001", "unit-dup-001");

    const result = matchScan(barcode, [line], "vmi", new Set(["unit-dup-001"]));

    expect(result.matched).toBe(false);
    if (result.matched) return;
    expect(result.reason).toBe("duplicate_unit_scan");
  });

  it("AC-§2.2: duplicate_unit_scan takes priority over fully_scanned — a line that is both fully scanned AND has a duplicate unit_id reports duplicate_unit_scan, not fully_scanned", async () => {
    const { matchScan } = await import("@/lib/receiving/scan-matcher");
    const line = makeLine({ id: "line-001", expectedQty: 5, scannedQty: 5 });
    const barcode = makeUnitPayload("line-001", "unit-dup-002");

    const result = matchScan(barcode, [line], "vmi", new Set(["unit-dup-002"]));

    expect(result.matched).toBe(false);
    if (result.matched) return;
    expect(result.reason).toBe("duplicate_unit_scan");
  });

  it("AC-§2.2: duplicate_unit_scan takes priority over over_quantity — a malformed line where scannedQty > expectedQty AND the unit_id is a duplicate reports duplicate_unit_scan, not over_quantity", async () => {
    const { matchScan } = await import("@/lib/receiving/scan-matcher");
    const line = makeLine({ id: "line-001", expectedQty: 5, scannedQty: 7 });
    const barcode = makeUnitPayload("line-001", "unit-dup-003");

    const result = matchScan(barcode, [line], "vmi", new Set(["unit-dup-003"]));

    expect(result.matched).toBe(false);
    if (result.matched) return;
    expect(result.reason).toBe("duplicate_unit_scan");
  });

  it("AC-§2.2: ordinary plain-string-barcode matches (not JSON wrr_item_unit payloads) never carry a unitId field on matched:true, even when alreadyScannedUnitIds is supplied", async () => {
    const { matchScan } = await import("@/lib/receiving/scan-matcher");
    const line = makeLine({ itemBarcode: "BC-ALPHA-001", expectedQty: 10, scannedQty: 3 });

    // Deliberately overlapping-looking value — there is nothing for it to
    // overlap with, since a plain string barcode match has no unit_id at all.
    const result = matchScan("BC-ALPHA-001", [line], "vmi", new Set(["BC-ALPHA-001"]));

    expect(result.matched).toBe(true);
    if (!result.matched) return;
    expect(result.unitId).toBeUndefined();
  });

  it("AC-§2.2: ordinary plain-string-barcode matches are never rejected as duplicate_unit_scan, even when alreadyScannedUnitIds is supplied with an overlapping-looking value — the duplicate check is scoped strictly to the wrr_item_unit payload path", async () => {
    const { matchScan } = await import("@/lib/receiving/scan-matcher");
    // Fully-scanned-by-quantity line so we can prove the plain-barcode path
    // isn't accidentally rejected as duplicate_unit_scan instead of
    // (correctly) fully_scanned — i.e. the duplicate-unit check must never
    // even fire for a non-JSON barcode.
    const line = makeLine({ itemBarcode: "BC-ALPHA-001", expectedQty: 5, scannedQty: 5 });

    const result = matchScan("BC-ALPHA-001", [line], "vmi", new Set(["BC-ALPHA-001"]));

    expect(result.matched).toBe(false);
    if (result.matched) return;
    expect(result.reason).toBe("fully_scanned");
  });

  it("AC-§2.2: when alreadyScannedUnitIds is omitted entirely (undefined), a wrr_item_unit payload still matches normally — backward compatible with every existing call site of matchScan that hasn't been updated for this feature yet (e.g. lib/actions/receiving.ts's recordScan, Task D)", async () => {
    const { matchScan } = await import("@/lib/receiving/scan-matcher");
    const line = makeLine({ id: "line-001", expectedQty: 10, scannedQty: 3 });
    const barcode = makeUnitPayload("line-001", "unit-no-set-001");

    const result = matchScan(barcode, [line], "vmi");

    expect(result.matched).toBe(true);
  });
});

describe("matchScan — flow-type cross-check rejection (design.md §6.1, requirements.md R3.3 added 2026-08-10)", () => {
  it("AC-R3.3/§6.1: returns { matched: false, reason: 'flow_type_mismatch' } when the resolved item's own flow_type differs from the WRR's flow_type, even though the barcode matches an otherwise-available line", async () => {
    const { matchScan } = await import("@/lib/receiving/scan-matcher");
    // Line resolves to an item whose own flow_type is 'trading', but the WRR
    // being received is a 'vmi' WRR — this must be rejected through the same
    // exception path as a wrong-item scan, per design.md §6.1.
    const line = makeLine({
      itemBarcode: "BC-ALPHA-001",
      expectedQty: 10,
      scannedQty: 0,
      // @ts-expect-error — itemFlowType does not exist on the current WrrLine type
      itemFlowType: "trading",
    });

    const result = matchScan("BC-ALPHA-001", [line], "vmi");

    expect(result.matched).toBe(false);
    if (result.matched) return;
    expect(result.reason).toBe("flow_type_mismatch");
  });

  it("AC-R3.3/§6.1: still matches successfully when the resolved item's flow_type equals the WRR's flow_type", async () => {
    const { matchScan } = await import("@/lib/receiving/scan-matcher");
    const line = makeLine({
      itemBarcode: "BC-ALPHA-001",
      expectedQty: 10,
      scannedQty: 0,
      // @ts-expect-error — itemFlowType does not exist on the current WrrLine type
      itemFlowType: "vmi",
    });

    const result = matchScan("BC-ALPHA-001", [line], "vmi");

    expect(result.matched).toBe(true);
  });

  it("AC-R3.3/§6.1: a flow_type_mismatch rejection takes priority over an otherwise-fully-scanned line, mirroring how other cross-check rejections (e.g. unknown_item) are checked before quantity-state reasons", async () => {
    const { matchScan } = await import("@/lib/receiving/scan-matcher");
    // Even a fully-scanned line's mismatch should surface as flow_type_mismatch,
    // not silently fall through to fully_scanned — the WRR-level flow check is a
    // cross-check on the resolved item identity, independent of quantity state.
    const line = makeLine({
      itemBarcode: "BC-ALPHA-001",
      expectedQty: 5,
      scannedQty: 5,
      // @ts-expect-error — itemFlowType does not exist on the current WrrLine type
      itemFlowType: "supplies",
    });

    const result = matchScan("BC-ALPHA-001", [line], "vmi");

    expect(result.matched).toBe(false);
    if (result.matched) return;
    expect(result.reason).toBe("flow_type_mismatch");
  });
});

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

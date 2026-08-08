// RED-step unit tests for lib/transfer/scan-matcher.ts (does not exist yet).
//
// Traceability:
//   specs/11-transfer-and-inspection/requirements.md R4.2 — source scans SHALL verify the
//     expected item/barcode, lot, location, and quantity before physical movement is accepted.
//   specs/11-transfer-and-inspection/requirements.md R4.3 — destination scans SHALL verify the
//     expected destination location and item/lot before completion.
//   specs/11-transfer-and-inspection/requirements.md R4.4 — wrong item, wrong lot, wrong location,
//     duplicate scan, over-quantity, stale request, and insufficient source quantity SHALL receive
//     immediate recoverable feedback.
//
// These tests import from @/lib/transfer/scan-matcher which does not exist.
// Every test is expected to fail with "Cannot find module" until
// backend-builder creates the implementation.
//
// Expected module contract for lib/transfer/scan-matcher.ts:
//   matchTransferScan(barcode: string, lines: TransferLine[], phase: 'source' | 'destination')
//     : { matched: true; line: TransferLine; remainingQty: number }
//     | { matched: false; reason: 'invalid_barcode' | 'unknown_item' | 'fully_transferred' | 'wrong_phase' | 'wrong_location' }

import { describe, expect, it } from "vitest";

const SOURCE_LOCATION = "loc-src-001";
const DEST_LOCATION = "loc-dst-001";

function makeLine(
  overrides: Partial<{
    id: string;
    lotId: string;
    itemId: string;
    qtyRequested: number;
    qtyTransferred: number;
    status: string;
    itemBarcode: string | null;
    sourceLocationId: string | null;
    destinationLocationId: string | null;
  }> = {}
) {
  return {
    id: "line-001",
    lotId: "lot-uuid-001",
    itemId: "item-uuid-001",
    qtyRequested: 10,
    qtyTransferred: 0,
    status: "pending",
    itemBarcode: "BARCODE-123",
    sourceLocationId: SOURCE_LOCATION,
    destinationLocationId: DEST_LOCATION,
    ...overrides,
  };
}

describe("matchTransferScan — empty/whitespace barcode (requirements.md R4.4)", () => {
  it("AC-R4.4: returns { matched: false, reason: 'invalid_barcode' } for an empty string", async () => {
    const { matchTransferScan } = await import("@/lib/transfer/scan-matcher");

    const result = matchTransferScan("", [makeLine()], "source");

    expect(result.matched).toBe(false);
    if (result.matched) return;
    expect(result.reason).toBe("invalid_barcode");
  });

  it("AC-R4.4: returns { matched: false, reason: 'invalid_barcode' } for a whitespace-only string", async () => {
    const { matchTransferScan } = await import("@/lib/transfer/scan-matcher");

    const result = matchTransferScan("   ", [makeLine()], "source");

    expect(result.matched).toBe(false);
    if (result.matched) return;
    expect(result.reason).toBe("invalid_barcode");
  });
});

describe("matchTransferScan — no matching barcode (requirements.md R4.4)", () => {
  it("AC-R4.4: returns { matched: false, reason: 'unknown_item' } when barcode does not match any line", async () => {
    const { matchTransferScan } = await import("@/lib/transfer/scan-matcher");

    const result = matchTransferScan("UNKNOWN-BARCODE", [makeLine()], "source");

    expect(result.matched).toBe(false);
    if (result.matched) return;
    expect(result.reason).toBe("unknown_item");
  });
});

describe("matchTransferScan — line already completed (requirements.md R4.4)", () => {
  it("AC-R4.4: returns { matched: false, reason: 'fully_transferred' } when line status is 'completed'", async () => {
    const { matchTransferScan } = await import("@/lib/transfer/scan-matcher");

    const line = makeLine({ status: "completed", qtyTransferred: 10 });
    const result = matchTransferScan("BARCODE-123", [line], "source");

    expect(result.matched).toBe(false);
    if (result.matched) return;
    expect(result.reason).toBe("fully_transferred");
  });
});

describe("matchTransferScan — valid source scan (requirements.md R4.2)", () => {
  it("AC-R4.2: returns { matched: true, line, remainingQty: qtyRequested - qtyTransferred - 1 } for a valid source scan", async () => {
    const { matchTransferScan } = await import("@/lib/transfer/scan-matcher");

    const line = makeLine({ qtyRequested: 10, qtyTransferred: 3 });
    const result = matchTransferScan("BARCODE-123", [line], "source");

    expect(result.matched).toBe(true);
    if (!result.matched) return;
    expect(result.line.id).toBe(line.id);
    // remainingQty accounts for the current scan being counted
    expect(result.remainingQty).toBe(10 - 3 - 1); // 6
  });
});

describe("matchTransferScan — qtyTransferred >= qtyRequested (requirements.md R4.4)", () => {
  it("AC-R4.4: returns { matched: false, reason: 'fully_transferred' } when qtyTransferred equals qtyRequested", async () => {
    const { matchTransferScan } = await import("@/lib/transfer/scan-matcher");

    const line = makeLine({ qtyRequested: 5, qtyTransferred: 5 });
    const result = matchTransferScan("BARCODE-123", [line], "source");

    expect(result.matched).toBe(false);
    if (result.matched) return;
    expect(result.reason).toBe("fully_transferred");
  });

  it("AC-R4.4: returns { matched: false, reason: 'fully_transferred' } when qtyTransferred exceeds qtyRequested", async () => {
    const { matchTransferScan } = await import("@/lib/transfer/scan-matcher");

    const line = makeLine({ qtyRequested: 5, qtyTransferred: 7 });
    const result = matchTransferScan("BARCODE-123", [line], "source");

    expect(result.matched).toBe(false);
    if (result.matched) return;
    expect(result.reason).toBe("fully_transferred");
  });
});

describe("matchTransferScan — null itemBarcode (requirements.md R4.4)", () => {
  it("AC-R4.4: returns { matched: false, reason: 'unknown_item' } when the matching line has itemBarcode = null", async () => {
    const { matchTransferScan } = await import("@/lib/transfer/scan-matcher");

    // Line has barcode null; scan with any value cannot match it
    const line = makeLine({ itemBarcode: null });
    const result = matchTransferScan("BARCODE-123", [line], "source");

    expect(result.matched).toBe(false);
    if (result.matched) return;
    expect(result.reason).toBe("unknown_item");
  });
});

describe("matchTransferScan — multiple lines with same barcode (requirements.md R4.2)", () => {
  it("AC-R4.2: selects the first non-completed line when multiple lines share the same barcode", async () => {
    const { matchTransferScan } = await import("@/lib/transfer/scan-matcher");

    const completedLine = makeLine({
      id: "line-001",
      status: "completed",
      qtyTransferred: 10,
      qtyRequested: 10,
    });
    const pendingLine = makeLine({
      id: "line-002",
      qtyTransferred: 2,
      qtyRequested: 8,
    });

    const result = matchTransferScan(
      "BARCODE-123",
      [completedLine, pendingLine],
      "source"
    );

    expect(result.matched).toBe(true);
    if (!result.matched) return;
    expect(result.line.id).toBe("line-002");
    expect(result.remainingQty).toBe(8 - 2 - 1); // 5
  });
});

describe("matchTransferScan — valid destination scan (requirements.md R4.3)", () => {
  it("AC-R4.3: returns { matched: true, line, remainingQty } for a valid destination phase scan", async () => {
    const { matchTransferScan } = await import("@/lib/transfer/scan-matcher");

    const line = makeLine({ qtyRequested: 6, qtyTransferred: 0 });
    const result = matchTransferScan("BARCODE-123", [line], "destination");

    expect(result.matched).toBe(true);
    if (!result.matched) return;
    expect(result.line.id).toBe(line.id);
    expect(result.remainingQty).toBe(6 - 0 - 1); // 5
  });
});

// RED-step unit tests for lib/receiving/scan-validator.ts (does not exist yet).
//
// Traceability:
//   specs/07-incoming-receiving/requirements.md R3.1 — Each carton scan SHALL be matched
//     against the WRR's expected item/line and the approved barcode/item identity mapping.
//   specs/07-incoming-receiving/requirements.md R3.2 — The system SHALL track scanned versus
//     expected quantity per WRR line and SHALL prevent silent over-receipt.
//   specs/07-incoming-receiving/requirements.md R3.3 — A scan for the wrong item, unknown
//     barcode, wrong WRR, duplicate carton, or quantity beyond the expected amount SHALL
//     produce immediate non-success feedback and a recoverable exception state.
//   specs/07-incoming-receiving/requirements.md §3 Lifecycle — physical scans are only valid
//     while the WRR is in `receiving_in_progress` status.
//   specs/07-incoming-receiving/requirements.md §5 AC — "Floor scans match expected WRR
//     lines, visibly track remaining quantities, and reject wrong/duplicate/over-quantity/
//     unknown scans safely."
//
// These tests import from @/lib/receiving/scan-validator which does not exist.
// Every test is expected to fail with "Cannot find module" until
// backend-builder creates the implementation.
//
// Expected module contract for lib/receiving/scan-validator.ts:
//
//   type ScanInput = {
//     wrrId: string;
//     wrrStatus: 'draft' | 'receiving_in_progress' | 'completed' | 'cancelled';
//     lineId: string;
//     scannedBarcode: string;
//     expectedBarcode: string;
//     expectedItemId: string;
//     scannedItemId: string;
//     currentScannedQty: number;   // already scanned on this line before this scan
//     expectedQty: number;
//     isDuplicateScan: boolean;    // true if this carton ID was already recorded
//   }
//
//   type ScanResult =
//     | { ok: true }
//     | { ok: false; error: 'wrong_wrr_status' | 'barcode_mismatch' | 'item_mismatch'
//                         | 'duplicate_scan' | 'over_quantity' }
//
//   validateScan(input: ScanInput): ScanResult

import { describe, expect, it } from "vitest";

const VALID_INPUT = {
  wrrId: "wrr-uuid-001",
  wrrStatus: "receiving_in_progress" as const,
  lineId: "line-uuid-001",
  scannedBarcode: "BC-ALPHA-001",
  expectedBarcode: "BC-ALPHA-001",
  expectedItemId: "item-uuid-001",
  scannedItemId: "item-uuid-001",
  currentScannedQty: 4,
  expectedQty: 10,
  isDuplicateScan: false,
};

describe("validateScan — valid scan passes all checks (requirements.md R3.1, R3.2)", () => {
  it("AC-R3.1/R3.2: returns { ok: true } when all checks pass and currentScannedQty + 1 <= expectedQty", async () => {
    const { validateScan } = await import("@/lib/receiving/scan-validator");

    const result = validateScan(VALID_INPUT);

    expect(result.ok).toBe(true);
  });
});

describe("validateScan — WRR must be receiving_in_progress (requirements.md §3 Lifecycle)", () => {
  it.each(["draft", "completed", "cancelled"] as const)(
    "AC-R3.3: returns wrong_wrr_status when wrrStatus is '%s'",
    async (wrrStatus) => {
      const { validateScan } = await import("@/lib/receiving/scan-validator");

      const result = validateScan({ ...VALID_INPUT, wrrStatus });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe("wrong_wrr_status");
    }
  );
});

describe("validateScan — barcode must match expected (requirements.md R3.1, R3.3)", () => {
  it("AC-R3.3: returns barcode_mismatch when scannedBarcode !== expectedBarcode", async () => {
    const { validateScan } = await import("@/lib/receiving/scan-validator");

    const result = validateScan({
      ...VALID_INPUT,
      scannedBarcode: "BC-WRONG-999",
      expectedBarcode: "BC-ALPHA-001",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("barcode_mismatch");
  });
});

describe("validateScan — item identity must match (requirements.md R3.1, R3.3)", () => {
  it("AC-R3.3: returns item_mismatch when scannedItemId !== expectedItemId", async () => {
    const { validateScan } = await import("@/lib/receiving/scan-validator");

    const result = validateScan({
      ...VALID_INPUT,
      scannedItemId: "item-uuid-WRONG",
      expectedItemId: "item-uuid-001",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("item_mismatch");
  });
});

describe("validateScan — duplicate carton rejected (requirements.md R3.3)", () => {
  it("AC-R3.3: returns duplicate_scan when isDuplicateScan is true", async () => {
    const { validateScan } = await import("@/lib/receiving/scan-validator");

    const result = validateScan({ ...VALID_INPUT, isDuplicateScan: true });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("duplicate_scan");
  });
});

describe("validateScan — over-receipt prevented (requirements.md R3.2, R3.3)", () => {
  it("AC-R3.2: returns over_quantity when currentScannedQty >= expectedQty (already at capacity)", async () => {
    const { validateScan } = await import("@/lib/receiving/scan-validator");

    const result = validateScan({
      ...VALID_INPUT,
      currentScannedQty: 10,
      expectedQty: 10,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("over_quantity");
  });

  it("AC-R3.2: returns over_quantity when currentScannedQty exceeds expectedQty", async () => {
    const { validateScan } = await import("@/lib/receiving/scan-validator");

    const result = validateScan({
      ...VALID_INPUT,
      currentScannedQty: 12,
      expectedQty: 10,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("over_quantity");
  });
});

describe("validateScan — priority order: wrong_wrr_status checked before barcode_mismatch (requirements.md R3.3)", () => {
  it("AC-R3.3: returns wrong_wrr_status (not barcode_mismatch) when both status and barcode are wrong", async () => {
    const { validateScan } = await import("@/lib/receiving/scan-validator");

    const result = validateScan({
      ...VALID_INPUT,
      wrrStatus: "draft",
      scannedBarcode: "BC-WRONG-999",
      expectedBarcode: "BC-ALPHA-001",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("wrong_wrr_status");
  });
});

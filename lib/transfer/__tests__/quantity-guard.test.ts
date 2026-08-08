// RED-step unit tests for lib/transfer/quantity-guard.ts (does not exist yet).
//
// Traceability:
//   specs/11-transfer-and-inspection/requirements.md R1.4 — The server SHALL validate the
//     current source quantity, lot status, item identity, flow partition, location type/
//     capacity, and caller scope.
//   specs/11-transfer-and-inspection/requirements.md R4.4 — Wrong item, wrong lot, wrong
//     location, duplicate scan, over-quantity, stale request, and insufficient source
//     quantity SHALL receive immediate recoverable feedback.
//   specs/11-transfer-and-inspection/requirements.md R5.2 — The commit SHALL atomically
//     revalidate request state, approval/inspection, source quantity, destination validity/
//     capacity, lot/flow identity, scan evidence, and idempotency key.
//   specs/11-transfer-and-inspection/requirements.md §6 AC — "Source/destination scans
//     reject mismatches and support safe recovery."
//
// These tests import from @/lib/transfer/quantity-guard which does not exist.
// Every test is expected to fail with "Cannot find module" until
// backend-builder creates the implementation.
//
// Expected module contract for lib/transfer/quantity-guard.ts:
//
//   type TransferLine = {
//     lotId: string;
//     locationId: string;
//     qtyRequested: number;
//   }
//
//   type BalanceRow = {
//     lotId: string;
//     locationId: string;
//     qtyRemaining: number;
//     qtyCommitted: number;
//   }
//
//   type ShortfallEntry = {
//     lotId: string;
//     locationId: string;
//     available: number;
//     requested: number;
//   }
//
//   type QuantityGuardResult =
//     | { ok: true }
//     | { ok: false; error: 'insufficient_stock'; shortfall: ShortfallEntry[] }
//
//   checkTransferQuantity(
//     lines: TransferLine[],
//     balances: BalanceRow[]
//   ): QuantityGuardResult

import { describe, expect, it } from "vitest";

const LOT_A = "lot-uuid-aaa";
const LOT_B = "lot-uuid-bbb";
const LOC_1 = "loc-uuid-001";
const LOC_2 = "loc-uuid-002";

describe("checkTransferQuantity — all lines sufficient returns ok (requirements.md R1.4)", () => {
  it("AC-R1.4: returns { ok: true } when every line has qtyRemaining - qtyCommitted >= qtyRequested", async () => {
    const { checkTransferQuantity } = await import(
      "@/lib/transfer/quantity-guard"
    );

    const lines = [{ lotId: LOT_A, locationId: LOC_1, qtyRequested: 5 }];
    const balances = [
      { lotId: LOT_A, locationId: LOC_1, qtyRemaining: 20, qtyCommitted: 3 },
    ];

    const result = checkTransferQuantity(lines, balances);

    expect(result.ok).toBe(true);
  });
});

describe("checkTransferQuantity — single short line triggers insufficient_stock (requirements.md R1.4, R4.4)", () => {
  it("AC-R4.4: returns insufficient_stock with correct shortfall when one line cannot be fulfilled", async () => {
    const { checkTransferQuantity } = await import(
      "@/lib/transfer/quantity-guard"
    );

    const lines = [{ lotId: LOT_A, locationId: LOC_1, qtyRequested: 15 }];
    const balances = [
      { lotId: LOT_A, locationId: LOC_1, qtyRemaining: 10, qtyCommitted: 0 },
    ];

    const result = checkTransferQuantity(lines, balances);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("insufficient_stock");
    expect(result.shortfall).toHaveLength(1);
    expect(result.shortfall[0].lotId).toBe(LOT_A);
    expect(result.shortfall[0].locationId).toBe(LOC_1);
    expect(result.shortfall[0].available).toBe(10);
    expect(result.shortfall[0].requested).toBe(15);
  });
});

describe("checkTransferQuantity — all short lines reported, not just first (requirements.md R1.4)", () => {
  it("AC-R1.4: returns shortfall listing ALL short lines when multiple lines are insufficient", async () => {
    const { checkTransferQuantity } = await import(
      "@/lib/transfer/quantity-guard"
    );

    const lines = [
      { lotId: LOT_A, locationId: LOC_1, qtyRequested: 10 },
      { lotId: LOT_B, locationId: LOC_2, qtyRequested: 20 },
    ];
    const balances = [
      { lotId: LOT_A, locationId: LOC_1, qtyRemaining: 5, qtyCommitted: 0 },
      { lotId: LOT_B, locationId: LOC_2, qtyRemaining: 8, qtyCommitted: 0 },
    ];

    const result = checkTransferQuantity(lines, balances);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("insufficient_stock");
    expect(result.shortfall).toHaveLength(2);
    const lotIds = result.shortfall.map((s) => s.lotId);
    expect(lotIds).toContain(LOT_A);
    expect(lotIds).toContain(LOT_B);
  });
});

describe("checkTransferQuantity — exactly sufficient is accepted (requirements.md R1.4)", () => {
  it("AC-R1.4: returns { ok: true } when qtyRemaining - qtyCommitted === qtyRequested (exact match)", async () => {
    const { checkTransferQuantity } = await import(
      "@/lib/transfer/quantity-guard"
    );

    const lines = [{ lotId: LOT_A, locationId: LOC_1, qtyRequested: 7 }];
    const balances = [
      { lotId: LOT_A, locationId: LOC_1, qtyRemaining: 10, qtyCommitted: 3 },
    ];

    const result = checkTransferQuantity(lines, balances);

    expect(result.ok).toBe(true);
  });
});

describe("checkTransferQuantity — over-committed balance treated as zero available (requirements.md R1.4)", () => {
  it("AC-R1.4: returns insufficient_stock with available = 0 when qtyCommitted > qtyRemaining", async () => {
    const { checkTransferQuantity } = await import(
      "@/lib/transfer/quantity-guard"
    );

    const lines = [{ lotId: LOT_A, locationId: LOC_1, qtyRequested: 1 }];
    const balances = [
      // committed exceeds remaining — available must not go negative
      { lotId: LOT_A, locationId: LOC_1, qtyRemaining: 5, qtyCommitted: 8 },
    ];

    const result = checkTransferQuantity(lines, balances);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("insufficient_stock");
    expect(result.shortfall).toHaveLength(1);
    expect(result.shortfall[0].available).toBe(0);
    expect(result.shortfall[0].requested).toBe(1);
  });
});

describe("checkTransferQuantity — missing balance row treated as zero available (requirements.md R1.4)", () => {
  it("AC-R1.4: returns insufficient_stock when no balance row matches the line's lotId + locationId", async () => {
    const { checkTransferQuantity } = await import(
      "@/lib/transfer/quantity-guard"
    );

    const lines = [{ lotId: LOT_A, locationId: LOC_1, qtyRequested: 5 }];
    // Balances contain a different lot/location pair — no match for LOT_A + LOC_1
    const balances = [
      { lotId: LOT_B, locationId: LOC_2, qtyRemaining: 100, qtyCommitted: 0 },
    ];

    const result = checkTransferQuantity(lines, balances);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("insufficient_stock");
    expect(result.shortfall).toHaveLength(1);
    expect(result.shortfall[0].lotId).toBe(LOT_A);
    expect(result.shortfall[0].locationId).toBe(LOC_1);
    expect(result.shortfall[0].available).toBe(0);
    expect(result.shortfall[0].requested).toBe(5);
  });
});

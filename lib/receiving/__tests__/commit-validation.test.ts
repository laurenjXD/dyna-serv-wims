// RED-step unit tests for lib/receiving/commit-validation.ts (does not exist yet).
//
// Traceability:
//   specs/07-incoming-receiving/design.md §9 — Receipt commit and idempotency:
//     the commit verifies all required quantities, conformance decisions, and
//     disposition values are present and valid; locks WRR from concurrent
//     confirmation; checks WRR status, scan totals, active item/party references,
//     flow partition, required lot metadata, per-line disposition values, and any
//     required capacity/putaway prerequisites.
//   specs/07-incoming-receiving/design.md §5.2 — Scan-line state: under-scanned
//     (scannedQty < expectedQty) is not confirmable.
//   specs/07-incoming-receiving/requirements.md R7.2 — commit SHALL atomically
//     validate the WRR status, scan totals, conformance decisions, active
//     item/party references, flow partition, required lot metadata, per-line
//     disposition values, and any required capacity/putaway prerequisites.
//   specs/07-incoming-receiving/requirements.md R3.5 — a receipt SHALL NOT be
//     confirmable while required lines, unresolved exceptions, or required
//     inspection decisions remain outstanding.
//   specs/07-incoming-receiving/requirements.md R4.3 — new item enrollment SHALL
//     NOT be silently performed; unresolved items block confirmation.
//   specs/07-incoming-receiving/requirements.md R5.1 — each WRR line SHALL carry
//     a disposition value ('store' or 'inspect') — null disposition blocks commit.
//
// These tests import from @/lib/receiving/commit-validation which does not exist.
// Every test is expected to fail with "Cannot find module" until
// backend-builder creates the implementation.
//
// Expected module contract for lib/receiving/commit-validation.ts:
//
//   type WrrDocument = {
//     id: string;
//     status: string;
//     flowType: string;
//     vendorPartyId: string;
//   }
//
//   type WrrLine = {
//     id: string;
//     itemId: string | null;
//     itemBarcode: string | null;
//     lotNumber: string;
//     expectedQty: number;
//     scannedQty: number;
//     disposition: 'store' | 'inspect' | null | undefined;
//   }
//
//   type CommitValidationResult =
//     | { ok: true }
//     | { ok: false; errors: string[] }
//
//   validateCommit(wrr: WrrDocument, lines: WrrLine[]): CommitValidationResult

import { describe, expect, it } from "vitest";

const makeWrr = (
  overrides: Partial<{
    id: string;
    status: string;
    flowType: string;
    vendorPartyId: string;
  }> = {}
) => ({
  id: "wrr-uuid-001",
  status: "receiving_in_progress",
  flowType: "vmi",
  vendorPartyId: "party-uuid-001",
  ...overrides,
});

const makeLine = (
  overrides: Partial<{
    id: string;
    itemId: string | null;
    itemBarcode: string | null;
    lotNumber: string;
    expectedQty: number;
    scannedQty: number;
    disposition: "store" | "inspect" | null | undefined;
  }> = {}
) => ({
  id: "line-uuid-001",
  itemId: "item-uuid-001",
  itemBarcode: "BC-ALPHA-001",
  lotNumber: "LOT-2026-001",
  expectedQty: 10,
  scannedQty: 10,
  disposition: "store" as const,
  ...overrides,
});

describe("validateCommit — all valid returns { ok: true } (design.md §9, requirements.md R7.2)", () => {
  it("AC-R7.2: returns { ok: true } when WRR is in-progress, all lines are fully scanned, have resolved items, and valid dispositions", async () => {
    const { validateCommit } = await import(
      "@/lib/receiving/commit-validation"
    );

    const wrr = makeWrr();
    const lines = [makeLine()];

    const result = validateCommit(wrr, lines);

    expect(result.ok).toBe(true);
  });
});

describe("validateCommit — WRR status must be 'receiving_in_progress' (design.md §9, requirements.md R7.2)", () => {
  it("AC-R7.2: returns { ok: false } when wrr.status is 'staged_pending_arrival'", async () => {
    const { validateCommit } = await import(
      "@/lib/receiving/commit-validation"
    );

    const wrr = makeWrr({ status: "staged_pending_arrival" });
    const lines = [makeLine()];

    const result = validateCommit(wrr, lines);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("AC-R7.2: returns { ok: false } when wrr.status is 'confirmed'", async () => {
    const { validateCommit } = await import(
      "@/lib/receiving/commit-validation"
    );

    const wrr = makeWrr({ status: "confirmed" });
    const lines = [makeLine()];

    const result = validateCommit(wrr, lines);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("validateCommit — lines must be non-empty (requirements.md R7.2)", () => {
  it("AC-R7.2: returns { ok: false } when lines array is empty", async () => {
    const { validateCommit } = await import(
      "@/lib/receiving/commit-validation"
    );

    const wrr = makeWrr();

    const result = validateCommit(wrr, []);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("validateCommit — all lines must have a resolved itemId (requirements.md R4.3, R7.2)", () => {
  it("AC-R4.3: returns { ok: false } when a line has itemId = null", async () => {
    const { validateCommit } = await import(
      "@/lib/receiving/commit-validation"
    );

    const wrr = makeWrr();
    const lines = [makeLine({ itemId: null })];

    const result = validateCommit(wrr, lines);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("validateCommit — all lines must be fully scanned (design.md §5.2, requirements.md R3.5)", () => {
  it("AC-R3.5: returns { ok: false } when a line has scannedQty < expectedQty", async () => {
    const { validateCommit } = await import(
      "@/lib/receiving/commit-validation"
    );

    const wrr = makeWrr();
    const lines = [makeLine({ expectedQty: 10, scannedQty: 7 })];

    const result = validateCommit(wrr, lines);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("validateCommit — all lines must have a set disposition (requirements.md R5.1)", () => {
  it("AC-R5.1: returns { ok: false } when a line has disposition = null", async () => {
    const { validateCommit } = await import(
      "@/lib/receiving/commit-validation"
    );

    const wrr = makeWrr();
    const lines = [makeLine({ disposition: null })];

    const result = validateCommit(wrr, lines);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("AC-R5.1: returns { ok: false } when a line has disposition = undefined", async () => {
    const { validateCommit } = await import(
      "@/lib/receiving/commit-validation"
    );

    const wrr = makeWrr();
    const lines = [makeLine({ disposition: undefined })];

    const result = validateCommit(wrr, lines);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("validateCommit — collects ALL errors, not just the first (design.md §9, requirements.md R7.2)", () => {
  it("AC-R7.2: returns multiple error messages when multiple lines have different problems", async () => {
    const { validateCommit } = await import(
      "@/lib/receiving/commit-validation"
    );

    const wrr = makeWrr();
    const lines = [
      // line 1: unresolved item AND under-scanned
      makeLine({
        id: "line-001",
        itemId: null,
        expectedQty: 10,
        scannedQty: 3,
      }),
      // line 2: missing disposition AND under-scanned
      makeLine({
        id: "line-002",
        expectedQty: 8,
        scannedQty: 0,
        disposition: null,
      }),
    ];

    const result = validateCommit(wrr, lines);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Must report more than one error — not fail-fast on the first
    expect(result.errors.length).toBeGreaterThan(1);
  });

  it("AC-R7.2: returned errors array is non-empty and each entry is a non-empty string", async () => {
    const { validateCommit } = await import(
      "@/lib/receiving/commit-validation"
    );

    const wrr = makeWrr({ status: "staged_pending_arrival" });
    const lines = [makeLine({ itemId: null, scannedQty: 0, disposition: null })];

    const result = validateCommit(wrr, lines);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.every((e) => typeof e === "string" && e.length > 0)).toBe(true);
  });
});

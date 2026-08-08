// RED-step unit tests for lib/transfer/inspection-state.ts (does not exist yet).
//
// Traceability:
//   specs/11-transfer-and-inspection/requirements.md R3.1 — system SHALL maintain a single
//     shared inspection record structure used by 07 (inbound) and 11 (transfer).
//   specs/11-transfer-and-inspection/requirements.md R3.4 — transfer-specific non-conformance
//     SHALL block completion or route to an approved exception/resolution path using
//     inspection_dispositions.
//   specs/11-transfer-and-inspection/design.md §6.1 — inbound available dispositions:
//     store, quarantine, return_to_party, hold, write_off.
//   specs/11-transfer-and-inspection/design.md §6.1 — transfer/aging available dispositions:
//     return_to_stock, reject, return_to_origin, hold.
//   specs/11-transfer-and-inspection/design.md §6.3 — failed inspection disposition table with
//     balance effects per context type.
//
// These tests import from @/lib/transfer/inspection-state which does not exist.
// Every test is expected to fail with "Cannot find module" until
// backend-builder creates the implementation.
//
// Expected module contract for lib/transfer/inspection-state.ts:
//   validateInspectionDisposition(inspectionCase: InspectionCase, disposition: DispositionInput)
//     : { ok: true }
//     | { ok: false; errors: string[] }

import { describe, expect, it } from "vitest";

function makeInboundCase(overrides: Partial<{
  id: string;
  status: string;
  contextType: "inbound" | "transfer";
  sourceRefType: "wrr_item" | "transfer_line";
}> = {}) {
  return {
    id: "case-inbound-001",
    status: "open",
    contextType: "inbound" as const,
    sourceRefType: "wrr_item" as const,
    ...overrides,
  };
}

function makeTransferCase(overrides: Partial<{
  id: string;
  status: string;
  contextType: "inbound" | "transfer";
  sourceRefType: "wrr_item" | "transfer_line";
}> = {}) {
  return {
    id: "case-transfer-001",
    status: "open",
    contextType: "transfer" as const,
    sourceRefType: "transfer_line" as const,
    ...overrides,
  };
}

function makeDisposition(overrides: Partial<{
  dispositionType: string;
  quantityAffected: number;
  notes: string | null;
}> = {}) {
  return {
    dispositionType: "store",
    quantityAffected: 5,
    notes: null,
    ...overrides,
  };
}

describe("validateInspectionDisposition — case status not open (requirements.md R3.4, design.md §6.1)", () => {
  it("AC-R3.4: returns { ok: false, errors } when case status is 'passed' (already resolved)", async () => {
    const { validateInspectionDisposition } = await import(
      "@/lib/transfer/inspection-state"
    );

    const closedCase = makeInboundCase({ status: "passed" });
    const result = validateInspectionDisposition(
      closedCase,
      makeDisposition()
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("AC-R3.4: returns { ok: false, errors } when case status is 'failed'", async () => {
    const { validateInspectionDisposition } = await import(
      "@/lib/transfer/inspection-state"
    );

    const closedCase = makeInboundCase({ status: "failed" });
    const result = validateInspectionDisposition(
      closedCase,
      makeDisposition()
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("AC-R3.4: returns { ok: false, errors } when case status is 'cancelled'", async () => {
    const { validateInspectionDisposition } = await import(
      "@/lib/transfer/inspection-state"
    );

    const closedCase = makeInboundCase({ status: "cancelled" });
    const result = validateInspectionDisposition(
      closedCase,
      makeDisposition()
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("validateInspectionDisposition — quantityAffected must be > 0 (design.md §6.3)", () => {
  it("AC-R3.4/§6.3: returns { ok: false, errors } when quantityAffected is 0", async () => {
    const { validateInspectionDisposition } = await import(
      "@/lib/transfer/inspection-state"
    );

    const result = validateInspectionDisposition(
      makeInboundCase(),
      makeDisposition({ quantityAffected: 0 })
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("AC-R3.4/§6.3: returns { ok: false, errors } when quantityAffected is negative", async () => {
    const { validateInspectionDisposition } = await import(
      "@/lib/transfer/inspection-state"
    );

    const result = validateInspectionDisposition(
      makeInboundCase(),
      makeDisposition({ quantityAffected: -2 })
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("validateInspectionDisposition — dispositionType must be one of the eight valid values (design.md §6.3)", () => {
  it("AC-R3.4/§6.3: returns { ok: false, errors } when dispositionType is an unrecognized value", async () => {
    const { validateInspectionDisposition } = await import(
      "@/lib/transfer/inspection-state"
    );

    const result = validateInspectionDisposition(
      makeInboundCase(),
      makeDisposition({ dispositionType: "discard" })
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("AC-R3.4/§6.3: returns { ok: false, errors } when dispositionType is an empty string", async () => {
    const { validateInspectionDisposition } = await import(
      "@/lib/transfer/inspection-state"
    );

    const result = validateInspectionDisposition(
      makeInboundCase(),
      makeDisposition({ dispositionType: "" })
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("validateInspectionDisposition — inbound case rejects transfer-only dispositions (design.md §6.1, §6.3)", () => {
  it("AC-R3.1/§6.1: returns { ok: false, errors } when inbound case uses 'return_to_origin' (transfer-only)", async () => {
    const { validateInspectionDisposition } = await import(
      "@/lib/transfer/inspection-state"
    );

    const result = validateInspectionDisposition(
      makeInboundCase(),
      makeDisposition({ dispositionType: "return_to_origin" })
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("AC-R3.1/§6.1: returns { ok: false, errors } when inbound case uses 'return_to_stock' (transfer-only)", async () => {
    const { validateInspectionDisposition } = await import(
      "@/lib/transfer/inspection-state"
    );

    const result = validateInspectionDisposition(
      makeInboundCase(),
      makeDisposition({ dispositionType: "return_to_stock" })
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("validateInspectionDisposition — transfer case rejects inbound-only dispositions (design.md §6.1, §6.3)", () => {
  it("AC-R3.1/§6.1: returns { ok: false, errors } when transfer case uses 'return_to_party' (inbound-only)", async () => {
    const { validateInspectionDisposition } = await import(
      "@/lib/transfer/inspection-state"
    );

    const result = validateInspectionDisposition(
      makeTransferCase(),
      makeDisposition({ dispositionType: "return_to_party" })
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("validateInspectionDisposition — valid inbound disposition (design.md §6.1)", () => {
  it("AC-R3.1/§6.1: returns { ok: true } for an inbound case with disposition 'store'", async () => {
    const { validateInspectionDisposition } = await import(
      "@/lib/transfer/inspection-state"
    );

    const result = validateInspectionDisposition(
      makeInboundCase(),
      makeDisposition({ dispositionType: "store" })
    );

    expect(result.ok).toBe(true);
  });

  it("AC-R3.1/§6.1: returns { ok: true } for an inbound case with disposition 'quarantine'", async () => {
    const { validateInspectionDisposition } = await import(
      "@/lib/transfer/inspection-state"
    );

    const result = validateInspectionDisposition(
      makeInboundCase(),
      makeDisposition({ dispositionType: "quarantine" })
    );

    expect(result.ok).toBe(true);
  });
});

describe("validateInspectionDisposition — valid transfer disposition (design.md §6.1)", () => {
  it("AC-R3.1/§6.1: returns { ok: true } for a transfer case with disposition 'return_to_stock'", async () => {
    const { validateInspectionDisposition } = await import(
      "@/lib/transfer/inspection-state"
    );

    const result = validateInspectionDisposition(
      makeTransferCase(),
      makeDisposition({ dispositionType: "return_to_stock" })
    );

    expect(result.ok).toBe(true);
  });

  it("AC-R3.1/§6.1: returns { ok: true } for a transfer case with disposition 'return_to_origin'", async () => {
    const { validateInspectionDisposition } = await import(
      "@/lib/transfer/inspection-state"
    );

    const result = validateInspectionDisposition(
      makeTransferCase(),
      makeDisposition({ dispositionType: "return_to_origin" })
    );

    expect(result.ok).toBe(true);
  });
});

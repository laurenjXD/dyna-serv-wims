// RED-step unit tests for lib/transfer/transfer-validator.ts (does not exist yet).
//
// Traceability:
//   specs/11-transfer-and-inspection/requirements.md R1.1 — authorized user SHALL be able
//     to request movement from one active source location to one active destination location.
//   specs/11-transfer-and-inspection/requirements.md R1.2 — request SHALL identify item, lot,
//     flow type, quantity/UOM, source/destination, reason, priority, and inspection requirement.
//   specs/11-transfer-and-inspection/requirements.md R1.3 — source and destination SHALL be
//     distinct and valid; a location cannot be its own transfer destination.
//
// These tests import from @/lib/transfer/transfer-validator which does not exist.
// Every test is expected to fail with "Cannot find module" until
// backend-builder creates the implementation.
//
// Expected module contract for lib/transfer/transfer-validator.ts:
//   validateCreateTransfer(input: unknown)
//     : { ok: true; data: CreateTransferInput }
//     | { ok: false; errors: string[] }

import { describe, expect, it } from "vitest";

const VALID_LINE = {
  lotId: "550e8400-e29b-41d4-a716-446655440001",
  itemId: "550e8400-e29b-41d4-a716-446655440002",
  qtyRequested: 5,
};

const VALID_INPUT = {
  fromLocationId: "550e8400-e29b-41d4-a716-446655440010",
  toLocationId: "550e8400-e29b-41d4-a716-446655440011",
  flowType: "vmi" as const,
  lines: [VALID_LINE],
};

describe("validateCreateTransfer — fromLocationId is required (requirements.md R1.2)", () => {
  it("AC-R1.2: returns { ok: false, errors } when fromLocationId is missing", async () => {
    const { validateCreateTransfer } = await import(
      "@/lib/transfer/transfer-validator"
    );

    const input = { ...VALID_INPUT };
    delete (input as Record<string, unknown>)["fromLocationId"];

    const result = validateCreateTransfer(input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("validateCreateTransfer — toLocationId is required (requirements.md R1.2)", () => {
  it("AC-R1.2: returns { ok: false, errors } when toLocationId is missing", async () => {
    const { validateCreateTransfer } = await import(
      "@/lib/transfer/transfer-validator"
    );

    const input = { ...VALID_INPUT };
    delete (input as Record<string, unknown>)["toLocationId"];

    const result = validateCreateTransfer(input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("validateCreateTransfer — source and destination must be distinct (requirements.md R1.3)", () => {
  it("AC-R1.3: returns { ok: false, errors } when fromLocationId === toLocationId", async () => {
    const { validateCreateTransfer } = await import(
      "@/lib/transfer/transfer-validator"
    );

    const sameId = "550e8400-e29b-41d4-a716-446655440010";
    const result = validateCreateTransfer({
      ...VALID_INPUT,
      fromLocationId: sameId,
      toLocationId: sameId,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("validateCreateTransfer — flowType must be vmi | trading | supplies (requirements.md R1.2)", () => {
  it("AC-R1.2: returns { ok: false, errors } when flowType is an unrecognized value", async () => {
    const { validateCreateTransfer } = await import(
      "@/lib/transfer/transfer-validator"
    );

    const result = validateCreateTransfer({
      ...VALID_INPUT,
      flowType: "consignment",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it.each(["vmi", "trading", "supplies"] as const)(
    "AC-R1.2: accepts flowType '%s'",
    async (flowType) => {
      const { validateCreateTransfer } = await import(
        "@/lib/transfer/transfer-validator"
      );

      const result = validateCreateTransfer({ ...VALID_INPUT, flowType });

      expect(result.ok).toBe(true);
    }
  );
});

describe("validateCreateTransfer — lines must be non-empty (requirements.md R1.2)", () => {
  it("AC-R1.2: returns { ok: false, errors } when lines is an empty array", async () => {
    const { validateCreateTransfer } = await import(
      "@/lib/transfer/transfer-validator"
    );

    const result = validateCreateTransfer({
      ...VALID_INPUT,
      lines: [],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("validateCreateTransfer — line lotId is required (requirements.md R1.2)", () => {
  it("AC-R1.2: returns { ok: false, errors } when a line is missing lotId", async () => {
    const { validateCreateTransfer } = await import(
      "@/lib/transfer/transfer-validator"
    );

    const lineWithoutLot = { ...VALID_LINE };
    delete (lineWithoutLot as Record<string, unknown>)["lotId"];

    const result = validateCreateTransfer({
      ...VALID_INPUT,
      lines: [lineWithoutLot],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("validateCreateTransfer — line qtyRequested must be > 0 (requirements.md R1.2)", () => {
  it("AC-R1.2: returns { ok: false, errors } when a line has qtyRequested of 0", async () => {
    const { validateCreateTransfer } = await import(
      "@/lib/transfer/transfer-validator"
    );

    const result = validateCreateTransfer({
      ...VALID_INPUT,
      lines: [{ ...VALID_LINE, qtyRequested: 0 }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("AC-R1.2: returns { ok: false, errors } when a line has a negative qtyRequested", async () => {
    const { validateCreateTransfer } = await import(
      "@/lib/transfer/transfer-validator"
    );

    const result = validateCreateTransfer({
      ...VALID_INPUT,
      lines: [{ ...VALID_LINE, qtyRequested: -3 }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("validateCreateTransfer — line itemId is required (requirements.md R1.2)", () => {
  it("AC-R1.2: returns { ok: false, errors } when a line is missing itemId", async () => {
    const { validateCreateTransfer } = await import(
      "@/lib/transfer/transfer-validator"
    );

    const lineWithoutItem = { ...VALID_LINE };
    delete (lineWithoutItem as Record<string, unknown>)["itemId"];

    const result = validateCreateTransfer({
      ...VALID_INPUT,
      lines: [lineWithoutItem],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("validateCreateTransfer — valid minimal input succeeds (requirements.md R1.1)", () => {
  it("AC-R1.1: returns { ok: true, data } for a valid single-line transfer with all required fields", async () => {
    const { validateCreateTransfer } = await import(
      "@/lib/transfer/transfer-validator"
    );

    const result = validateCreateTransfer(VALID_INPUT);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toBeDefined();
    expect(result.data.fromLocationId).toBe(VALID_INPUT.fromLocationId);
    expect(result.data.toLocationId).toBe(VALID_INPUT.toLocationId);
    expect(result.data.flowType).toBe(VALID_INPUT.flowType);
    expect(result.data.lines).toHaveLength(1);
  });
});

describe("validateCreateTransfer — all errors collected (not fail-fast) (requirements.md R1.2, R1.3)", () => {
  it("AC-R1.2/R1.3: collects multiple errors in a single pass rather than stopping at the first failure", async () => {
    const { validateCreateTransfer } = await import(
      "@/lib/transfer/transfer-validator"
    );

    // fromLocationId missing, lines empty, flowType invalid — three distinct failure classes
    const result = validateCreateTransfer({
      toLocationId: "550e8400-e29b-41d4-a716-446655440011",
      flowType: "bad_type",
      lines: [],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Must surface more than one error to prove non-fail-fast collection
    expect(result.errors.length).toBeGreaterThan(1);
  });
});

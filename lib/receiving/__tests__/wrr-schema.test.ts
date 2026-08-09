// RED-step unit tests for lib/receiving/wrr-schema.ts (does not exist yet).
//
// Traceability:
//   specs/07-incoming-receiving/design.md §5.1 — Expected line fields: item_id,
//     lot_number (NOT NULL, single canonical identifier), expected_qty, unit_cbm,
//     disposition ('store' | 'inspect'). disposition defaults to 'store' (§7.1).
//   specs/07-incoming-receiving/design.md §5.2 — Scan-line state: under-scanned,
//     over-scanned, matched; expected_qty > 0 invariant.
//   specs/07-incoming-receiving/requirements.md R1.1 — authorized back-office user
//     creates a WRR from CIPL/packing-list reference.
//   specs/07-incoming-receiving/requirements.md R1.2 — WRR captures vendorPartyId
//     (source party), flowType, and commercialInvoiceNo reference.
//   specs/07-incoming-receiving/requirements.md R1.3 — each expected line SHALL
//     identify item, lot_number, expected_qty, UOM, unit_cbm, and disposition.
//   specs/07-incoming-receiving/requirements.md R5.1 — each WRR line SHALL carry
//     a disposition value of 'store' or 'inspect'.
//
// These tests import from @/lib/receiving/wrr-schema which does not exist.
// Every test is expected to fail with "Cannot find module" until
// backend-builder creates the implementation.
//
// Expected module contract for lib/receiving/wrr-schema.ts:
//   validateCreateWrr(input: unknown)
//     : { ok: true; data: ValidatedCreateWrr }
//     | { ok: false; error: string; fieldErrors?: Record<string, string[]> }

import { describe, expect, it } from "vitest";

const VALID_LINE = {
  lotNumber: "LOT-2026-001",
  expectedQty: 10,
  unitCbm: 0.5,
  disposition: "store" as const,
  putawayLocationId: "location-storage-uuid",
};

const VALID_CREATE_WRR = {
  vendorPartyId: "550e8400-e29b-41d4-a716-446655440000",
  flowType: "vmi" as const,
  commercialInvoiceNo: "INV-2026-00123",
  lines: [VALID_LINE],
};

describe("validateCreateWrr — valid minimal input succeeds (design.md §5.1, requirements.md R1.2)", () => {
  it("AC-R1.2/R1.3: returns { ok: true, data } for a valid single-line WRR with all required fields", async () => {
    const { validateCreateWrr } = await import("@/lib/receiving/wrr-schema");

    const result = validateCreateWrr(VALID_CREATE_WRR);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toBeDefined();
  });
});

describe("validateCreateWrr — vendorPartyId is required (requirements.md R1.2)", () => {
  it("AC-R1.2: returns { ok: false } when vendorPartyId is missing", async () => {
    const { validateCreateWrr } = await import("@/lib/receiving/wrr-schema");

    const input = { ...VALID_CREATE_WRR };
    delete (input as Record<string, unknown>)["vendorPartyId"];

    const result = validateCreateWrr(input);

    expect(result.ok).toBe(false);
  });
});

describe("validateCreateWrr — flowType must be one of vmi | trading | supplies (requirements.md R1.2)", () => {
  it("AC-R1.2: returns { ok: false } when flowType is an unrecognized value", async () => {
    const { validateCreateWrr } = await import("@/lib/receiving/wrr-schema");

    const result = validateCreateWrr({
      ...VALID_CREATE_WRR,
      flowType: "consignment",
    });

    expect(result.ok).toBe(false);
  });

  it("AC-R1.2: returns { ok: false } when flowType is an empty string", async () => {
    const { validateCreateWrr } = await import("@/lib/receiving/wrr-schema");

    const result = validateCreateWrr({
      ...VALID_CREATE_WRR,
      flowType: "",
    });

    expect(result.ok).toBe(false);
  });

  it.each(["vmi", "trading", "supplies"] as const)(
    "AC-R1.2: accepts flowType '%s'",
    async (flowType) => {
      const { validateCreateWrr } = await import("@/lib/receiving/wrr-schema");

      const result = validateCreateWrr({ ...VALID_CREATE_WRR, flowType });

      expect(result.ok).toBe(true);
    }
  );
});

describe("validateCreateWrr — commercialInvoiceNo must be a non-empty string (requirements.md R1.2)", () => {
  it("AC-R1.2: returns { ok: false } when commercialInvoiceNo is an empty string", async () => {
    const { validateCreateWrr } = await import("@/lib/receiving/wrr-schema");

    const result = validateCreateWrr({
      ...VALID_CREATE_WRR,
      commercialInvoiceNo: "",
    });

    expect(result.ok).toBe(false);
  });
});

describe("validateCreateWrr — lines array must be non-empty (requirements.md R1.3)", () => {
  it("AC-R1.3: returns { ok: false } when lines is an empty array", async () => {
    const { validateCreateWrr } = await import("@/lib/receiving/wrr-schema");

    const result = validateCreateWrr({
      ...VALID_CREATE_WRR,
      lines: [],
    });

    expect(result.ok).toBe(false);
  });
});

describe("validateCreateWrr — line lotNumber is required (design.md §5.1, requirements.md R1.3)", () => {
  it("AC-R1.3: returns { ok: false } when a line is missing lotNumber", async () => {
    const { validateCreateWrr } = await import("@/lib/receiving/wrr-schema");

    const lineWithoutLot = { ...VALID_LINE };
    delete (lineWithoutLot as Record<string, unknown>)["lotNumber"];

    const result = validateCreateWrr({
      ...VALID_CREATE_WRR,
      lines: [lineWithoutLot],
    });

    expect(result.ok).toBe(false);
  });
});

describe("validateCreateWrr — line expectedQty must be > 0 (design.md §5.2, requirements.md R1.3)", () => {
  it("AC-R1.3: returns { ok: false } when a line has expectedQty of 0", async () => {
    const { validateCreateWrr } = await import("@/lib/receiving/wrr-schema");

    const result = validateCreateWrr({
      ...VALID_CREATE_WRR,
      lines: [{ ...VALID_LINE, expectedQty: 0 }],
    });

    expect(result.ok).toBe(false);
  });

  it("AC-R1.3: returns { ok: false } when a line has a negative expectedQty", async () => {
    const { validateCreateWrr } = await import("@/lib/receiving/wrr-schema");

    const result = validateCreateWrr({
      ...VALID_CREATE_WRR,
      lines: [{ ...VALID_LINE, expectedQty: -5 }],
    });

    expect(result.ok).toBe(false);
  });
});

describe("validateCreateWrr — line unitCbm must be > 0 (design.md §5.1)", () => {
  it("AC-R1.3: returns { ok: false } when a line has unitCbm of 0", async () => {
    const { validateCreateWrr } = await import("@/lib/receiving/wrr-schema");

    const result = validateCreateWrr({
      ...VALID_CREATE_WRR,
      lines: [{ ...VALID_LINE, unitCbm: 0 }],
    });

    expect(result.ok).toBe(false);
  });

  it("AC-R1.3: returns { ok: false } when a line has a negative unitCbm", async () => {
    const { validateCreateWrr } = await import("@/lib/receiving/wrr-schema");

    const result = validateCreateWrr({
      ...VALID_CREATE_WRR,
      lines: [{ ...VALID_LINE, unitCbm: -0.1 }],
    });

    expect(result.ok).toBe(false);
  });
});

describe("validateCreateWrr — line disposition must be 'store' or 'inspect' (requirements.md R5.1, design.md §5.1)", () => {
  it("AC-R5.1: returns { ok: false } when a line disposition is an invalid value", async () => {
    const { validateCreateWrr } = await import("@/lib/receiving/wrr-schema");

    const result = validateCreateWrr({
      ...VALID_CREATE_WRR,
      lines: [{ ...VALID_LINE, disposition: "quarantine" }],
    });

    expect(result.ok).toBe(false);
  });

  it("AC-R5.1: accepts disposition 'inspect'", async () => {
    const { validateCreateWrr } = await import("@/lib/receiving/wrr-schema");

    const result = validateCreateWrr({
      ...VALID_CREATE_WRR,
      lines: [{ ...VALID_LINE, disposition: "inspect" }],
    });

    expect(result.ok).toBe(true);
  });
});

describe("validateCreateWrr — disposition defaults to 'store' when omitted from a line (design.md §7.1)", () => {
  it("AC-R5.1/§7.1: returns { ok: true } and sets disposition to 'store' when line omits it", async () => {
    const { validateCreateWrr } = await import("@/lib/receiving/wrr-schema");

    const lineWithoutDisposition = { ...VALID_LINE };
    delete (lineWithoutDisposition as Record<string, unknown>)["disposition"];

    const result = validateCreateWrr({
      ...VALID_CREATE_WRR,
      lines: [lineWithoutDisposition],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.lines[0].disposition).toBe("store");
  });
});

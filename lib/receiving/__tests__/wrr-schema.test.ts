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

// --- 2026-08-10 reversal: putawayLocationId is no longer required at
// WRR-creation time for `store`-disposition lines ---
//
// specs/07-incoming-receiving/design.md §5.1 ("Putaway location" row,
//   "Reversed 2026-08-10 (supersedes the 2026-08-09 Product Owner decision
//   — see specs/00-steering/revision-log.md)"): "No longer required, set, or
//   even meaningfully choosable at WRR-creation time... `store`-disposition
//   lines carry `putaway_location_id = NULL` from WRR creation through the
//   start of receiving."
// specs/07-incoming-receiving/requirements.md R1.4 (amended 2026-08-10,
//   "supersedes the 2026-08-09 amendment of this clause"): "a
//   `store`-disposition line SHALL NOT be required to carry a
//   `putaway_location_id` at WRR creation or staging time... `putaway_location_id`
//   is instead populated per line at scan/store time, per R3.8/R7.9."
//
// The current implementation (lib/receiving/wrr-schema.ts validateLine,
// lines 161-167) still pushes a validation error when a `store`-disposition
// line lacks `putawayLocationId`. Test (a) below is expected to FAIL against
// that current code — that is the point of this RED step.
//
// Ambiguity note: design.md §5.1 says a store line "carries
// putaway_location_id = NULL... from WRR creation through the start of
// receiving," which could be read as either (i) creation-time input
// providing a value should be rejected outright, or (ii) creation-time input
// simply isn't required and a caller-supplied value is not an error (e.g.
// because the field is simply not required/consulted this early, not because
// providing it is itself illegal). Per this task's instruction to prefer the
// more conservative reading when the doc doesn't unambiguously say "reject,"
// test (b) below asserts the caller-supplied-value case is NOT rejected as a
// validation error (i.e. `ok: true`), not that it is rejected.
describe("validateCreateWrr — putawayLocationId is no longer required for store-disposition lines at creation time (design.md §5.1 'Reversed 2026-08-10', requirements.md R1.4 amended 2026-08-10)", () => {
  it("AC-R1.4: returns { ok: true } for a store-disposition line that OMITS putawayLocationId at creation time", async () => {
    const { validateCreateWrr } = await import("@/lib/receiving/wrr-schema");

    const storeLineWithoutLocation = { ...VALID_LINE, disposition: "store" as const };
    delete (storeLineWithoutLocation as Record<string, unknown>)["putawayLocationId"];

    const result = validateCreateWrr({
      ...VALID_CREATE_WRR,
      lines: [storeLineWithoutLocation],
    });

    // This is the RED assertion: the current implementation still requires
    // putawayLocationId for store disposition and will return { ok: false }.
    expect(result.ok).toBe(true);
  });

  it("AC-R1.4: returns { ok: true } for a store-disposition line that explicitly sets putawayLocationId to null at creation time", async () => {
    const { validateCreateWrr } = await import("@/lib/receiving/wrr-schema");

    const result = validateCreateWrr({
      ...VALID_CREATE_WRR,
      lines: [{ ...VALID_LINE, disposition: "store" as const, putawayLocationId: null }],
    });

    expect(result.ok).toBe(true);
  });

  it("AC-R1.4 (conservative reading, see ambiguity note above): does NOT reject a store-disposition line that mistakenly supplies a putawayLocationId at creation time — it is simply not required or consulted this early, not treated as an error", async () => {
    const { validateCreateWrr } = await import("@/lib/receiving/wrr-schema");

    const result = validateCreateWrr({
      ...VALID_CREATE_WRR,
      lines: [
        {
          ...VALID_LINE,
          disposition: "store" as const,
          putawayLocationId: "location-storage-uuid",
        },
      ],
    });

    expect(result.ok).toBe(true);
  });
});

// RED-step unit tests for lib/receiving/inspection-validator.ts (does not exist yet).
//
// Traceability:
//   specs/07-incoming-receiving/requirements.md R5a.2 — A conformant quantity continues
//     through `store` or `inspect`. A non-conformant quantity SHALL receive exactly one
//     immediate disposition: `on_hold` or `reject`.
//   specs/07-incoming-receiving/requirements.md R5a.3 — `on_hold` SHALL remain non-available
//     pending final disposition and SHALL require a controlled reason and mandatory remarks
//     before save.
//   specs/07-incoming-receiving/requirements.md R5a.4 — `reject` SHALL route the exact
//     quantity to a designated rejects `location`, then create an auditable RTV workflow
//     linked to the WRR line, lot_number, quantity, reason, remarks, actor, and timestamps.
//   specs/07-incoming-receiving/requirements.md R6.3 — A non-conformance result SHALL
//     require an approved reason, remarks where required, and evidence attachment where
//     required by the final design.
//   specs/07-incoming-receiving/requirements.md R6.4 — Non-conformance reasons SHALL use
//     the approved enum/reference, including TDC defect, quantity mismatch, damaged carton,
//     wrong item code, missing paperwork, and other where retained by core design.
//   specs/07-incoming-receiving/requirements.md §5 AC — "Visual receiving inspection records
//     exact conformant/on_hold/reject quantities; on_hold has mandatory remarks/reason, and
//     reject routes to a designated rejects location and RTV workflow."
//
// These tests import from @/lib/receiving/inspection-validator which does not exist.
// Every test is expected to fail with "Cannot find module" until
// backend-builder creates the implementation.
//
// Expected module contract for lib/receiving/inspection-validator.ts:
//
//   type NonConformanceReason =
//     | 'tdc_defect'
//     | 'quantity_mismatch'
//     | 'damaged_carton'
//     | 'wrong_item_code'
//     | 'missing_paperwork'
//     | 'other'
//
//   type InspectionRecordInput = {
//     disposition: 'pass' | 'on_hold' | 'reject';
//     reason?: string;               // required when disposition is 'on_hold'
//     rejectLocationId?: string;     // required when disposition is 'reject'
//     nonConformanceReason?: NonConformanceReason;
//     // nonConformanceReason required when disposition is 'on_hold' or 'reject'
//   }
//
//   type InspectionValidationResult =
//     | { ok: true }
//     | { ok: false; errors: string[] }
//
//   validateInspectionRecord(input: InspectionRecordInput): InspectionValidationResult

import { describe, expect, it } from "vitest";

describe("validateInspectionRecord — pass disposition with no extras (requirements.md R5a.2)", () => {
  it("AC-R5a.2: returns { ok: true } for disposition 'pass' with no additional fields", async () => {
    const { validateInspectionRecord } = await import(
      "@/lib/receiving/inspection-validator"
    );

    const result = validateInspectionRecord({ disposition: "pass" });

    expect(result.ok).toBe(true);
  });
});

describe("validateInspectionRecord — on_hold with required fields passes (requirements.md R5a.3, R6.4)", () => {
  it("AC-R5a.3/R6.4: returns { ok: true } for on_hold with reason and nonConformanceReason", async () => {
    const { validateInspectionRecord } = await import(
      "@/lib/receiving/inspection-validator"
    );

    const result = validateInspectionRecord({
      disposition: "on_hold",
      reason: "Suspected moisture damage on outer packaging",
      nonConformanceReason: "damaged_carton",
    });

    expect(result.ok).toBe(true);
  });
});

describe("validateInspectionRecord — on_hold missing reason (requirements.md R5a.3)", () => {
  it("AC-R5a.3: returns { ok: false } with error 'reason required for on_hold' when reason is absent", async () => {
    const { validateInspectionRecord } = await import(
      "@/lib/receiving/inspection-validator"
    );

    const result = validateInspectionRecord({
      disposition: "on_hold",
      nonConformanceReason: "damaged_carton",
      // reason intentionally omitted
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain("reason required for on_hold");
  });
});

describe("validateInspectionRecord — on_hold missing nonConformanceReason (requirements.md R6.3, R6.4)", () => {
  it("AC-R6.4: returns { ok: false } with error about nonConformanceReason when it is absent for on_hold", async () => {
    const { validateInspectionRecord } = await import(
      "@/lib/receiving/inspection-validator"
    );

    const result = validateInspectionRecord({
      disposition: "on_hold",
      reason: "Suspected moisture damage",
      // nonConformanceReason intentionally omitted
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain(
      "nonConformanceReason required for on_hold or reject"
    );
  });
});

describe("validateInspectionRecord — reject with required fields passes (requirements.md R5a.4, R6.4)", () => {
  it("AC-R5a.4/R6.4: returns { ok: true } for reject with rejectLocationId and nonConformanceReason", async () => {
    const { validateInspectionRecord } = await import(
      "@/lib/receiving/inspection-validator"
    );

    const result = validateInspectionRecord({
      disposition: "reject",
      rejectLocationId: "loc-uuid-rejects-001",
      nonConformanceReason: "wrong_item_code",
    });

    expect(result.ok).toBe(true);
  });
});

describe("validateInspectionRecord — reject missing rejectLocationId (requirements.md R5a.4)", () => {
  it("AC-R5a.4: returns { ok: false } with error 'rejectLocationId required for reject' when absent", async () => {
    const { validateInspectionRecord } = await import(
      "@/lib/receiving/inspection-validator"
    );

    const result = validateInspectionRecord({
      disposition: "reject",
      nonConformanceReason: "quantity_mismatch",
      // rejectLocationId intentionally omitted
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain("rejectLocationId required for reject");
  });
});

describe("validateInspectionRecord — invalid nonConformanceReason value (requirements.md R6.4)", () => {
  it("AC-R6.4: returns { ok: false } with error 'invalid nonConformanceReason' when an unrecognized value is supplied", async () => {
    const { validateInspectionRecord } = await import(
      "@/lib/receiving/inspection-validator"
    );

    const result = validateInspectionRecord({
      disposition: "on_hold",
      reason: "Something wrong",
      nonConformanceReason: "bad_enum_value" as never,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain("invalid nonConformanceReason");
  });
});

describe("validateInspectionRecord — multiple errors returned at once (requirements.md R5a.3, R6.4)", () => {
  it("AC-R5a.3/R6.4: returns all errors simultaneously when on_hold is missing both reason and nonConformanceReason", async () => {
    const { validateInspectionRecord } = await import(
      "@/lib/receiving/inspection-validator"
    );

    const result = validateInspectionRecord({
      disposition: "on_hold",
      // both reason and nonConformanceReason intentionally omitted
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Must surface both errors in one response — not stop at the first
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
    expect(result.errors).toContain("reason required for on_hold");
    expect(result.errors).toContain(
      "nonConformanceReason required for on_hold or reject"
    );
  });
});

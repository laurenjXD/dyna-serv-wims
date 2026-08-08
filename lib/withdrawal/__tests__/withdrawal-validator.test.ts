// RED-step unit tests for lib/withdrawal/withdrawal-validator.ts (does not exist yet).
//
// Traceability:
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/requirements.md
//     R1.1 — authorized user SHALL be able to initiate pick-list generation
//             for a destination, flow_type, and one or more item quantities
//     R1.2 — pick-list generation command SHALL validate active item
//             references, permitted party/flow scope, UOM, quantity, and
//             approved document metadata
//     R2.5 — system SHALL reject non-positive, over-available,
//             incompatible-UOM, and invalid-flow quantities with actionable errors
//     R5.1 — commitment SHALL be an explicit, authorized online server command
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/design.md
//     §6 — Stage 1 commitment transaction input validation
//
// Acceptance criteria covered (requirements.md §5):
//   "VMI/Trading SPQ rules and Supplies piece rules are enforced server-side."
//   "Stage 1 commitment reserves stock without decrementing inventory and
//    creates exactly one operational pick_list." (validation precondition)
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/withdrawal/withdrawal-validator.ts (for backend-builder):
//
//   export type ValidatedWithdrawalLine = {
//     itemId: string;
//     lotId: string;
//     locationId: string;
//     qty: number;
//   };
//
//   export type ValidatedWithdrawal = {
//     partyId: string;
//     flowType: 'vmi' | 'trading' | 'supplies';
//     lines: ValidatedWithdrawalLine[];
//     idempotencyKey?: string;
//   };
//
//   export type WithdrawalValidationResult =
//     | { ok: true; data: ValidatedWithdrawal }
//     | { ok: false; errors: string[] };
//
//   // Parses and validates raw unknown input.
//   // Returns { ok: true, data } on success or { ok: false, errors } on failure.
//   export function validateWithdrawal(input: unknown): WithdrawalValidationResult;
//
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { validateWithdrawal } from "../withdrawal-validator";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function validWithdrawalInput() {
  return {
    partyId: "party-uuid-customer",
    flowType: "trading",
    lines: [
      {
        itemId: "item-uuid-1",
        lotId: "lot-uuid-1",
        locationId: "loc-uuid-1",
        qty: 10,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Valid input (R1.1, R1.2, design.md §6)
// ---------------------------------------------------------------------------

describe("validateWithdrawal — valid input (R1.1, R1.2, design.md §6)", () => {
  it("(AC: valid input returns ok: true with parsed data) returns { ok: true, data } with all fields for a complete valid input", () => {
    const result = validateWithdrawal(validWithdrawalInput());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.partyId).toBe("party-uuid-customer");
      expect(result.data.flowType).toBe("trading");
      expect(result.data.lines).toHaveLength(1);
      expect(result.data.lines[0].itemId).toBe("item-uuid-1");
      expect(result.data.lines[0].lotId).toBe("lot-uuid-1");
      expect(result.data.lines[0].locationId).toBe("loc-uuid-1");
      expect(result.data.lines[0].qty).toBe(10);
    }
  });

  it("(AC: vmi flowType accepted) accepts flowType = 'vmi'", () => {
    const result = validateWithdrawal({
      ...validWithdrawalInput(),
      flowType: "vmi",
    });

    expect(result.ok).toBe(true);
  });

  it("(AC: supplies flowType accepted) accepts flowType = 'supplies'", () => {
    const result = validateWithdrawal({
      ...validWithdrawalInput(),
      flowType: "supplies",
    });

    expect(result.ok).toBe(true);
  });

  it("(AC: multiple lines accepted) accepts multiple lines in a single withdrawal", () => {
    const result = validateWithdrawal({
      ...validWithdrawalInput(),
      lines: [
        { itemId: "item-1", lotId: "lot-1", locationId: "loc-1", qty: 5 },
        { itemId: "item-2", lotId: "lot-2", locationId: "loc-2", qty: 15 },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.lines).toHaveLength(2);
    }
  });

  it("(AC: optional idempotencyKey accepted) accepts an optional idempotencyKey field without error", () => {
    const result = validateWithdrawal({
      ...validWithdrawalInput(),
      idempotencyKey: "idem-key-abc-123",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.idempotencyKey).toBe("idem-key-abc-123");
    }
  });
});

// ---------------------------------------------------------------------------
// Missing partyId (R1.2, design.md §6)
// ---------------------------------------------------------------------------

describe("validateWithdrawal — missing partyId (R1.2, design.md §6)", () => {
  it("(AC: missing partyId returns error) returns { ok: false, errors } when partyId is absent", () => {
    const { partyId: _removed, ...inputWithoutParty } = validWithdrawalInput();

    const result = validateWithdrawal(inputWithoutParty);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("(AC: empty partyId returns error) returns { ok: false, errors } when partyId is an empty string", () => {
    const result = validateWithdrawal({
      ...validWithdrawalInput(),
      partyId: "",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Missing or empty lines (R1.1, R2.5, design.md §6)
// ---------------------------------------------------------------------------

describe("validateWithdrawal — missing or empty lines (R1.1, R2.5, design.md §6)", () => {
  it("(AC: missing lines returns error) returns { ok: false, errors } when lines is absent", () => {
    const { lines: _removed, ...inputWithoutLines } = validWithdrawalInput();

    const result = validateWithdrawal(inputWithoutLines);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("(AC: empty lines array returns error) returns { ok: false, errors } when lines is an empty array", () => {
    const result = validateWithdrawal({
      ...validWithdrawalInput(),
      lines: [],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Line with qty <= 0 (R2.5, design.md §6)
// ---------------------------------------------------------------------------

describe("validateWithdrawal — non-positive line qty (R2.5, design.md §6)", () => {
  it("(AC: zero qty returns error) returns { ok: false, errors } when a line has qty = 0", () => {
    const result = validateWithdrawal({
      ...validWithdrawalInput(),
      lines: [{ itemId: "item-1", lotId: "lot-1", locationId: "loc-1", qty: 0 }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("(AC: negative qty returns error) returns { ok: false, errors } when a line has qty < 0", () => {
    const result = validateWithdrawal({
      ...validWithdrawalInput(),
      lines: [{ itemId: "item-1", lotId: "lot-1", locationId: "loc-1", qty: -5 }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Line with missing itemId (R1.2, design.md §6)
// ---------------------------------------------------------------------------

describe("validateWithdrawal — missing line itemId (R1.2, design.md §6)", () => {
  it("(AC: missing itemId on line returns error) returns { ok: false, errors } when a line is missing itemId", () => {
    const result = validateWithdrawal({
      ...validWithdrawalInput(),
      lines: [
        {
          // no itemId
          lotId: "lot-1",
          locationId: "loc-1",
          qty: 10,
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("(AC: missing lotId on line returns error) returns { ok: false, errors } when a line is missing lotId", () => {
    const result = validateWithdrawal({
      ...validWithdrawalInput(),
      lines: [
        {
          itemId: "item-1",
          // no lotId
          locationId: "loc-1",
          qty: 10,
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("(AC: missing locationId on line returns error) returns { ok: false, errors } when a line is missing locationId", () => {
    const result = validateWithdrawal({
      ...validWithdrawalInput(),
      lines: [
        {
          itemId: "item-1",
          lotId: "lot-1",
          // no locationId
          qty: 10,
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Invalid flowType (R1.2, design.md §6)
// ---------------------------------------------------------------------------

describe("validateWithdrawal — invalid flowType (R1.2, design.md §6)", () => {
  it("(AC: unknown flowType returns error) returns { ok: false, errors } when flowType is not one of vmi/trading/supplies", () => {
    const result = validateWithdrawal({
      ...validWithdrawalInput(),
      flowType: "unknown_flow",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("(AC: missing flowType returns error) returns { ok: false, errors } when flowType is absent", () => {
    const { flowType: _removed, ...inputWithoutFlow } = validWithdrawalInput();

    const result = validateWithdrawal(inputWithoutFlow);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("(AC: numeric flowType returns error) returns { ok: false, errors } when flowType is a number", () => {
    const result = validateWithdrawal({
      ...validWithdrawalInput(),
      flowType: 42,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Non-object / null / undefined input (design.md §6)
// ---------------------------------------------------------------------------

describe("validateWithdrawal — malformed top-level input (design.md §6)", () => {
  it("(AC: null input returns error) returns { ok: false, errors } when input is null", () => {
    const result = validateWithdrawal(null);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("(AC: string input returns error) returns { ok: false, errors } when input is a bare string", () => {
    const result = validateWithdrawal("not-an-object");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });
});

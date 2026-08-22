// RED-step tests for lib/billing/vmi-period-number.ts (does not exist yet —
// Task D.7, from-scratch module).
//
// Traceability:
//   specs/12-vmi-billing/tasks.md Task Group D, D.7 — "Implement
//     period-number generation — Format VMI-{YYYY}-{MM}-{PARTY_CODE}
//     (corrections: -R{N}). Verify uniqueness before insert."
//   specs/12-vmi-billing/design.md §3 — "VMI-{YYYY}-{MM}-{PARTY_CODE} /
//     VMI-{YYYY}-{MM}-{PARTY_CODE}-R{N} ← correction revision, N starting at
//     1."
//   specs/12-vmi-billing/design.md §2.7 (Corrections) — "3. Re-run §2.6 for
//     the same party/month, producing a new period record with
//     period_number suffixed '-R{n}'." Notably, §2.7 does NOT say the
//     correction flow itself computes n — this is the ambiguity this task
//     resolves; see the DESIGN DECISION note below.
//   specs/12-vmi-billing/requirements.md FR-9.2 — "A correction voids the
//     original period record and issues a new one with an incremented
//     revision suffix" — the acceptance criterion this module's correction
//     path exists to satisfy (period-number format/uniqueness is the
//     concrete, testable mechanism FR-9.2's "incremented revision suffix"
//     cashes out to).
//   specs/12-vmi-billing/tasks.md Task Group G, G.9 — "Correct an issued
//     period | Original status = 'voided'; new period -R1;
//     superseded_by_period_id set." "Two corrections on the same period |
//     Second produces -R2." These are this module's own two central
//     regression cases.
//
// Acceptance criterion under test (requirements.md FR-9.2, design.md §3/§2.7,
// tasks.md D.7/G.9): a normal period gets
// 'VMI-{YYYY}-{MM}-{PARTY_CODE}'; a correction of that period gets the SAME
// base number suffixed '-R{N}', N starting at 1 and incrementing per
// correction of the SAME original period — verified against the DB's actual
// existing vmi_billing_periods rows for that base period, not trusted to an
// externally-supplied counter, and never colliding with `period_number`'s
// DB-level UNIQUE constraint (lib/db/schema/vmi_billing.ts).
//
// ---------------------------------------------------------------------------
// DESIGN DECISION (documented here per this task's explicit instruction to
// decide and record the exact input contract before writing the test):
//
//   Chosen contract: generateVmiPeriodNumber(db, request) is DB-FACING and
//   determines the next correction number N ITSELF, by querying existing
//   vmi_billing_periods.period_number rows that share the same base
//   ('VMI-{YYYY}-{MM}-{PARTY_CODE}') — it does NOT accept a correction
//   number as a caller-supplied input parameter.
//
//   Why, over the alternative (caller passes N in): design.md §2.7's
//   correction-flow sketch (D.11, not yet built) re-runs the ENTIRE §2.6
//   close algorithm for the same party/month on a correction — it does not
//   separately track or pass forward "which correction number is this."
//   Making D.11's caller respons­ible for computing N would duplicate the
//   exact "count/derive from existing rows" logic this module already needs
//   internally for its OTHER stated job — "verify uniqueness before insert"
//   (tasks.md D.7's own second sentence) — since verifying uniqueness
//   against period_number's real UNIQUE constraint requires reading existing
//   rows for that base period regardless. Deriving N from that same read,
//   rather than trusting a second, independently-computed caller-supplied
//   N, makes a caller/generator N-mismatch (e.g. off-by-one from a stale
//   read) structurally impossible: there is exactly one place N is decided,
//   and it's the same query that performs the uniqueness check. This
//   mirrors vmi-daily-balance-backfill.ts's C.6 precedent of resolving
//   state (existing ledger rows) from the DB itself rather than trusting a
//   caller's belief about what already exists.
//
//   Uniqueness enforcement: the DB-facing function derives N as
//   (highest existing '-R{n}' suffix for this base period) + 1 — never a
//   plain COUNT(*) (which would be fragile if a correction row were ever
//   deleted, even though design.md states corrections are never deleted) —
//   and then defensively re-checks the exact candidate string isn't already
//   present among the fetched rows before returning it. This makes a
//   collision structurally near-impossible under this module's own control
//   flow, but the module still performs an explicit DB read + check (not a
//   database-level uniqueness guarantee alone, since two concurrent close
//   requests reading stale state could theoretically race) — matching
//   "verify uniqueness before insert," not "assume construction prevents
//   collision entirely." The actual DB UNIQUE constraint on period_number
//   (already migrated, B.6) remains the final backstop against a race.
//
// ---------------------------------------------------------------------------
// SCHEMA/DEPENDENCY VERIFICATION PERFORMED BEFORE WRITING THIS FILE:
//
//   lib/db/schema/vmi_billing.ts: vmiBillingPeriods.periodNumber
//     (varchar(50), NOT NULL, UNIQUE — confirmed real column name and
//     constraint by reading the schema file directly, not the design doc's
//     prose alone). No partyId/year/month composite key exists on this
//     table for period-number purposes — periodNumber itself is the sole
//     unique identifier this module must generate correctly.
//
//   lib/db/schema/parties.ts: parties.code (varchar(50), NOT NULL, UNIQUE)
//     — the {PARTY_CODE} component. This module accepts partyCode as a
//     plain string input (already resolved by the caller from the parties
//     table), not a partyId it re-resolves itself — mirrors every other
//     lib/billing/*.ts module's "caller supplies already-typed scope
//     values" convention (e.g. vmi-charge-aggregation's
//     VmiChargeAggregationScope.partyId, never a party lookup inside the
//     billing module itself).
//
//   lib/billing/vmi-charge-aggregation.ts / vmi-recurring-fee-aggregation.ts
//     (already implemented) — mirrored for module shape: pure format/derive
//     functions, plus a thin `db`-injected DB-facing orchestration function.
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/billing/vmi-period-number.ts (for
// backend-builder), established by this RED step:
//
//   export type VmiPeriodNumberRequest = {
//     partyCode: string;
//     year: number;  // e.g. 2026
//     month: number; // 1-12
//     isCorrection?: boolean; // default false
//   };
//
//   // Pure. 'VMI-{YYYY}-{MM}-{PARTY_CODE}', month zero-padded to 2 digits.
//   export function formatVmiPeriodNumber(
//     partyCode: string, year: number, month: number,
//   ): string;
//
//   // Pure. '{basePeriodNumber}-R{correctionN}'.
//   export function formatVmiCorrectionPeriodNumber(
//     basePeriodNumber: string, correctionN: number,
//   ): string;
//
//   // Pure. Given the base period number and the full list of ALREADY
//   // EXISTING period_number strings for that base (any shape — base,
//   // -R1, -R2, or unrelated), returns the next correction number: 1 if no
//   // correction exists yet for this base, else (highest existing -R{n}) + 1.
//   export function nextVmiCorrectionNumber(
//     existingPeriodNumbers: string[], basePeriodNumber: string,
//   ): number;
//
//   // DB-facing, thin orchestration layer:
//   //   1. basePeriodNumber = formatVmiPeriodNumber(partyCode, year, month).
//   //   2. db.select(...).from(vmiBillingPeriods)
//   //      .where(like(vmiBillingPeriods.periodNumber, `${basePeriodNumber}%`))
//   //      -> every existing period_number sharing this base (the base row
//   //      itself, if present, and every '-R{n}' correction of it).
//   //   3. If !isCorrection: throws if basePeriodNumber is already among the
//   //      fetched rows (collision — normally prevented upstream by D.8's
//   //      "no existing non-voided period for party/month" check, but this
//   //      module performs its own belt-and-suspenders check per D.7's
//   //      "verify uniqueness before insert"); otherwise returns
//   //      basePeriodNumber.
//   //   4. If isCorrection: correctionN = nextVmiCorrectionNumber(fetched,
//   //      basePeriodNumber); candidate = formatVmiCorrectionPeriodNumber(
//   //      basePeriodNumber, correctionN); throws if candidate is somehow
//   //      already among the fetched rows (defensive); otherwise returns
//   //      candidate.
//   export type VmiPeriodNumberDbLike = { select: (...args: any[]) => any };
//   export async function generateVmiPeriodNumber(
//     db: VmiPeriodNumberDbLike,
//     request: VmiPeriodNumberRequest,
//   ): Promise<string>;
//
// ---------------------------------------------------------------------------

import { describe, expect, it, vi } from "vitest";
import {
  formatVmiPeriodNumber,
  formatVmiCorrectionPeriodNumber,
  nextVmiCorrectionNumber,
  generateVmiPeriodNumber,
  type VmiPeriodNumberRequest,
} from "../vmi-period-number";
import { vmiBillingPeriods } from "@/lib/db/schema/vmi_billing";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const PARTY_CODE = "ACME01";
const YEAR = 2026;
const MONTH = 6; // June — the canonical fixture month, per design.md §3's own example
const BASE_PERIOD_NUMBER = "VMI-2026-06-ACME01";

function baseRequest(overrides: Partial<VmiPeriodNumberRequest> = {}): VmiPeriodNumberRequest {
  return {
    partyCode: PARTY_CODE,
    year: YEAR,
    month: MONTH,
    ...overrides,
  };
}

// Minimal chainable mock query builder — same call-order-based pattern as
// every other lib/billing/*.ts test file's makeChain.
function makeChain(rows: unknown[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  for (const method of ["from", "where", "orderBy", "limit"]) {
    chain[method] = vi.fn(() => chain);
  }
  const resolved = Promise.resolve(rows);
  chain.then = resolved.then.bind(resolved);
  chain.catch = resolved.catch.bind(resolved);
  chain.finally = resolved.finally.bind(resolved);
  return chain;
}

function createMockDb() {
  return { select: vi.fn() };
}

// ---------------------------------------------------------------------------
// formatVmiPeriodNumber — pure format layer (design.md §3).
// ---------------------------------------------------------------------------

describe("formatVmiPeriodNumber (D.7, pure format)", () => {
  it(
    "(AC: design.md §3 'VMI-{YYYY}-{MM}-{PARTY_CODE}') formats a normal " +
      "period number for a given party/year/month, zero-padding a " +
      "single-digit month to two digits",
    () => {
      expect(formatVmiPeriodNumber(PARTY_CODE, YEAR, MONTH)).toBe(BASE_PERIOD_NUMBER);
      expect(formatVmiPeriodNumber(PARTY_CODE, 2026, 1)).toBe("VMI-2026-01-ACME01");
      expect(formatVmiPeriodNumber(PARTY_CODE, 2026, 12)).toBe("VMI-2026-12-ACME01");
    },
  );

  it("uses the party code exactly as given, uppercased/lowercased or not, without altering it", () => {
    expect(formatVmiPeriodNumber("lc-code", 2026, 6)).toBe("VMI-2026-06-lc-code");
  });
});

// ---------------------------------------------------------------------------
// formatVmiCorrectionPeriodNumber / nextVmiCorrectionNumber — pure
// correction-suffix layer (design.md §3, §2.7).
// ---------------------------------------------------------------------------

describe("formatVmiCorrectionPeriodNumber (D.7, pure format)", () => {
  it("(AC: design.md §3 '-R{N}, N starting at 1') appends -R{N} to the base period number", () => {
    expect(formatVmiCorrectionPeriodNumber(BASE_PERIOD_NUMBER, 1)).toBe(
      "VMI-2026-06-ACME01-R1",
    );
    expect(formatVmiCorrectionPeriodNumber(BASE_PERIOD_NUMBER, 2)).toBe(
      "VMI-2026-06-ACME01-R2",
    );
  });
});

describe("nextVmiCorrectionNumber (D.7, pure derive)", () => {
  it("(AC: design.md §3 'N starting at 1') returns 1 when no correction exists yet for this base period", () => {
    expect(nextVmiCorrectionNumber([BASE_PERIOD_NUMBER], BASE_PERIOD_NUMBER)).toBe(1);
    expect(nextVmiCorrectionNumber([], BASE_PERIOD_NUMBER)).toBe(1);
  });

  it(
    "(AC: G.9 'Two corrections on the same period | Second produces -R2') " +
      "returns 2 when exactly one correction (-R1) already exists for this " +
      "base period",
    () => {
      expect(
        nextVmiCorrectionNumber([BASE_PERIOD_NUMBER, "VMI-2026-06-ACME01-R1"], BASE_PERIOD_NUMBER),
      ).toBe(2);
    },
  );

  it("ignores unrelated period numbers (different party/month) when deriving the next correction number", () => {
    expect(
      nextVmiCorrectionNumber(
        [
          BASE_PERIOD_NUMBER,
          "VMI-2026-06-OTHERCO-R1", // different party — must not affect this base
          "VMI-2026-07-ACME01-R1", // different month — must not affect this base
        ],
        BASE_PERIOD_NUMBER,
      ),
    ).toBe(1);
  });

  it(
    "derives from the highest existing -R{n} suffix, not a plain count " +
      "(robust even against a gap, e.g. -R1 and -R3 present but not -R2)",
    () => {
      expect(
        nextVmiCorrectionNumber(
          [BASE_PERIOD_NUMBER, "VMI-2026-06-ACME01-R1", "VMI-2026-06-ACME01-R3"],
          BASE_PERIOD_NUMBER,
        ),
      ).toBe(4);
    },
  );
});

// ---------------------------------------------------------------------------
// generateVmiPeriodNumber — DB-facing orchestration.
// ---------------------------------------------------------------------------

describe("generateVmiPeriodNumber (D.7, DB-facing orchestration)", () => {
  it(
    "(AC: design.md §3 normal period number format) returns the base " +
      "'VMI-{YYYY}-{MM}-{PARTY_CODE}' number for a normal (non-correction) " +
      "period when no existing row for this base is found",
    async () => {
      const db = createMockDb();
      db.select.mockImplementationOnce(() => makeChain([]));

      const result = await generateVmiPeriodNumber(db as never, baseRequest());

      expect(result).toBe(BASE_PERIOD_NUMBER);
    },
  );

  it(
    "(AC: tasks.md D.7 'verify uniqueness before insert') rejects when a " +
      "normal (non-correction) request's base period number already exists " +
      "in the DB — a real collision this module must catch before the " +
      "caller ever attempts the INSERT that would otherwise violate " +
      "period_number's UNIQUE constraint",
    async () => {
      const db = createMockDb();
      db.select.mockImplementationOnce(() => makeChain([{ periodNumber: BASE_PERIOD_NUMBER }]));

      await expect(
        generateVmiPeriodNumber(db as never, baseRequest({ isCorrection: false })),
      ).rejects.toThrow();
    },
  );

  it(
    "(AC: G.9 'Correct an issued period | ... new period -R1') a " +
      "correction request against a base period with no existing " +
      "correction yet produces '-R1'",
    async () => {
      const db = createMockDb();
      db.select.mockImplementationOnce(() => makeChain([{ periodNumber: BASE_PERIOD_NUMBER }]));

      const result = await generateVmiPeriodNumber(
        db as never,
        baseRequest({ isCorrection: true }),
      );

      expect(result).toBe("VMI-2026-06-ACME01-R1");
    },
  );

  it(
    "(AC: G.9 'Two corrections on the same period | Second produces -R2') " +
      "a SECOND correction of the same original period — verified against " +
      "existing vmi_billing_periods rows for that same base period, " +
      "including the already-existing -R1 row — produces '-R2'",
    async () => {
      const db = createMockDb();
      db.select.mockImplementationOnce(() =>
        makeChain([
          { periodNumber: BASE_PERIOD_NUMBER },
          { periodNumber: "VMI-2026-06-ACME01-R1" },
        ]),
      );

      const result = await generateVmiPeriodNumber(
        db as never,
        baseRequest({ isCorrection: true }),
      );

      expect(result).toBe("VMI-2026-06-ACME01-R2");
    },
  );

  it("queries the vmi_billing_periods table (not some other table) via db.select(...).from(...)", async () => {
    const db = createMockDb();
    const fromCalls: unknown[] = [];

    db.select.mockImplementation(() => {
      const chain = makeChain([]);
      const originalFrom = chain.from;
      chain.from = vi.fn((table: unknown) => {
        fromCalls.push(table);
        return originalFrom(table);
      });
      return chain;
    });

    await generateVmiPeriodNumber(db as never, baseRequest());

    expect(fromCalls).toContain(vmiBillingPeriods);
  });

  it(
    "(AC: belt-and-suspenders — different party's/month's existing rows " +
      "must never influence this base period's generated number) a " +
      "correction request still produces '-R1' even when unrelated " +
      "period_number rows for a different party are present in the fetched " +
      "result set",
    async () => {
      const db = createMockDb();
      db.select.mockImplementationOnce(() =>
        makeChain([
          { periodNumber: BASE_PERIOD_NUMBER },
          { periodNumber: "VMI-2026-06-OTHERCO-R1" }, // different party — must not bump this base's N
        ]),
      );

      const result = await generateVmiPeriodNumber(
        db as never,
        baseRequest({ isCorrection: true }),
      );

      expect(result).toBe("VMI-2026-06-ACME01-R1");
    },
  );
});

// RED-step tests for lib/billing/vmi-recurring-fee-aggregation.ts (does not
// exist yet — Task D.4, from-scratch module).
//
// Traceability:
//   specs/12-vmi-billing/tasks.md Task Group D, D.4 — "Implement
//     recurring-fee aggregation — Sums active vmi_recurring_fee_lines, with
//     manpower requiring an hours-logged entry for the period, sourced from
//     the new vmi_manpower_hours_log table (B.12) — hours ×
//     manpower_rate_per_hour, converted to USD; $0/omitted when no matching
//     row exists for the period (matching the real June statement's
//     treatment, never an error)."
//   specs/12-vmi-billing/design.md §2.5 — the exact algorithm under test:
//       "recurring_fees_usd = SUM(vmi_recurring_fee_lines.flat_amount_usd
//         WHERE is_active AND fee_type != 'manpower')
//                    + (manpower_hours_logged_this_period ×
//                       manpower_rate_per_hour converted to USD, or 0 if no
//                       hours logged this period)"
//   specs/12-vmi-billing/design.md §1.2a — vmi_manpower_hours_log:
//     "No hours logged for a period is the normal, expected case (per the
//     real June fixture — $0 that month), not an error; §2.5's aggregation
//     reads this as '0 if no row exists,' never blocking period close."
//   specs/12-vmi-billing/design.md §1.2 — vmi_recurring_fee_lines column
//     comments: "LOA only: links to the permit whose monthly_fee_usd this
//     fee line mirrors" — descriptive of how flat_amount_usd is KEPT IN SYNC
//     (by whoever edits the fee line / E.4's future UI), not an instruction
//     for this aggregation function to itself join vmi_permits. §2.5's
//     literal formula reads flat_amount_usd directly off
//     vmi_recurring_fee_lines with no vmi_permits reference anywhere in the
//     pseudocode. requirements.md FR-5.2 ("A recurring fee tied to a
//     vmi_permits row ... inherits its amount from
//     vmi_permits.monthly_fee_usd") describes the SAME sync invariant, not a
//     runtime join performed at aggregation time. CONCLUSION (per the task's
//     explicit instruction to check design.md before guessing): this
//     aggregation function does NOT need to read/join vmi_permits at all —
//     flat_amount_usd is simply already correct by the time this function
//     runs. The test below ("LOA fee mirrors vmi_permits.monthly_fee_usd")
//     proves this by constructing a LOA fee line with relatedPermitId set
//     and flatAmountUsd already populated, and asserting the correct
//     contribution WITHOUT ever passing any vmi_permits data into the
//     function — there is no such parameter in this module's contract.
//   specs/12-vmi-billing/requirements.md FR-5 — "Each active
//     vmi_recurring_fee_lines row contributes its configured flat amount to
//     the period's Billing Statement, except Manpower, which is
//     hours_logged × rate_per_hour (rate stored in its native currency, e.g.
//     PHP) and requires an explicit hours entry per period — it contributes
//     $0/omits from the statement when no hours are logged, matching the
//     real June statement's treatment." / "A recurring fee tied to a
//     vmi_permits row (i.e. the LOA fee) inherits its amount from
//     vmi_permits.monthly_fee_usd."
//   specs/12-vmi-billing/tasks.md Task Group G, G.6 — "Four fee types active
//     (LOA, surety bond, trucking admin, manpower with 0 hours) | June
//     fixture: $36.00 + $0.00 + $200.00 + $0.00 contribute correctly;
//     manpower with 0 hours logged contributes $0" / "LOA fee linked to a
//     vmi_permits row | flat_amount_usd mirrors vmi_permits.monthly_fee_usd"
//     / "Manpower with hours logged | hours × rate_per_hour, converted to
//     USD."
//
// Acceptance criterion under test (requirements.md FR-5, design.md §2.5,
// tasks.md D.4/G.6): every active, party-scoped vmi_recurring_fee_lines row
// contributes flat_amount_usd to the period total EXCEPT manpower, which
// looks up the matching vmi_manpower_hours_log row for
// (recurring_fee_line_id, period_start_date, period_end_date), contributing
// hours × manpower_rate_per_hour converted to USD (or $0, never an error,
// when no matching hours row exists).
//
// ---------------------------------------------------------------------------
// SCHEMA/DEPENDENCY VERIFICATION PERFORMED BEFORE WRITING THIS FILE:
//
//   lib/db/schema/vmi_billing.ts:
//     vmiRecurringFeeLines: id, partyId, feeType (vmi_recurring_fee_type
//       enum: 'loa' | 'surety_bond' | 'trucking_admin_fee' | 'manpower' |
//       'other'), isActive (boolean, default true), flatAmountUsd (decimal,
//       nullable — "used for loa/surety_bond/trucking_admin_fee/other"),
//       manpowerRatePerHour (decimal, nullable — "Manpower only ... NULL for
//       non-manpower fee types"), manpowerCurrency (varchar(3), nullable),
//       relatedPermitId (uuid, nullable, FK to vmiPermits — "LOA only").
//     vmiManpowerHoursLog (added B.12, design.md §1.2a): id,
//       recurringFeeLineId (FK to vmiRecurringFeeLines), partyId,
//       periodStartDate (date), periodEndDate (date), hours (decimal),
//       notes, recordedByUserId, createdAt. Unique on
//       (recurringFeeLineId, periodStartDate, periodEndDate) — exact-period
//       match, not an overlap/range query.
//
//   lib/billing/vmi-charge-aggregation.ts (Task D.3, most recent sibling
//     aggregation module) and lib/billing/vmi-handling.ts (Task D.1) —
//     mirrored for module shape/style: a pure compute function over
//     already-typed rows, plus a thin `db`-injected DB-facing orchestration
//     function (VmiXDbLike = { select: (...args: any[]) => any }),
//     decimal-string raw rows mapped to numbers before the pure layer runs.
//     vmi-handling.ts specifically established the precedent for a
//     DB-facing function issuing TWO separate `db.select()` queries (ledger
//     rows + contract-term versions) before calling into one pure compute
//     function — this module's DB-facing function mirrors that shape with
//     vmi_recurring_fee_lines + vmi_manpower_hours_log as its two sources.
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/billing/vmi-recurring-fee-aggregation.ts
// (for backend-builder), established by this RED step:
//
//   export type VmiRecurringFeeLineForAggregation = {
//     id: string;
//     partyId: string;
//     feeType: string; // trusted string, not narrowed to the DB enum
//     isActive: boolean;
//     flatAmountUsd: number | null; // non-manpower types
//     manpowerRatePerHour: number | null; // manpower only
//     manpowerCurrency: string | null; // manpower only, e.g. 'PHP'
//   };
//
//   export type VmiManpowerHoursLogEntryForAggregation = {
//     recurringFeeLineId: string;
//     periodStartDate: string; // 'YYYY-MM-DD'
//     periodEndDate: string;   // 'YYYY-MM-DD'
//     hours: number;
//   };
//
//   export type VmiRecurringFeeAggregationScope = {
//     partyId: string;
//     periodStartDate: string;
//     periodEndDate: string;
//     lockedExchangeRatePhp: number;
//   };
//
//   export type VmiRecurringFeeLineContribution = {
//     recurringFeeLineId: string;
//     feeType: string;
//     amountUsd: number;
//   };
//
//   export type VmiRecurringFeeAggregationResult = {
//     recurringFeesUsd: number;
//     lines: VmiRecurringFeeLineContribution[]; // one entry per active,
//       party-scoped fee line — INCLUDES $0 manpower lines with no hours
//       logged (design.md §1.2a: "never blocking period close", never
//       silently dropped from the shape).
//   };
//
//   // Pure. Filters feeLines to (isActive) AND (partyId match) BEFORE
//   // summing. For fee_type != 'manpower': contributes flatAmountUsd (or 0
//   // if null). For fee_type = 'manpower': looks up the matching
//   // hoursLogEntries row by (recurringFeeLineId, periodStartDate,
//   // periodEndDate) EXACT match; hours × manpowerRatePerHour, converted to
//   // USD via scope.lockedExchangeRatePhp when manpowerCurrency != 'USD';
//   // contributes 0 (not an error) when no matching row exists.
//   export function computeVmiRecurringFeeAggregation(
//     feeLines: VmiRecurringFeeLineForAggregation[],
//     hoursLogEntries: VmiManpowerHoursLogEntryForAggregation[],
//     scope: VmiRecurringFeeAggregationScope,
//   ): VmiRecurringFeeAggregationResult;
//
//   // DB-facing, thin orchestration layer:
//   //   1. db.select(...).from(vmiRecurringFeeLines).where(partyId match)
//   //      -> raw fee-line rows.
//   //   2. db.select(...).from(vmiManpowerHoursLog).where(partyId match)
//   //      -> raw hours-log rows.
//   //   3. Map decimal-string amounts -> numbers.
//   //   4. computeVmiRecurringFeeAggregation(mappedFeeLines, mappedHours, scope).
//   //   Never queries vmi_permits (see the traceability note above).
//   export type VmiRecurringFeeAggregationDbLike = { select: (...args: any[]) => any };
//   export async function getVmiRecurringFeeAggregationForPeriod(
//     db: VmiRecurringFeeAggregationDbLike,
//     scope: VmiRecurringFeeAggregationScope,
//   ): Promise<VmiRecurringFeeAggregationResult>;
//
// ---------------------------------------------------------------------------

import { describe, expect, it, vi } from "vitest";
import {
  computeVmiRecurringFeeAggregation,
  getVmiRecurringFeeAggregationForPeriod,
  type VmiRecurringFeeLineForAggregation,
  type VmiManpowerHoursLogEntryForAggregation,
  type VmiRecurringFeeAggregationScope,
} from "../vmi-recurring-fee-aggregation";
import { vmiRecurringFeeLines, vmiManpowerHoursLog } from "@/lib/db/schema/vmi_billing";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const PARTY_A = "party-a";
const PARTY_B = "party-b";

function baseScope(
  overrides: Partial<VmiRecurringFeeAggregationScope> = {},
): VmiRecurringFeeAggregationScope {
  return {
    partyId: PARTY_A,
    periodStartDate: "2026-06-01",
    periodEndDate: "2026-06-30",
    lockedExchangeRatePhp: 61.71,
    ...overrides,
  };
}

function feeLine(
  overrides: Partial<VmiRecurringFeeLineForAggregation> = {},
): VmiRecurringFeeLineForAggregation {
  return {
    id: "fee-line-1",
    partyId: PARTY_A,
    feeType: "other",
    isActive: true,
    flatAmountUsd: 100,
    manpowerRatePerHour: null,
    manpowerCurrency: null,
    ...overrides,
  };
}

function hoursLogEntry(
  overrides: Partial<VmiManpowerHoursLogEntryForAggregation> = {},
): VmiManpowerHoursLogEntryForAggregation {
  return {
    recurringFeeLineId: "fee-line-1",
    periodStartDate: "2026-06-01",
    periodEndDate: "2026-06-30",
    hours: 10,
    ...overrides,
  };
}

// Raw DB row shapes (decimal columns serialize as strings) — mirrors
// vmi-charge-aggregation.test.ts's rawChargeLineRow()/vmi-handling.test.ts's
// precedent exactly.
function rawFeeLineRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "fee-line-1",
    partyId: PARTY_A,
    feeType: "other",
    isActive: true,
    flatAmountUsd: "100.0000",
    manpowerRatePerHour: null,
    manpowerCurrency: null,
    ...overrides,
  };
}

function rawHoursLogRow(overrides: Record<string, unknown> = {}) {
  return {
    recurringFeeLineId: "fee-line-1",
    periodStartDate: "2026-06-01",
    periodEndDate: "2026-06-30",
    hours: "10.00",
    ...overrides,
  };
}

// Minimal chainable mock query builder — same call-order-based pattern as
// vmi-handling.test.ts's / vmi-charge-aggregation.test.ts's makeChain.
function makeChain(rows: unknown[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  for (const method of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit"]) {
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
// computeVmiRecurringFeeAggregation — pure filter + sum layer.
// ---------------------------------------------------------------------------

describe("computeVmiRecurringFeeAggregation (D.4, pure filter+sum)", () => {
  // -------------------------------------------------------------------
  // 1. Flat fee types (design.md §2.5 / FR-5.1).
  // -------------------------------------------------------------------
  describe("flat fee types (AC: design.md §2.5 / requirements.md FR-5.1)", () => {
    it("sums flat_amount_usd for every active, non-manpower fee line (loa, surety_bond, trucking_admin_fee, other)", () => {
      const result = computeVmiRecurringFeeAggregation(
        [
          feeLine({ id: "loa-1", feeType: "loa", flatAmountUsd: 36 }),
          feeLine({ id: "surety-1", feeType: "surety_bond", flatAmountUsd: 50 }),
          feeLine({ id: "trucking-1", feeType: "trucking_admin_fee", flatAmountUsd: 200 }),
          feeLine({ id: "other-1", feeType: "other", flatAmountUsd: 14 }),
        ],
        [],
        baseScope(),
      );

      // 36 + 50 + 200 + 14 = 300 — manpower's separate hours-based rule
      // never applies to these types.
      expect(result.recurringFeesUsd).toBeCloseTo(300, 4);
    });

    it("includes one contribution entry per active flat fee line in the returned lines array", () => {
      const result = computeVmiRecurringFeeAggregation(
        [
          feeLine({ id: "loa-1", feeType: "loa", flatAmountUsd: 36 }),
          feeLine({ id: "surety-1", feeType: "surety_bond", flatAmountUsd: 50 }),
        ],
        [],
        baseScope(),
      );

      expect(result.lines).toEqual(
        expect.arrayContaining([
          { recurringFeeLineId: "loa-1", feeType: "loa", amountUsd: 36 },
          { recurringFeeLineId: "surety-1", feeType: "surety_bond", amountUsd: 50 },
        ]),
      );
    });
  });

  // -------------------------------------------------------------------
  // 2. Inactive fee lines excluded.
  // -------------------------------------------------------------------
  describe("inactive fee lines excluded (AC: design.md §2.5's 'WHERE is_active')", () => {
    it("an is_active = false row of any type never contributes, regardless of fee_type", () => {
      const result = computeVmiRecurringFeeAggregation(
        [
          feeLine({ id: "loa-1", feeType: "loa", flatAmountUsd: 36, isActive: false }),
          feeLine({
            id: "manpower-1",
            feeType: "manpower",
            flatAmountUsd: null,
            manpowerRatePerHour: 500,
            manpowerCurrency: "PHP",
            isActive: false,
          }),
          feeLine({ id: "trucking-1", feeType: "trucking_admin_fee", flatAmountUsd: 200, isActive: true }),
        ],
        [hoursLogEntry({ recurringFeeLineId: "manpower-1", hours: 10 })],
        baseScope(),
      );

      // Only the active trucking_admin_fee row contributes — both the
      // inactive LOA row AND the inactive manpower row (which otherwise has
      // a real matching hours entry) are excluded entirely.
      expect(result.recurringFeesUsd).toBeCloseTo(200, 4);
    });
  });

  // -------------------------------------------------------------------
  // 3/4. Manpower — hours logged vs. no hours logged.
  // -------------------------------------------------------------------
  describe("manpower fee type (AC: design.md §2.5 / requirements.md FR-5.1)", () => {
    it("(no hours logged) contributes $0, not an error, for a period with no matching vmi_manpower_hours_log row", () => {
      expect(() =>
        computeVmiRecurringFeeAggregation(
          [
            feeLine({
              id: "manpower-1",
              feeType: "manpower",
              flatAmountUsd: null,
              manpowerRatePerHour: 500,
              manpowerCurrency: "PHP",
            }),
          ],
          [], // no hours log entries at all
          baseScope(),
        ),
      ).not.toThrow();

      const result = computeVmiRecurringFeeAggregation(
        [
          feeLine({
            id: "manpower-1",
            feeType: "manpower",
            flatAmountUsd: null,
            manpowerRatePerHour: 500,
            manpowerCurrency: "PHP",
          }),
        ],
        [],
        baseScope(),
      );

      expect(result.recurringFeesUsd).toBe(0);
    });

    it("(no hours logged) still includes the manpower line in the returned lines array with amountUsd = 0, matching the design.md §1.2a shape rule (not silently excluded)", () => {
      const result = computeVmiRecurringFeeAggregation(
        [
          feeLine({
            id: "manpower-1",
            feeType: "manpower",
            flatAmountUsd: null,
            manpowerRatePerHour: 500,
            manpowerCurrency: "PHP",
          }),
        ],
        [],
        baseScope(),
      );

      expect(result.lines).toContainEqual({
        recurringFeeLineId: "manpower-1",
        feeType: "manpower",
        amountUsd: 0,
      });
    });

    it("(hours logged, different period) does not match — an hours-log row for a different period_start/end_date still contributes $0", () => {
      const result = computeVmiRecurringFeeAggregation(
        [
          feeLine({
            id: "manpower-1",
            feeType: "manpower",
            flatAmountUsd: null,
            manpowerRatePerHour: 500,
            manpowerCurrency: "PHP",
          }),
        ],
        [
          hoursLogEntry({
            recurringFeeLineId: "manpower-1",
            periodStartDate: "2026-05-01",
            periodEndDate: "2026-05-31",
            hours: 20,
          }),
        ],
        baseScope({ periodStartDate: "2026-06-01", periodEndDate: "2026-06-30" }),
      );

      expect(result.recurringFeesUsd).toBe(0);
    });

    it(
      "(AC: real hours logged, THE PROMPT'S REGRESSION CASE) 10 hours × ₱500/hour, " +
        "converted at the period's locked FX rate, matches hours × rate_per_hour " +
        "converted to USD exactly",
      () => {
        const hours = 10;
        const ratePerHour = 500;
        const lockedExchangeRatePhp = 61.71;
        const expectedUsd = (hours * ratePerHour) / lockedExchangeRatePhp;

        const result = computeVmiRecurringFeeAggregation(
          [
            feeLine({
              id: "manpower-1",
              feeType: "manpower",
              flatAmountUsd: null,
              manpowerRatePerHour: ratePerHour,
              manpowerCurrency: "PHP",
            }),
          ],
          [hoursLogEntry({ recurringFeeLineId: "manpower-1", hours })],
          baseScope({ lockedExchangeRatePhp }),
        );

        expect(result.recurringFeesUsd).toBeCloseTo(expectedUsd, 6);
        expect(result.lines).toContainEqual({
          recurringFeeLineId: "manpower-1",
          feeType: "manpower",
          amountUsd: expect.closeTo(expectedUsd, 6),
        });
      },
    );

    it("manpower stored in USD (manpowerCurrency = 'USD') is NOT divided by the FX rate — straight hours × rate", () => {
      const result = computeVmiRecurringFeeAggregation(
        [
          feeLine({
            id: "manpower-usd-1",
            feeType: "manpower",
            flatAmountUsd: null,
            manpowerRatePerHour: 25,
            manpowerCurrency: "USD",
          }),
        ],
        [hoursLogEntry({ recurringFeeLineId: "manpower-usd-1", hours: 8 })],
        baseScope({ lockedExchangeRatePhp: 61.71 }),
      );

      // 8 × 25 = 200 USD, no FX division applied.
      expect(result.recurringFeesUsd).toBeCloseTo(200, 4);
    });
  });

  // -------------------------------------------------------------------
  // 5. THE REAL JUNE FIXTURE REGRESSION CASE (tasks.md G.6's exact pass
  //    condition) + the LOA-permit-link case.
  // -------------------------------------------------------------------
  describe(
    "THE REAL JUNE FIXTURE REGRESSION CASE (AC: tasks.md G.6 — " +
      "'Four fee types active (LOA, surety bond, trucking admin, manpower " +
      "with 0 hours) | June fixture: $36.00 + $0.00 + $200.00 + $0.00 " +
      "contribute correctly; manpower with 0 hours logged contributes $0')",
    () => {
      it("reproduces $36.00 (LOA) + $0.00 (surety bond) + $200.00 (trucking admin) + $0.00 (manpower, 0 hours logged) = $236.00 exactly", () => {
        const result = computeVmiRecurringFeeAggregation(
          [
            feeLine({ id: "loa-1", feeType: "loa", flatAmountUsd: 36 }),
            feeLine({ id: "surety-1", feeType: "surety_bond", flatAmountUsd: 0 }),
            feeLine({ id: "trucking-1", feeType: "trucking_admin_fee", flatAmountUsd: 200 }),
            feeLine({
              id: "manpower-1",
              feeType: "manpower",
              flatAmountUsd: null,
              manpowerRatePerHour: 500,
              manpowerCurrency: "PHP",
            }),
          ],
          [], // no manpower hours logged this period — the real June statement's treatment
          baseScope(),
        );

        expect(result.recurringFeesUsd).toBeCloseTo(236.0, 2);
      });

      it(
        "(AC: LOA fee linked to a vmi_permits row — flat_amount_usd mirrors " +
          "vmi_permits.monthly_fee_usd) a LOA-type row with a related_permit_id " +
          "set contributes its already-synced flat_amount_usd directly, with NO " +
          "vmi_permits data ever passed into this function — proving the " +
          "aggregation function itself does not need to join vmi_permits " +
          "(design.md §1.2/§2.5: flat_amount_usd is kept in sync by whoever " +
          "edits the fee line, not read fresh from vmi_permits at aggregation time)",
        () => {
          const result = computeVmiRecurringFeeAggregation(
            [
              feeLine({
                id: "loa-1",
                feeType: "loa",
                flatAmountUsd: 36, // already mirrors vmi_permits.monthly_fee_usd = 36.00
                // relatedPermitId is intentionally NOT part of this module's
                // type contract — see the traceability note at the top of
                // this file. This test proves the correct $36.00
                // contribution requires nothing beyond flat_amount_usd
                // itself.
              }),
            ],
            [],
            baseScope(),
          );

          expect(result.recurringFeesUsd).toBeCloseTo(36.0, 2);
        },
      );
    },
  );

  // -------------------------------------------------------------------
  // 6. Party scoping.
  // -------------------------------------------------------------------
  describe("party scoping (AC: the implicit party scope every VMI billing table carries)", () => {
    it("excludes fee lines belonging to a different party from the total and from the lines array", () => {
      const result = computeVmiRecurringFeeAggregation(
        [
          feeLine({ id: "loa-a", partyId: PARTY_A, feeType: "loa", flatAmountUsd: 36 }),
          feeLine({ id: "loa-b", partyId: PARTY_B, feeType: "loa", flatAmountUsd: 9999 }),
          feeLine({
            id: "manpower-b",
            partyId: PARTY_B,
            feeType: "manpower",
            flatAmountUsd: null,
            manpowerRatePerHour: 500,
            manpowerCurrency: "PHP",
          }),
        ],
        [hoursLogEntry({ recurringFeeLineId: "manpower-b", hours: 999 })],
        baseScope({ partyId: PARTY_A }),
      );

      expect(result.recurringFeesUsd).toBeCloseTo(36, 4);
      expect(result.lines.map((line) => line.recurringFeeLineId)).toEqual(["loa-a"]);
    });
  });

  // -------------------------------------------------------------------
  // 7. Empty inputs.
  // -------------------------------------------------------------------
  describe("empty inputs (AC: zero fee lines produces zero aggregate, not an error)", () => {
    it("returns a zero recurringFeesUsd and an empty lines array for no fee lines, without throwing", () => {
      expect(() => computeVmiRecurringFeeAggregation([], [], baseScope())).not.toThrow();

      const result = computeVmiRecurringFeeAggregation([], [], baseScope());
      expect(result.recurringFeesUsd).toBe(0);
      expect(result.lines).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// getVmiRecurringFeeAggregationForPeriod — DB-facing orchestration.
// ---------------------------------------------------------------------------

describe("getVmiRecurringFeeAggregationForPeriod (D.4, DB-facing orchestration)", () => {
  it(
    "(AC: end-to-end wiring) queries vmi_recurring_fee_lines and " +
      "vmi_manpower_hours_log and returns the correctly computed period " +
      "aggregate, reproducing the real June fixture's $236.00 total via the " +
      "full DB-facing path",
    async () => {
      const db = createMockDb();

      db.select
        .mockImplementationOnce(() =>
          makeChain([
            rawFeeLineRow({ id: "loa-1", feeType: "loa", flatAmountUsd: "36.0000" }),
            rawFeeLineRow({ id: "surety-1", feeType: "surety_bond", flatAmountUsd: "0.0000" }),
            rawFeeLineRow({ id: "trucking-1", feeType: "trucking_admin_fee", flatAmountUsd: "200.0000" }),
            rawFeeLineRow({
              id: "manpower-1",
              feeType: "manpower",
              flatAmountUsd: null,
              manpowerRatePerHour: "500.00",
              manpowerCurrency: "PHP",
            }),
          ]),
        )
        .mockImplementationOnce(() => makeChain([])); // no manpower hours logged this period

      const result = await getVmiRecurringFeeAggregationForPeriod(db as never, baseScope());

      expect(result.recurringFeesUsd).toBeCloseTo(236.0, 2);
    },
  );

  it("queries both vmi_recurring_fee_lines and vmi_manpower_hours_log via db.select(...).from(...)", async () => {
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

    await getVmiRecurringFeeAggregationForPeriod(db as never, baseScope());

    expect(fromCalls).toContain(vmiRecurringFeeLines);
    expect(fromCalls).toContain(vmiManpowerHoursLog);
  });

  it(
    "(AC: real hours logged, via the full DB-facing path) 10 hours × ₱500/hour " +
      "converted at the period's locked FX rate reproduces the same figure as " +
      "the pure-layer test",
    async () => {
      const db = createMockDb();
      const lockedExchangeRatePhp = 61.71;
      const expectedUsd = (10 * 500) / lockedExchangeRatePhp;

      db.select
        .mockImplementationOnce(() =>
          makeChain([
            rawFeeLineRow({
              id: "manpower-1",
              feeType: "manpower",
              flatAmountUsd: null,
              manpowerRatePerHour: "500.00",
              manpowerCurrency: "PHP",
            }),
          ]),
        )
        .mockImplementationOnce(() =>
          makeChain([rawHoursLogRow({ recurringFeeLineId: "manpower-1", hours: "10.00" })]),
        );

      const result = await getVmiRecurringFeeAggregationForPeriod(
        db as never,
        baseScope({ lockedExchangeRatePhp }),
      );

      expect(result.recurringFeesUsd).toBeCloseTo(expectedUsd, 6);
    },
  );

  it("returns a zero aggregate when both queries return zero rows", async () => {
    const db = createMockDb();
    db.select.mockImplementationOnce(() => makeChain([])).mockImplementationOnce(() => makeChain([]));

    const result = await getVmiRecurringFeeAggregationForPeriod(db as never, baseScope());

    expect(result.recurringFeesUsd).toBe(0);
    expect(result.lines).toEqual([]);
  });
});

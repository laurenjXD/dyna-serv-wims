// RED-step tests for lib/billing/vmi-soa-balance.ts (does not exist yet —
// Task D.6, from-scratch module).
//
// Traceability:
//   specs/12-vmi-billing/tasks.md Task Group D, D.6 — "Implement SOA
//     running-balance calculation — soa_opening_balance_usd = prior
//     period's soa_closing_balance_usd (0 if first period).
//     soa_payments_applied_usd = SUM(vmi_payments WHERE type='payment' AND
//     applied_to_period_id = this period). soa_closing_balance_usd computed
//     per design.md §2.6 step 5."
//   specs/12-vmi-billing/design.md §2.6 step 5 — the exact algorithm under
//     test:
//       "soa_opening_balance_usd = prior vmi_billing_periods row's
//         soa_closing_balance_usd for this party (0 if this is the party's
//         first period).
//       soa_payments_applied_usd = SUM(vmi_payments WHERE type = 'payment'
//         AND applied_to_period_id = this new period's id)
//       soa_closing_balance_usd = soa_opening_balance_usd +
//         billing_statement_total_usd - soa_payments_applied_usd"
//   specs/12-vmi-billing/requirements.md FR-7.1 — "vmi_soa_periods
//     [vmi_billing_periods].opening_balance for a party's period N equals
//     period N-1's closing_balance (the running AR balance) — never
//     recomputed in isolation."
//   specs/12-vmi-billing/requirements.md FR-7.2 — "closing_balance =
//     opening_balance + this_period_billing_statement_total -
//     payments_applied_this_period."
//   specs/12-vmi-billing/requirements.md FR-7.3 — "Payments (vmi_payments:
//     amount, date, type — payment | credit_memo | adjustment, applied
//     period) are entered manually by an Administrator against one specific
//     period. Partial payments are permitted."
//   specs/12-vmi-billing/tasks.md Task Group G, G.8 — the acceptance table
//     this file directly implements:
//       "Party's first period | soa_opening_balance_usd = 0"
//       "Second period, first unpaid | soa_opening_balance_usd = first
//         period's soa_closing_balance_usd"
//       "Partial payment recorded against a draft period |
//         soa_payments_applied_usd reduces soa_closing_balance_usd
//         accordingly, never below the true remaining balance"
//       (the fourth G.8 row — "Payment recorded after a period is already
//       issued applies to the NEXT period's opening balance, not a
//       retroactive edit" — is D.12's concern, the payment-creation command;
//       this module only computes SOA figures at close time from whatever
//       vmi_payments rows already exist against the period being closed, so
//       it is not re-tested here.)
//
// Acceptance criterion under test (requirements.md FR-7.1/7.2/7.3,
// design.md §2.6 step 5, tasks.md D.6/G.8): the SOA opening balance is
// ALWAYS the immediately-prior (non-voided) period's closing balance for
// THIS party specifically — never recomputed from scratch, never another
// party's figure, and never a voided/superseded period's figure. The
// payments-applied sum counts ONLY type='payment' rows tied to the period
// being closed — credit_memo/adjustment rows are a separate figure
// (credits_applied_usd, design.md §2.6 step 3) computed elsewhere, not by
// this module. The closing balance is the plain
// opening + statement_total - payments_applied arithmetic, with no clamping
// (unlike billing_statement_total_usd, which IS clamped at 0 per FR-6.1 —
// SOA is a running AR balance and is allowed to go negative, representing a
// credit position).
//
// ---------------------------------------------------------------------------
// SCHEMA/DEPENDENCY VERIFICATION PERFORMED BEFORE WRITING THIS FILE:
//
//   lib/db/schema/vmi_billing.ts:
//     vmiBillingPeriods: partyId, periodStartDate (date), periodEndDate
//       (date), status (varchar, CHECK IN ('draft','issued','voided')),
//       soaClosingBalanceUsd (decimal, serializes as a string from the DB —
//       same established convention as every other lib/billing/*.ts raw-row
//       mapper). NOTE: design.md §2.6 step 5 says "prior vmi_billing_periods
//       row" but neither design.md nor the schema names an explicit
//       "ordering field" column for what counts as "prior" — see the DESIGN
//       DECISION note below for the resolution.
//     vmiPayments: partyId, appliedToPeriodId (uuid, FK to
//       vmiBillingPeriods.id — NOT NULL, so every payment always targets one
//       specific period), type (vmi_payment_type enum: 'payment' |
//       'credit_memo' | 'adjustment', default 'payment'), amountUsd
//       (decimal, serializes as a string from the DB).
//
//   lib/billing/vmi-forex-lock.ts / vmi-charge-aggregation.ts (already
//     implemented) — mirrored for module shape: pure compute/resolve
//     functions over already-typed rows, plus a thin `db`-injected
//     DB-facing orchestration function. Also mirrored: the pure layer
//     re-applies its own scope filter (partyId, status, appliedToPeriodId)
//     even when the DB query already filtered — the same "defense in depth"
//     precedent vmi-charge-aggregation.ts's computeVmiChargeAggregation
//     uses via isWithinScope.
//
// ---------------------------------------------------------------------------
// DESIGN DECISION — "the immediately-prior period" ordering field:
//
//   Chosen: order candidate prior periods by `periodEndDate` DESCENDING,
//   restricted to periods for the SAME partyId, with `status != 'voided'`,
//   and `periodEndDate < newPeriodStartDate`; the first (i.e. most recent)
//   result's `soaClosingBalanceUsd` is the opening balance. `0` if no such
//   row exists (first period for the party).
//
//   Why periodEndDate over periodStartDate: `vmi_billing_periods` rows are
//   calendar-month periods (requirements.md §1: "per calendar month") that
//   never overlap for well-formed data, so periodStartDate and
//   periodEndDate produce the same ordering in the normal case — but
//   periodEndDate is the field that actually represents when a period
//   *closed* (the AR balance "as of" that date), which is the concept
//   soa_closing_balance_usd is carrying forward — matching how
//   `vmi_daily_balance_ledger`'s own "ending" figures (not "beginning") are
//   what feed forward into the next day's beginning balance (design.md
//   §2.2 step 2: "beginning_cbm = yesterday's ending_cbm"). The comparison
//   boundary uses `newPeriodStartDate` (the period being closed) rather
//   than "today" or `createdAt`, since a period can be closed out of
//   real-time order (e.g. a late backfill) and its OWN calendar month is
//   what determines its correct predecessor, not when the close action
//   happened to run.
//
//   Why `status != 'voided'` is required, not incidental: FR-9.2/design.md
//   §2.7 establish the void-and-reissue correction pattern — a corrected
//   period's original row is marked 'voided' and superseded by a new row
//   for the SAME month. That voided row's `soaClosingBalanceUsd` is stale,
//   retired figure; the next real period's opening balance must carry
//   forward from the REISSUED (non-voided) replacement, never the voided
//   original. This is the direct analogue of "Retroactive forex_rates
//   update | Already-issued period's locked rate unchanged" (G.10) applied
//   to SOA: a correction changes what "the prior period's balance" means
//   going forward, and this module must resolve that correctly rather than
//   picking whichever row happens to have the latest periodEndDate
//   regardless of status.
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/billing/vmi-soa-balance.ts (for
// backend-builder), established by this RED step:
//
//   export type VmiPriorPeriodForSoa = {
//     partyId: string;
//     periodEndDate: string; // 'YYYY-MM-DD'
//     status: string; // 'draft' | 'issued' | 'voided'
//     soaClosingBalanceUsd: number;
//   };
//
//   export type VmiPaymentForSoa = {
//     partyId: string;
//     appliedToPeriodId: string;
//     type: string; // 'payment' | 'credit_memo' | 'adjustment'
//     amountUsd: number;
//   };
//
//   export type VmiSoaBalanceScope = {
//     partyId: string;
//     periodId: string; // the period being closed
//     newPeriodStartDate: string; // 'YYYY-MM-DD', this period's own start date
//     billingStatementTotalUsd: number;
//   };
//
//   export type VmiSoaBalanceResult = {
//     soaOpeningBalanceUsd: number;
//     soaPaymentsAppliedUsd: number;
//     soaClosingBalanceUsd: number;
//   };
//
//   // Pure. 0 when no matching prior period exists.
//   export function resolveSoaOpeningBalance(
//     priorPeriods: VmiPriorPeriodForSoa[],
//     scope: { partyId: string; newPeriodStartDate: string },
//   ): number;
//
//   // Pure. Sums only type === 'payment' rows for this exact
//   // (partyId, periodId) pair.
//   export function sumSoaPaymentsApplied(
//     payments: VmiPaymentForSoa[],
//     scope: { partyId: string; periodId: string },
//   ): number;
//
//   // Pure formula, no clamping.
//   export function computeVmiSoaClosingBalance(
//     openingBalanceUsd: number,
//     billingStatementTotalUsd: number,
//     paymentsAppliedUsd: number,
//   ): number;
//
//   // Pure. Combines the three functions above.
//   export function computeVmiSoaBalance(
//     priorPeriods: VmiPriorPeriodForSoa[],
//     payments: VmiPaymentForSoa[],
//     scope: VmiSoaBalanceScope,
//   ): VmiSoaBalanceResult;
//
//   // DB-facing, thin orchestration layer (same "db injected explicitly"
//   // precedent as every other lib/billing/*.ts module).
//   export type VmiSoaBalanceDbLike = { select: (...args: any[]) => any };
//   export async function getVmiSoaBalanceForClose(
//     db: VmiSoaBalanceDbLike,
//     scope: VmiSoaBalanceScope,
//   ): Promise<VmiSoaBalanceResult>;
//
// ---------------------------------------------------------------------------

import { describe, expect, it, vi } from "vitest";
import {
  resolveSoaOpeningBalance,
  sumSoaPaymentsApplied,
  computeVmiSoaClosingBalance,
  computeVmiSoaBalance,
  getVmiSoaBalanceForClose,
  type VmiPriorPeriodForSoa,
  type VmiPaymentForSoa,
} from "../vmi-soa-balance";
import { vmiBillingPeriods, vmiPayments } from "@/lib/db/schema/vmi_billing";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const PARTY_A = "11111111-1111-1111-1111-111111111111";
const PARTY_B = "22222222-2222-2222-2222-222222222222";
const PERIOD_JULY_ID = "33333333-3333-3333-3333-333333333333"; // the period being closed

function priorPeriod(overrides: Partial<VmiPriorPeriodForSoa> = {}): VmiPriorPeriodForSoa {
  return {
    partyId: PARTY_A,
    periodEndDate: "2026-06-30",
    status: "issued",
    soaClosingBalanceUsd: 3023.8,
    ...overrides,
  };
}

function payment(overrides: Partial<VmiPaymentForSoa> = {}): VmiPaymentForSoa {
  return {
    partyId: PARTY_A,
    appliedToPeriodId: PERIOD_JULY_ID,
    type: "payment",
    amountUsd: 1000,
    ...overrides,
  };
}

// Raw DB row shapes (decimal columns serialize as strings) — mirrors every
// other lib/billing/*.ts raw-row precedent.
function rawPriorPeriodRow(overrides: Record<string, unknown> = {}) {
  return {
    partyId: PARTY_A,
    periodEndDate: "2026-06-30",
    status: "issued",
    soaClosingBalanceUsd: "3023.8000",
    ...overrides,
  };
}

function rawPaymentRow(overrides: Record<string, unknown> = {}) {
  return {
    partyId: PARTY_A,
    appliedToPeriodId: PERIOD_JULY_ID,
    type: "payment",
    amountUsd: "1000.0000",
    ...overrides,
  };
}

// Minimal chainable mock query builder — same call-order-based pattern as
// vmi-forex-lock.test.ts / vmi-charge-aggregation.test.ts's makeChain.
function makeChain(rows: unknown[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  for (const method of ["from", "where", "limit", "orderBy"]) {
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
// resolveSoaOpeningBalance — pure resolve layer.
// ---------------------------------------------------------------------------

describe("resolveSoaOpeningBalance (D.6, pure resolve)", () => {
  it(
    "(AC: FR-7.1 / G.8 'Party's first period | soa_opening_balance_usd = 0') " +
      "returns 0 when no prior vmi_billing_periods row exists for this party",
    () => {
      const result = resolveSoaOpeningBalance([], {
        partyId: PARTY_A,
        newPeriodStartDate: "2026-07-01",
      });

      expect(result).toBe(0);
    },
  );

  it(
    "(AC: FR-7.1 / G.8 'Second period, first unpaid | opening = first " +
      "period's closing') returns the immediately-prior period's " +
      "soa_closing_balance_usd, not any other value",
    () => {
      const result = resolveSoaOpeningBalance(
        [priorPeriod({ periodEndDate: "2026-06-30", soaClosingBalanceUsd: 3023.8 })],
        { partyId: PARTY_A, newPeriodStartDate: "2026-07-01" },
      );

      expect(result).toBe(3023.8);
    },
  );

  it(
    "(AC: 'the immediately-prior period', design.md §2.6 step 5) with " +
      "multiple prior periods, uses the one with the LATEST periodEndDate " +
      "before newPeriodStartDate — not array order, not the row with the " +
      "largest soaClosingBalanceUsd value",
    () => {
      const periods = [
        priorPeriod({ periodEndDate: "2026-04-30", soaClosingBalanceUsd: 5000 }), // oldest, largest balance — must NOT be picked
        priorPeriod({ periodEndDate: "2026-06-30", soaClosingBalanceUsd: 3023.8 }), // most recent — must be picked
        priorPeriod({ periodEndDate: "2026-05-31", soaClosingBalanceUsd: 4000 }),
      ];

      const result = resolveSoaOpeningBalance(periods, {
        partyId: PARTY_A,
        newPeriodStartDate: "2026-07-01",
      });

      expect(result).toBe(3023.8);
    },
  );

  it(
    "(AC: FR-9.2 / design.md §2.7 void-and-reissue correction pattern — a " +
      "voided period's balance is stale and must never be carried forward) " +
      "skips a 'voided' period even when it has the latest periodEndDate, " +
      "using the reissued non-voided replacement instead",
    () => {
      const periods = [
        priorPeriod({ periodEndDate: "2026-06-30", status: "voided", soaClosingBalanceUsd: 2000 }),
        priorPeriod({ periodEndDate: "2026-06-30", status: "issued", soaClosingBalanceUsd: 3023.8 }), // the reissued -R1
        priorPeriod({ periodEndDate: "2026-05-31", status: "issued", soaClosingBalanceUsd: 1500 }),
      ];

      const result = resolveSoaOpeningBalance(periods, {
        partyId: PARTY_A,
        newPeriodStartDate: "2026-07-01",
      });

      expect(result).toBe(3023.8);
    },
  );

  it(
    "(AC: FR-7.1 'never recomputed in isolation' / party isolation) never " +
      "uses another party's prior period, even when it is the only " +
      "candidate row and has a later periodEndDate than any of this " +
      "party's own rows",
    () => {
      const periods = [
        priorPeriod({ partyId: PARTY_B, periodEndDate: "2026-06-30", soaClosingBalanceUsd: 99999 }),
      ];

      const result = resolveSoaOpeningBalance(periods, {
        partyId: PARTY_A,
        newPeriodStartDate: "2026-07-01",
      });

      expect(result).toBe(0);
    },
  );

  it(
    "excludes a period whose periodEndDate is NOT before newPeriodStartDate " +
      "(e.g. the same period being closed, or a future period) — only a " +
      "genuinely PRIOR period may supply the opening balance",
    () => {
      const periods = [
        priorPeriod({ periodEndDate: "2026-07-31", soaClosingBalanceUsd: 9999 }), // same/overlapping month — not prior
      ];

      const result = resolveSoaOpeningBalance(periods, {
        partyId: PARTY_A,
        newPeriodStartDate: "2026-07-01",
      });

      expect(result).toBe(0);
    },
  );
});

// ---------------------------------------------------------------------------
// sumSoaPaymentsApplied — pure sum layer.
// ---------------------------------------------------------------------------

describe("sumSoaPaymentsApplied (D.6, pure sum)", () => {
  it(
    "(AC: FR-7.3 / design.md §2.6 step 5 'SUM(vmi_payments WHERE " +
      "type=payment AND applied_to_period_id = this period)') sums " +
      "amountUsd across multiple 'payment' rows applied to this period",
    () => {
      const payments = [
        payment({ amountUsd: 1000 }),
        payment({ amountUsd: 500 }),
      ];

      const result = sumSoaPaymentsApplied(payments, {
        partyId: PARTY_A,
        periodId: PERIOD_JULY_ID,
      });

      expect(result).toBe(1500);
    },
  );

  it(
    "(AC: design.md §2.6 step 3 — credits_applied_usd is a SEPARATE figure, " +
      "computed elsewhere; this module only handles type='payment') excludes " +
      "'credit_memo' and 'adjustment' type rows from the sum entirely",
    () => {
      const payments = [
        payment({ type: "payment", amountUsd: 1000 }),
        payment({ type: "credit_memo", amountUsd: 500 }),
        payment({ type: "adjustment", amountUsd: 250 }),
      ];

      const result = sumSoaPaymentsApplied(payments, {
        partyId: PARTY_A,
        periodId: PERIOD_JULY_ID,
      });

      expect(result).toBe(1000);
    },
  );

  it(
    "(AC: requirements.md FR-7.3 'Partial payments are permitted') a single " +
      "payment smaller than the period's billing total sums to exactly " +
      "that partial amount — not the full statement total, not zero",
    () => {
      const payments = [payment({ amountUsd: 400 })];

      const result = sumSoaPaymentsApplied(payments, {
        partyId: PARTY_A,
        periodId: PERIOD_JULY_ID,
      });

      expect(result).toBe(400);
    },
  );

  it(
    "(AC: FR-7.3 'against one specific period' / party isolation) excludes " +
      "a payment applied to a DIFFERENT period id, even for the same party",
    () => {
      const payments = [
        payment({ appliedToPeriodId: PERIOD_JULY_ID, amountUsd: 400 }),
        payment({ appliedToPeriodId: "44444444-4444-4444-4444-444444444444", amountUsd: 9999 }),
      ];

      const result = sumSoaPaymentsApplied(payments, {
        partyId: PARTY_A,
        periodId: PERIOD_JULY_ID,
      });

      expect(result).toBe(400);
    },
  );

  it(
    "(AC: party isolation) excludes a payment for a different party even " +
      "when it happens to reference the same appliedToPeriodId value",
    () => {
      const payments = [
        payment({ partyId: PARTY_A, amountUsd: 400 }),
        payment({ partyId: PARTY_B, amountUsd: 9999 }),
      ];

      const result = sumSoaPaymentsApplied(payments, {
        partyId: PARTY_A,
        periodId: PERIOD_JULY_ID,
      });

      expect(result).toBe(400);
    },
  );

  it("returns 0 when no payments exist for this period at all", () => {
    const result = sumSoaPaymentsApplied([], { partyId: PARTY_A, periodId: PERIOD_JULY_ID });

    expect(result).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeVmiSoaClosingBalance — pure formula layer.
// ---------------------------------------------------------------------------

describe("computeVmiSoaClosingBalance (D.6, pure formula)", () => {
  it(
    "(AC: design.md §2.6 step 5 formula / FR-7.2) first period: " +
      "closing = 0 (opening) + billing_statement_total - payments_applied",
    () => {
      const result = computeVmiSoaClosingBalance(0, 3023.8, 0);

      expect(result).toBe(3023.8);
    },
  );

  it(
    "(AC: FR-7.1 'a genuine running AR balance across periods') carries a " +
      "nonzero opening balance forward correctly: " +
      "closing = opening + statement_total - payments_applied",
    () => {
      const result = computeVmiSoaClosingBalance(3023.8, 1500, 0);

      expect(result).toBe(4523.8);
    },
  );

  it(
    "(AC: tasks.md G.8 'Partial payment ... reduces soa_closing_balance_usd " +
      "accordingly, never below the true remaining balance') a partial " +
      "payment reduces the closing balance by EXACTLY the payment amount — " +
      "it does not zero out or floor the result",
    () => {
      // opening 0, statement total 1000, partial payment 400 -> remaining
      // balance is exactly 600, never clamped to 0.
      const result = computeVmiSoaClosingBalance(0, 1000, 400);

      expect(result).toBe(600);
      expect(result).not.toBe(0);
    },
  );

  it(
    "(AC: G.8's 'never below the true remaining balance' — i.e. this " +
      "module must NOT clamp at 0 the way billing_statement_total_usd does " +
      "per FR-6.1; SOA is a running AR balance and a genuine credit " +
      "(negative) position is a valid, correct result) a payment larger " +
      "than opening+statement_total produces a NEGATIVE closing balance, " +
      "not a value clamped to 0",
    () => {
      const result = computeVmiSoaClosingBalance(0, 500, 800);

      expect(result).toBe(-300);
    },
  );
});

// ---------------------------------------------------------------------------
// computeVmiSoaBalance — combined pure layer.
// ---------------------------------------------------------------------------

describe("computeVmiSoaBalance (D.6, pure combination)", () => {
  it(
    "(AC: full design.md §2.6 step 5, first period, no payments yet) " +
      "returns opening=0, paymentsApplied=0, closing=billing_statement_total",
    () => {
      const result = computeVmiSoaBalance([], [], {
        partyId: PARTY_A,
        periodId: PERIOD_JULY_ID,
        newPeriodStartDate: "2026-06-01",
        billingStatementTotalUsd: 1116.9,
      });

      expect(result).toEqual({
        soaOpeningBalanceUsd: 0,
        soaPaymentsAppliedUsd: 0,
        soaClosingBalanceUsd: 1116.9,
      });
    },
  );

  it(
    "(AC: full design.md §2.6 step 5, second period with a prior balance " +
      "and a partial payment recorded against the new period) opening " +
      "carries from the prior period, payments sum only 'payment' rows for " +
      "THIS period, closing = opening + total - paymentsApplied",
    () => {
      const priorPeriods = [
        priorPeriod({ periodEndDate: "2026-06-30", status: "issued", soaClosingBalanceUsd: 1116.9 }),
      ];
      const payments = [
        payment({ type: "payment", appliedToPeriodId: PERIOD_JULY_ID, amountUsd: 500 }),
        payment({ type: "credit_memo", appliedToPeriodId: PERIOD_JULY_ID, amountUsd: 200 }), // must be excluded
      ];

      const result = computeVmiSoaBalance(priorPeriods, payments, {
        partyId: PARTY_A,
        periodId: PERIOD_JULY_ID,
        newPeriodStartDate: "2026-07-01",
        billingStatementTotalUsd: 3023.8,
      });

      expect(result).toEqual({
        soaOpeningBalanceUsd: 1116.9,
        soaPaymentsAppliedUsd: 500,
        soaClosingBalanceUsd: 1116.9 + 3023.8 - 500,
      });
    },
  );
});

// ---------------------------------------------------------------------------
// getVmiSoaBalanceForClose — DB-facing orchestration.
// ---------------------------------------------------------------------------

describe("getVmiSoaBalanceForClose (D.6, DB-facing orchestration)", () => {
  it(
    "(AC: end-to-end wiring, first period) queries vmi_billing_periods and " +
      "vmi_payments for this party and returns opening=0 when no prior " +
      "period rows exist",
    async () => {
      const db = createMockDb();
      db.select
        .mockImplementationOnce(() => makeChain([])) // vmi_billing_periods: none yet
        .mockImplementationOnce(() => makeChain([])); // vmi_payments: none yet

      const result = await getVmiSoaBalanceForClose(db as never, {
        partyId: PARTY_A,
        periodId: PERIOD_JULY_ID,
        newPeriodStartDate: "2026-06-01",
        billingStatementTotalUsd: 1116.9,
      });

      expect(result).toEqual({
        soaOpeningBalanceUsd: 0,
        soaPaymentsAppliedUsd: 0,
        soaClosingBalanceUsd: 1116.9,
      });
    },
  );

  it("queries the vmi_billing_periods table via db.select(...).from(...)", async () => {
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

    await getVmiSoaBalanceForClose(db as never, {
      partyId: PARTY_A,
      periodId: PERIOD_JULY_ID,
      newPeriodStartDate: "2026-07-01",
      billingStatementTotalUsd: 0,
    });

    expect(fromCalls).toContain(vmiBillingPeriods);
    expect(fromCalls).toContain(vmiPayments);
  });

  it(
    "(AC: G.8 'Second period, first unpaid' + 'Partial payment recorded " +
      "against a draft period') end-to-end: prior period's closing balance " +
      "becomes this period's opening, and a partial payment reduces the " +
      "closing balance by exactly its amount",
    async () => {
      const db = createMockDb();
      db.select
        .mockImplementationOnce(() =>
          makeChain([
            rawPriorPeriodRow({
              periodEndDate: "2026-06-30",
              status: "issued",
              soaClosingBalanceUsd: "1116.9000",
            }),
          ]),
        )
        .mockImplementationOnce(() =>
          makeChain([rawPaymentRow({ type: "payment", amountUsd: "500.0000" })]),
        );

      const result = await getVmiSoaBalanceForClose(db as never, {
        partyId: PARTY_A,
        periodId: PERIOD_JULY_ID,
        newPeriodStartDate: "2026-07-01",
        billingStatementTotalUsd: 3023.8,
      });

      expect(result.soaOpeningBalanceUsd).toBe(1116.9);
      expect(result.soaPaymentsAppliedUsd).toBe(500);
      expect(result.soaClosingBalanceUsd).toBeCloseTo(1116.9 + 3023.8 - 500, 4);
    },
  );

  it(
    "(AC: design.md §2.6 step 3 vs step 5 — credits_applied_usd is a " +
      "separate figure computed elsewhere) a 'credit_memo' row returned " +
      "from the DB is NOT summed into soa_payments_applied_usd, even at the " +
      "orchestration layer",
    async () => {
      const db = createMockDb();
      db.select
        .mockImplementationOnce(() => makeChain([])) // no prior period
        .mockImplementationOnce(() =>
          makeChain([rawPaymentRow({ type: "credit_memo", amountUsd: "500.0000" })]),
        );

      const result = await getVmiSoaBalanceForClose(db as never, {
        partyId: PARTY_A,
        periodId: PERIOD_JULY_ID,
        newPeriodStartDate: "2026-07-01",
        billingStatementTotalUsd: 1000,
      });

      expect(result.soaPaymentsAppliedUsd).toBe(0);
      expect(result.soaClosingBalanceUsd).toBe(1000);
    },
  );

  it(
    "(AC: party isolation, end-to-end) another party's prior period/payment " +
      "rows never leak into this party's computed SOA figures, even when " +
      "the mocked DB layer returns them",
    async () => {
      const db = createMockDb();
      db.select
        .mockImplementationOnce(() =>
          makeChain([
            rawPriorPeriodRow({
              partyId: PARTY_B,
              periodEndDate: "2026-06-30",
              status: "issued",
              soaClosingBalanceUsd: "99999.0000",
            }),
          ]),
        )
        .mockImplementationOnce(() =>
          makeChain([rawPaymentRow({ partyId: PARTY_B, type: "payment", amountUsd: "99999.0000" })]),
        );

      const result = await getVmiSoaBalanceForClose(db as never, {
        partyId: PARTY_A,
        periodId: PERIOD_JULY_ID,
        newPeriodStartDate: "2026-07-01",
        billingStatementTotalUsd: 1000,
      });

      expect(result).toEqual({
        soaOpeningBalanceUsd: 0,
        soaPaymentsAppliedUsd: 0,
        soaClosingBalanceUsd: 1000,
      });
    },
  );
});

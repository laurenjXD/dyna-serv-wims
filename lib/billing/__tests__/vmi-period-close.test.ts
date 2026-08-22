// RED-step tests for lib/billing/vmi-period-close.ts (does not exist yet —
// Task D.8, from-scratch module).
//
// Traceability:
//   specs/12-vmi-billing/tasks.md Task Group D, D.8 — "Implement the
//     period-close command — File: lib/billing/vmi-period-close.ts. Runs
//     D.1-D.7, validates no existing non-voided period for the same
//     party/month, computes billing_statement_total_usd, inserts
//     vmi_billing_periods with status = 'draft'."
//   specs/12-vmi-billing/design.md §2.6, steps 1-7 ONLY (step 8's PDF
//     generation is D.9, separately blocked on 04's pipeline — out of scope
//     for this module/file):
//       "1. Validate: no existing non-voided vmi_billing_periods row for
//          (party_id, month). Validate: forex_rates row exists for today
//          (generation date); block with a clear error if absent.
//        2. Compute storage_charge_usd, handling_in_usd, handling_out_usd,
//          documentation_usd, delivery_usd, recurring_fees_usd,
//          ad_hoc_charges_usd per §2.2-2.5.
//        3. credits_applied_usd = SUM(vmi_payments WHERE type IN
//          ('credit_memo','adjustment') AND not yet applied, for this party)
//        4. billing_statement_total_usd = storage + handling_in +
//          handling_out + documentation + delivery + recurring_fees +
//          ad_hoc_charges - credits_applied. Clamp at 0.
//        5. soa_opening_balance_usd = prior vmi_billing_periods row's
//          soa_closing_balance_usd for this party (0 if this is the party's
//          first period). soa_payments_applied_usd = SUM(vmi_payments WHERE
//          type = 'payment' AND applied_to_period_id = this new period's
//          id). soa_closing_balance_usd = soa_opening_balance_usd +
//          billing_statement_total_usd - soa_payments_applied_usd
//        6. Lock forex: locked_exchange_rate_php = forex_rates.usd_to_php_rate
//          WHERE effective_date = today.
//        7. INSERT vmi_billing_periods (status = 'draft', all computed
//          fields)."
//   specs/12-vmi-billing/requirements.md FR-6.1 — "total_amount_usd =
//     storage charge + handling in + handling out + documentation + delivery
//     + SUM(active recurring fee lines) + SUM(ad-hoc charge lines) − credits
//     applied (clamped at 0)."
//   specs/12-vmi-billing/requirements.md FR-6.2 — forex locked at close time,
//     missing rate blocks close.
//   specs/12-vmi-billing/requirements.md FR-7.1/7.2 — SOA opening balance
//     carries forward; closing balance formula.
//   specs/12-vmi-billing/requirements.md FR-9.1 — "A period close is one
//     atomic action ... compute and store the Billing Statement/Warehousing
//     Charges/SOA/LOA content ... and mark the period issued." (NOTE: the
//     'issued' transition and the four PDF artifacts are D.9/D.10 — this
//     module only ever produces status = 'draft'; see the D.8 task text
//     itself, which stops at "inserts vmi_billing_periods with status =
//     'draft'".)
//   specs/12-vmi-billing/tasks.md Task Group G, G.7 — "Full June fixture,
//     all charge types assembled | billing_statement_total_usd = $3,023.80
//     exactly." — the canonical regression fixture this file's June test
//     reproduces.
//   specs/12-vmi-billing/tasks.md Task Group G, G.9 — "Close a period | All
//     four documents generate; status becomes issued only after all four
//     succeed." (out of scope here — D.9's concern; this file only proves
//     THIS module never itself writes status = 'issued'.)
//
// ---------------------------------------------------------------------------
// SCHEMA/DEPENDENCY VERIFICATION PERFORMED BEFORE WRITING THIS FILE:
//
//   lib/db/schema/vmi_billing.ts: vmiBillingPeriods — every column D.8 must
//     populate on INSERT: periodNumber (unique), partyId, periodStartDate,
//     periodEndDate, storageChargeUsd, handlingInUsd, handlingOutUsd,
//     documentationUsd, deliveryUsd, recurringFeesUsd, adHocChargesUsd,
//     creditsAppliedUsd (default '0'), billingStatementTotalUsd (CHECK >= 0),
//     soaOpeningBalanceUsd, soaPaymentsAppliedUsd (default '0'),
//     soaClosingBalanceUsd, lockedExchangeRatePhp, lockedExchangeRateDate,
//     billingCurrency, status (default 'draft', CHECK IN
//     ('draft','issued','voided')). The four *ArtifactId columns and
//     closedByUserId/closedAt/voidedAt/voidedByUserId are all nullable and
//     are D.9/D.11's concern, not written by this module.
//
//   lib/billing/vmi-handling.ts (D.1, implemented): exports
//     getVmiHandlingForPeriod(db, partyId, periodStartDate, periodEndDate)
//     -> Promise<{ handlingInUsd, handlingOutUsd, days }>. Mocked here —
//     already covered by its own 8/8-passing suite; this file proves D.8's
//     OWN wiring/orchestration, not a re-test of D.1's internal query shape
//     (same "LAYER CHOICE" precedent lib/billing/__tests__/
//     vmi-daily-balance-backfill.test.ts already established for
//     getVmiPartyMovements).
//
//   lib/billing/vmi-charge-aggregation.ts (D.3, implemented): exports
//     getVmiChargeAggregationForPeriod(db, scope) ->
//     Promise<{ documentationUsd, deliveryPhp, deliveryUsd,
//     adHocChargesUsd }>, scope = { partyId, periodStartDate, periodEndDate,
//     lockedExchangeRatePhp }. Mocked.
//
//   lib/billing/vmi-recurring-fee-aggregation.ts (D.4, implemented): exports
//     getVmiRecurringFeeAggregationForPeriod(db, scope) ->
//     Promise<{ recurringFeesUsd, lines }>, same scope shape as D.3. Mocked.
//
//   lib/billing/vmi-forex-lock.ts (D.5, implemented): exports
//     getLockedForexRateForClose(db, generationDate) ->
//     Promise<{ lockedExchangeRatePhp, lockedExchangeRateDate }>; REJECTS
//     (throws) when no forex_rates row exists for generationDate. Mocked.
//
//   lib/billing/vmi-soa-balance.ts (D.6, implemented): exports
//     getVmiSoaBalanceForClose(db, scope) ->
//     Promise<{ soaOpeningBalanceUsd, soaPaymentsAppliedUsd,
//     soaClosingBalanceUsd }>, scope = { partyId, periodId,
//     newPeriodStartDate, billingStatementTotalUsd }. Mocked. NOTE: scope
//     requires periodId — "the period being closed" — which per this
//     module's own header comment sums vmi_payments WHERE
//     applied_to_period_id = that exact id. Because vmi_payments.
//     appliedToPeriodId is NOT NULL (a real FK, not nullable), a payment can
//     only ever be recorded against an id that ALREADY EXISTS as a row —
//     which the new period is NOT, until this module's own INSERT (step 7)
//     runs. The only way design.md §2.6 step 5's "applied_to_period_id =
//     this new period's id" is satisfiable BEFORE that INSERT executes is if
//     the new period's id is generated in application code (a v4 UUID) and
//     passed explicitly into `.values({ id: ... })`, overriding the column's
//     `.defaultRandom()` — never left for Postgres to assign at insert time.
//     This module's contract (below) does exactly that. In practice this
//     means soaPaymentsAppliedUsd is 0 at first close for any period (no
//     payment could have targeted an id that didn't exist a moment earlier)
//     — D.12's payment-creation command is what later updates a still-draft
//     period's soaPaymentsAppliedUsd/soaClosingBalanceUsd after the fact, per
//     tasks.md D.12's own text ("Recomputes the target period's
//     soa_payments_applied_usd/soa_closing_balance_usd if the period is
//     still draft"). This file tests D.8 in isolation via a mocked D.6, so
//     it is not blocked by that real-world timing detail — it just proves
//     D.8 wires the freshly-generated periodId and the freshly-computed
//     billingStatementTotalUsd into D.6 correctly (test group 7 below).
//
//   lib/billing/vmi-period-number.ts (D.7, implemented): exports
//     generateVmiPeriodNumber(db, { partyCode, year, month, isCorrection }) ->
//     Promise<string>. Mocked.
//
// ---------------------------------------------------------------------------
// TWO GENUINE GAPS SURFACED WHILE VERIFYING THIS MODULE'S DEPENDENCIES
// (per this RED step's own instructions: "verify, don't guess, and document
// what you find" — neither gap is silently papered over below):
//
// GAP 1 — storage_charge_usd has no owning D.1-D.7 module.
//   design.md §2.6 step 2 says "Compute storage_charge_usd ... per
//   §2.2-2.5", but §2.2 (daily balance replay) only describes the NIGHTLY
//   job that snapshots one already-priced row per day into
//   vmi_daily_balance_ledger.storageAmountUsd — it does not describe a
//   period-level SUM. requirements.md FR-3.1 is the actual formula:
//   "storage_charge_usd = SUM(vmi_daily_balance_ledger.daily_amount_usd)"
//   (the real column is storageAmountUsd, not daily_amount_usd — confirmed
//   against lib/db/schema/vmi_billing.ts directly). None of D.1 (handling),
//   D.3 (documentation/delivery/ad-hoc), D.4 (recurring fees), D.5 (forex),
//   D.6 (SOA), or D.7 (period number) reads vmi_daily_balance_ledger at all
//   — grep-verified against every one of those six files' own imports.
//   CONCLUSION: D.8 needs its own small storage-sum step, not a reused
//   sibling. This file establishes it as a small pure exported function,
//   sumVmiStorageCharge(rows), plus a single db.select call in the
//   orchestrator — mirroring the "raw rows in, JS reduce" shape every other
//   lib/billing/*.ts aggregation module already uses (e.g.
//   computeVmiChargeAggregation), rather than a SQL-side SUM().
//
// GAP 2 — credits_applied_usd's "not yet applied" has no backing column.
//   design.md §2.6 step 3: "credits_applied_usd = SUM(vmi_payments WHERE
//   type IN ('credit_memo','adjustment') AND not yet applied, for this
//   party)". lib/db/schema/vmi_billing.ts's actual vmiPayments table
//   (verified directly, not assumed) has NO applied/consumed/appliedAt-style
//   column at all — only id, partyId, appliedToPeriodId (NOT NULL FK to
//   vmiBillingPeriods.id), paymentDate, amountUsd, type, notes,
//   recordedByUserId, createdAt. There is nothing on the row itself that can
//   answer "has this credit already been applied to a prior close." A naive
//   `SUM(... WHERE type IN (...))` scoped only by partyId (no period
//   filter at all) would double-count the same credit_memo at every future
//   period close forever, since nothing would ever mark it consumed.
//   RESOLUTION CHOSEN for this RED step's contract (needs explicit
//   product/spec-writer confirmation before GREEN — flagged, not silently
//   decided as final): scope credits_applied_usd EXACTLY the same way D.6's
//   soaPaymentsAppliedUsd is already scoped — WHERE partyId = this party AND
//   appliedToPeriodId = periodId (the id of the period currently being
//   closed, generated up front per the GAP-adjacent note above) AND type IN
//   ('credit_memo','adjustment'). This reuses an already-established,
//   already-approved pattern (D.6's own scoping) rather than inventing a new
//   one, and is naturally idempotent without needing a real "applied" flag:
//   each period close only ever looks at ITS OWN freshly-generated id, so
//   the same credit_memo row can never be picked up by two different closes.
//   The residual limitation this does NOT resolve: it requires a credit to
//   be recorded against a not-yet-existing period id (the same timing
//   dependency GAP 1's sibling note above describes for payments) — meaning
//   in practice credits_applied_usd, like soaPaymentsAppliedUsd, is 0 at
//   first close and gets applied via a later D.12-style update. This is
//   flagged to the parent/handoff as an open item, not resolved by
//   inventing new schema in this test-writing pass.
//
// ---------------------------------------------------------------------------
// THIRD SCOPING DECISION (not a gap, a deliberate simplification kept
// consistent with an existing precedent): billingCurrency is not resolved
// by this module via its own vmi_contract_terms lookup. Exactly like D.7's
// generateVmiPeriodNumber takes partyCode as a caller-supplied field rather
// than querying `parties` itself, this module takes billingCurrency as a
// caller-supplied field on VmiPeriodCloseRequest — the future action-layer
// caller (not yet built; out of scope for D.8) is expected to resolve it
// from the party's vmi_contract_terms once, same as it must already resolve
// partyCode.
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/billing/vmi-period-close.ts (for
// backend-builder), established by this RED step:
//
//   export type VmiPeriodCloseRequest = {
//     partyId: string;
//     partyCode: string;
//     billingCurrency: string; // 'USD' | 'PHP' — caller-resolved, see note above
//     year: number;
//     month: number; // 1-12
//     periodStartDate: string; // 'YYYY-MM-DD'
//     periodEndDate: string;   // 'YYYY-MM-DD'
//     generationDate: string;  // 'YYYY-MM-DD' — passed through to D.5 unchanged
//   };
//
//   export type VmiPeriodCloseResult = {
//     id: string;
//     periodNumber: string;
//     partyId: string;
//     periodStartDate: string;
//     periodEndDate: string;
//     storageChargeUsd: number;
//     handlingInUsd: number;
//     handlingOutUsd: number;
//     documentationUsd: number;
//     deliveryUsd: number;
//     recurringFeesUsd: number;
//     adHocChargesUsd: number;
//     creditsAppliedUsd: number;
//     billingStatementTotalUsd: number;
//     soaOpeningBalanceUsd: number;
//     soaPaymentsAppliedUsd: number;
//     soaClosingBalanceUsd: number;
//     lockedExchangeRatePhp: number;
//     lockedExchangeRateDate: string;
//     billingCurrency: string;
//     status: "draft";
//   };
//
//   // Pure. Sums already-priced daily rows — GAP 1 above.
//   export function sumVmiStorageCharge(
//     rows: { storageAmountUsd: number }[],
//   ): number;
//
//   // Pure. FR-6.1's formula, clamped at 0 (never negative — matches the
//   // vmi_billing_periods CHECK constraint).
//   export function computeBillingStatementTotal(components: {
//     storageChargeUsd: number;
//     handlingInUsd: number;
//     handlingOutUsd: number;
//     documentationUsd: number;
//     deliveryUsd: number;
//     recurringFeesUsd: number;
//     adHocChargesUsd: number;
//     creditsAppliedUsd: number;
//   }): number;
//
//   export type VmiPeriodCloseDbLike = {
//     select: (...args: any[]) => any;
//     insert: (...args: any[]) => any;
//   };
//
//   // Orchestration, per the call sequence this test asserts on:
//   //   1. db.select(...).from(vmiBillingPeriods).where(partyId,
//   //      periodStartDate, periodEndDate, status != 'voided') -> if any row
//   //      returned, THROW immediately ("duplicate period" error). Nothing
//   //      else below runs.
//   //   2. getLockedForexRateForClose(db, request.generationDate) -> if this
//   //      rejects, propagate immediately (no catch/swallow). Nothing below
//   //      runs.
//   //   3. Generate a new period id (application-side UUID, not DB-assigned
//   //      — see the GAP 2 note above for why).
//   //   4. db.select(...).from(vmiDailyBalanceLedger).where(partyId,
//   //      ledgerDate BETWEEN periodStartDate/periodEndDate) -> rows ->
//   //      sumVmiStorageCharge(rows) -> storageChargeUsd.
//   //   5. getVmiHandlingForPeriod(db, partyId, periodStartDate,
//   //      periodEndDate) -> handlingInUsd/handlingOutUsd.
//   //   6. getVmiChargeAggregationForPeriod(db, { partyId, periodStartDate,
//   //      periodEndDate, lockedExchangeRatePhp }) -> documentationUsd/
//   //      deliveryUsd/adHocChargesUsd.
//   //   7. getVmiRecurringFeeAggregationForPeriod(db, { same scope }) ->
//   //      recurringFeesUsd.
//   //   8. db.select(...).from(vmiPayments).where(partyId,
//   //      appliedToPeriodId = the new id from step 3) -> rows -> sum
//   //      amountUsd for rows whose type is 'credit_memo' or 'adjustment'
//   //      (defensive re-filter even though the WHERE already scoped it —
//   //      same "defense in depth" precedent vmi-charge-aggregation.ts's
//   //      isWithinScope and vmi-soa-balance.ts's own re-filters use) ->
//   //      creditsAppliedUsd.
//   //   9. computeBillingStatementTotal({...}) -> billingStatementTotalUsd
//   //      (clamped at 0).
//   //   10. generateVmiPeriodNumber(db, { partyCode, year, month,
//   //      isCorrection: false }) -> periodNumber.
//   //   11. getVmiSoaBalanceForClose(db, { partyId, periodId: <step 3 id>,
//   //      newPeriodStartDate: periodStartDate, billingStatementTotalUsd })
//   //      -> soaOpeningBalanceUsd/soaPaymentsAppliedUsd/soaClosingBalanceUsd.
//   //   12. db.insert(vmiBillingPeriods).values({ id: <step 3 id>,
//   //      periodNumber, partyId, periodStartDate, periodEndDate, ...every
//   //      computed field..., billingCurrency: request.billingCurrency,
//   //      status: 'draft' }).returning() -> insertedRow.
//   //   13. Return the mapped VmiPeriodCloseResult.
//   export async function closeVmiPeriod(
//     db: VmiPeriodCloseDbLike,
//     request: VmiPeriodCloseRequest,
//   ): Promise<VmiPeriodCloseResult>;
//
// Explicitly OUT of scope for this module/file (per the task's own
// instruction to stop before design.md §2.6 step 8):
//   - PDF artifact generation for all four documents (D.9).
//   - The 'draft' -> 'issued' status transition and closedAt/closedByUserId
//     (D.9, only after all four PDFs succeed).
//   - Resend delivery (D.10).
//   - Corrections/void-and-reissue (D.11).
//   - Authorization/capability gating (reporting.financial_read,
//     Administrator-only) — this module mirrors every other lib/billing/*.ts
//     module's own precedent (C.1's own comment: "this module trusts a
//     caller-supplied party_id and performs no authorization itself by
//     design — the actual scope/permission check belongs at the call site"),
//     not lib/actions/vmi-charge-lines.ts's "use server" +
//     requirePermission + withRlsTransaction shape. D.8's own task text
//     (lib/billing/vmi-period-close.ts, not lib/actions/) and its total
//     absence of any resolver/capability language confirms this placement.
//
// ---------------------------------------------------------------------------

import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock every D.1-D.7 sibling DB-facing module — this file proves D.8's OWN
// orchestration/wiring/guard logic, not a re-test of any sibling's already
// independently-tested internals (same "LAYER CHOICE" precedent
// lib/billing/__tests__/vmi-daily-balance-backfill.test.ts established for
// getVmiPartyMovements).
// ---------------------------------------------------------------------------

const mockGetVmiHandlingForPeriod = vi.fn();
vi.mock("@/lib/billing/vmi-handling", () => ({
  getVmiHandlingForPeriod: (...args: unknown[]) =>
    mockGetVmiHandlingForPeriod(...args),
}));

const mockGetVmiChargeAggregationForPeriod = vi.fn();
vi.mock("@/lib/billing/vmi-charge-aggregation", () => ({
  getVmiChargeAggregationForPeriod: (...args: unknown[]) =>
    mockGetVmiChargeAggregationForPeriod(...args),
}));

const mockGetVmiRecurringFeeAggregationForPeriod = vi.fn();
vi.mock("@/lib/billing/vmi-recurring-fee-aggregation", () => ({
  getVmiRecurringFeeAggregationForPeriod: (...args: unknown[]) =>
    mockGetVmiRecurringFeeAggregationForPeriod(...args),
}));

const mockGetLockedForexRateForClose = vi.fn();
vi.mock("@/lib/billing/vmi-forex-lock", () => ({
  getLockedForexRateForClose: (...args: unknown[]) =>
    mockGetLockedForexRateForClose(...args),
}));

const mockGetVmiSoaBalanceForClose = vi.fn();
vi.mock("@/lib/billing/vmi-soa-balance", () => ({
  getVmiSoaBalanceForClose: (...args: unknown[]) =>
    mockGetVmiSoaBalanceForClose(...args),
}));

const mockGenerateVmiPeriodNumber = vi.fn();
vi.mock("@/lib/billing/vmi-period-number", () => ({
  generateVmiPeriodNumber: (...args: unknown[]) =>
    mockGenerateVmiPeriodNumber(...args),
}));

import {
  closeVmiPeriod,
  computeBillingStatementTotal,
  sumVmiStorageCharge,
  type VmiPeriodCloseRequest,
} from "../vmi-period-close";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const PARTY_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function baseRequest(
  overrides: Partial<VmiPeriodCloseRequest> = {},
): VmiPeriodCloseRequest {
  return {
    partyId: PARTY_ID,
    partyCode: "ACME",
    billingCurrency: "USD",
    year: 2026,
    month: 7,
    periodStartDate: "2026-07-01",
    periodEndDate: "2026-07-31",
    generationDate: "2026-08-01",
    ...overrides,
  };
}

// Minimal chainable mock query builder — same call-order-based pattern as
// lib/billing/__tests__/vmi-daily-balance-backfill.test.ts's makeChain.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeChain(rows: unknown[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  for (const method of ["from", "where", "orderBy", "limit", "values"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain.returning = vi.fn(() => Promise.resolve(rows));
  const resolved = Promise.resolve(rows);
  chain.then = resolved.then.bind(resolved);
  chain.catch = resolved.catch.bind(resolved);
  chain.finally = resolved.finally.bind(resolved);
  return chain;
}

function createMockDb() {
  return {
    select: vi.fn(),
    insert: vi.fn(),
  };
}

// Default happy-path mock wiring shared by most tests — each test overrides
// only what it needs to isolate.
function wireHappyPathDefaults() {
  mockGetLockedForexRateForClose.mockResolvedValue({
    lockedExchangeRatePhp: 61.71,
    lockedExchangeRateDate: "2026-08-01",
  });
  mockGetVmiHandlingForPeriod.mockResolvedValue({
    handlingInUsd: 0,
    handlingOutUsd: 0,
    days: [],
  });
  mockGetVmiChargeAggregationForPeriod.mockResolvedValue({
    documentationUsd: 0,
    deliveryPhp: 0,
    deliveryUsd: 0,
    adHocChargesUsd: 0,
  });
  mockGetVmiRecurringFeeAggregationForPeriod.mockResolvedValue({
    recurringFeesUsd: 0,
    lines: [],
  });
  mockGetVmiSoaBalanceForClose.mockResolvedValue({
    soaOpeningBalanceUsd: 0,
    soaPaymentsAppliedUsd: 0,
    soaClosingBalanceUsd: 0,
  });
  mockGenerateVmiPeriodNumber.mockResolvedValue("VMI-2026-07-ACME");
}

beforeEach(() => {
  mockGetVmiHandlingForPeriod.mockReset();
  mockGetVmiChargeAggregationForPeriod.mockReset();
  mockGetVmiRecurringFeeAggregationForPeriod.mockReset();
  mockGetLockedForexRateForClose.mockReset();
  mockGetVmiSoaBalanceForClose.mockReset();
  mockGenerateVmiPeriodNumber.mockReset();
});

// ---------------------------------------------------------------------------
// Pure functions — sumVmiStorageCharge (GAP 1) and computeBillingStatementTotal
// ---------------------------------------------------------------------------

describe("sumVmiStorageCharge (pure, GAP 1 — no D.1-D.7 module owns this sum)", () => {
  it("(AC: requirements.md FR-3.1) sums storageAmountUsd across every row", () => {
    expect(
      sumVmiStorageCharge([
        { storageAmountUsd: 39.6 },
        { storageAmountUsd: 40.1 },
      ]),
    ).toBeCloseTo(79.7, 4);
  });

  it("(AC: empty period) returns 0 for an empty row set", () => {
    expect(sumVmiStorageCharge([])).toBe(0);
  });

  it("(AC: tasks.md G.3 period sum) sums to $1,116.90 exactly for the real June fixture total", () => {
    // Not enumerating all 30 real daily rows — a two-row proxy summing to
    // the verified period total is sufficient to prove the sum function
    // itself; the per-day figures are C.2/C.3's own already-verified
    // concern (tasks.md C.3: "$39.60 exactly" for June 1).
    expect(
      sumVmiStorageCharge([
        { storageAmountUsd: 600.5 },
        { storageAmountUsd: 516.4 },
      ]),
    ).toBeCloseTo(1116.9, 4);
  });
});

describe("computeBillingStatementTotal (pure, requirements.md FR-6.1)", () => {
  const components = {
    storageChargeUsd: 1116.9,
    handlingInUsd: 220.05,
    handlingOutUsd: 368.14,
    documentationUsd: 420.0,
    deliveryUsd: 662.71,
    recurringFeesUsd: 236.0,
    adHocChargesUsd: 0,
    creditsAppliedUsd: 0,
  };

  it("(AC: FR-6.1, tasks.md G.7) sums every component and subtracts credits, reproducing $3,023.80 exactly for the June fixture", () => {
    expect(computeBillingStatementTotal(components)).toBeCloseTo(3023.8, 4);
  });

  it("(AC: FR-6.1 'clamped at 0') clamps at 0 when credits exceed the sum of every charge component, never returning a negative total", () => {
    expect(
      computeBillingStatementTotal({
        ...components,
        creditsAppliedUsd: 999999,
      }),
    ).toBe(0);
  });

  it("(AC: FR-6.1) a normal, non-clamped case with a partial credit subtracts it exactly", () => {
    expect(
      computeBillingStatementTotal({ ...components, creditsAppliedUsd: 100 }),
    ).toBeCloseTo(3023.8 - 100, 4);
  });
});

// ---------------------------------------------------------------------------
// closeVmiPeriod — orchestration
// ---------------------------------------------------------------------------

describe("closeVmiPeriod (tasks.md D.8, design.md §2.6 steps 1-7)", () => {
  // -------------------------------------------------------------------
  // 1. Duplicate-period guard (design.md §2.6 step 1, first half).
  // -------------------------------------------------------------------
  describe("duplicate-period guard (design.md §2.6 step 1)", () => {
    it(
      "(AC: design.md §2.6 step 1 — reject BEFORE any computation) rejects " +
        "with a clear error when a non-voided vmi_billing_periods row " +
        "already exists for this party/month, and calls no other module " +
        "and no db.insert at all",
      async () => {
        const db = createMockDb();
        db.select.mockImplementationOnce(() =>
          makeChain([
            {
              id: "existing-period-id",
              partyId: PARTY_ID,
              periodStartDate: "2026-07-01",
              periodEndDate: "2026-07-31",
              status: "issued",
            },
          ]),
        );
        wireHappyPathDefaults();

        await expect(closeVmiPeriod(db as never, baseRequest())).rejects.toThrow();

        expect(mockGetLockedForexRateForClose).not.toHaveBeenCalled();
        expect(mockGetVmiHandlingForPeriod).not.toHaveBeenCalled();
        expect(mockGetVmiChargeAggregationForPeriod).not.toHaveBeenCalled();
        expect(
          mockGetVmiRecurringFeeAggregationForPeriod,
        ).not.toHaveBeenCalled();
        expect(mockGetVmiSoaBalanceForClose).not.toHaveBeenCalled();
        expect(mockGenerateVmiPeriodNumber).not.toHaveBeenCalled();
        expect(db.insert).not.toHaveBeenCalled();
        // Exactly one select call — the guard query itself, nothing beyond it.
        expect(db.select).toHaveBeenCalledTimes(1);
      },
    );

    it(
      "(AC: a voided period does NOT block a new close — design.md §2.7's " +
        "void-and-reissue pattern) proceeds past the guard when the only " +
        "existing row for this party/month has status = 'voided'",
      async () => {
        const db = createMockDb();
        db.select
          .mockImplementationOnce(() =>
            makeChain([
              {
                id: "voided-period-id",
                partyId: PARTY_ID,
                periodStartDate: "2026-07-01",
                periodEndDate: "2026-07-31",
                status: "voided",
              },
            ]),
          )
          // storage-sum select
          .mockImplementationOnce(() => makeChain([]))
          // credits select
          .mockImplementationOnce(() => makeChain([]));
        wireHappyPathDefaults();

        const insertChain = makeChain([{ id: "new-period-id" }]);
        db.insert.mockImplementationOnce(() => insertChain);

        const result = await closeVmiPeriod(db as never, baseRequest());

        expect(result.status).toBe("draft");
        expect(db.insert).toHaveBeenCalledTimes(1);
      },
    );
  });

  // -------------------------------------------------------------------
  // 2. Missing forex rate (design.md §2.6 step 1, second half).
  // -------------------------------------------------------------------
  describe("missing forex rate (design.md §2.6 step 1/6, delegates to D.5)", () => {
    it(
      "(AC: requirements.md FR-6.2/FR-9.1, tasks.md G.10 'no forex rate for " +
        "close date | period close blocked, clear error') rejects when " +
        "getLockedForexRateForClose (D.5) rejects, with no partial insert " +
        "and no downstream computation",
      async () => {
        const db = createMockDb();
        db.select.mockImplementationOnce(() => makeChain([])); // duplicate guard: none
        mockGetLockedForexRateForClose.mockRejectedValue(
          new Error(
            "No forex_rates row found for effective_date = 2026-08-01.",
          ),
        );
        wireHappyPathDefaults();
        mockGetLockedForexRateForClose.mockRejectedValue(
          new Error(
            "No forex_rates row found for effective_date = 2026-08-01.",
          ),
        );

        await expect(closeVmiPeriod(db as never, baseRequest())).rejects.toThrow(
          /forex/i,
        );

        expect(db.insert).not.toHaveBeenCalled();
        expect(mockGetVmiHandlingForPeriod).not.toHaveBeenCalled();
        expect(mockGetVmiChargeAggregationForPeriod).not.toHaveBeenCalled();
        expect(
          mockGetVmiRecurringFeeAggregationForPeriod,
        ).not.toHaveBeenCalled();
        expect(mockGetVmiSoaBalanceForClose).not.toHaveBeenCalled();
        expect(mockGenerateVmiPeriodNumber).not.toHaveBeenCalled();
        // Only the duplicate-guard select ran; the storage-sum select (which
        // this orchestration sequences AFTER the forex lock) never ran.
        expect(db.select).toHaveBeenCalledTimes(1);
      },
    );
  });

  // -------------------------------------------------------------------
  // 3. Full computation wiring — D.1/D.3/D.4 called with correct scope,
  //    results correctly summed.
  // -------------------------------------------------------------------
  describe("full computation wiring (design.md §2.6 step 2)", () => {
    it(
      "(AC: design.md §2.6 step 2) calls D.1 (handling), D.3 " +
        "(documentation/delivery/ad-hoc), and D.4 (recurring fees) with the " +
        "correct partyId/periodStartDate/periodEndDate/lockedExchangeRatePhp " +
        "scope, and sums every component correctly into the stored charge fields",
      async () => {
        const db = createMockDb();
        db.select
          .mockImplementationOnce(() => makeChain([])) // duplicate guard
          .mockImplementationOnce(() =>
            makeChain([{ storageAmountUsd: "300.00" }, { storageAmountUsd: "200.00" }]),
          ) // storage sum -> 500
          .mockImplementationOnce(() => makeChain([])); // credits -> 0

        mockGetLockedForexRateForClose.mockResolvedValue({
          lockedExchangeRatePhp: 61.71,
          lockedExchangeRateDate: "2026-08-01",
        });
        mockGetVmiHandlingForPeriod.mockResolvedValue({
          handlingInUsd: 100,
          handlingOutUsd: 50,
          days: [],
        });
        mockGetVmiChargeAggregationForPeriod.mockResolvedValue({
          documentationUsd: 30,
          deliveryPhp: 1234.2,
          deliveryUsd: 20,
          adHocChargesUsd: 5,
        });
        mockGetVmiRecurringFeeAggregationForPeriod.mockResolvedValue({
          recurringFeesUsd: 75,
          lines: [],
        });
        mockGetVmiSoaBalanceForClose.mockResolvedValue({
          soaOpeningBalanceUsd: 0,
          soaPaymentsAppliedUsd: 0,
          soaClosingBalanceUsd: 780,
        });
        mockGenerateVmiPeriodNumber.mockResolvedValue("VMI-2026-07-ACME");

        const insertChain = makeChain([{ id: "new-period-id" }]);
        db.insert.mockImplementationOnce(() => insertChain);

        const result = await closeVmiPeriod(db as never, baseRequest());

        expect(mockGetVmiHandlingForPeriod).toHaveBeenCalledWith(
          expect.anything(),
          PARTY_ID,
          "2026-07-01",
          "2026-07-31",
        );
        expect(mockGetVmiChargeAggregationForPeriod).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            partyId: PARTY_ID,
            periodStartDate: "2026-07-01",
            periodEndDate: "2026-07-31",
            lockedExchangeRatePhp: 61.71,
          }),
        );
        expect(
          mockGetVmiRecurringFeeAggregationForPeriod,
        ).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            partyId: PARTY_ID,
            periodStartDate: "2026-07-01",
            periodEndDate: "2026-07-31",
            lockedExchangeRatePhp: 61.71,
          }),
        );

        expect(result.storageChargeUsd).toBeCloseTo(500, 4);
        expect(result.handlingInUsd).toBeCloseTo(100, 4);
        expect(result.handlingOutUsd).toBeCloseTo(50, 4);
        expect(result.documentationUsd).toBeCloseTo(30, 4);
        expect(result.deliveryUsd).toBeCloseTo(20, 4);
        expect(result.recurringFeesUsd).toBeCloseTo(75, 4);
        expect(result.adHocChargesUsd).toBeCloseTo(5, 4);
        // 500 + 100 + 50 + 30 + 20 + 75 + 5 - 0 = 780
        expect(result.billingStatementTotalUsd).toBeCloseTo(780, 4);
      },
    );
  });

  // -------------------------------------------------------------------
  // 4. credits_applied_usd (design.md §2.6 step 3, GAP 2 above).
  // -------------------------------------------------------------------
  describe("credits_applied_usd (design.md §2.6 step 3 — see GAP 2 header note)", () => {
    it(
      "(AC: design.md §2.6 step 3) sums only 'credit_memo'/'adjustment' " +
        "vmi_payments rows, excluding any 'payment'-type row defensively " +
        "even if one were present in the query result (defense-in-depth, " +
        "same precedent as vmi-charge-aggregation.ts's isWithinScope)",
      async () => {
        const db = createMockDb();
        db.select
          .mockImplementationOnce(() => makeChain([])) // duplicate guard
          .mockImplementationOnce(() => makeChain([])) // storage sum -> 0
          .mockImplementationOnce(() =>
            makeChain([
              { amountUsd: "150.0000", type: "credit_memo" },
              { amountUsd: "50.0000", type: "adjustment" },
              // Defensively must be excluded even though it should never be
              // returned by a correctly-scoped WHERE clause in production.
              { amountUsd: "9999.0000", type: "payment" },
            ]),
          );

        wireHappyPathDefaults();

        const insertChain = makeChain([{ id: "new-period-id" }]);
        db.insert.mockImplementationOnce(() => insertChain);

        const result = await closeVmiPeriod(db as never, baseRequest());

        expect(result.creditsAppliedUsd).toBeCloseTo(200, 4);
        expect(result.creditsAppliedUsd).not.toBeCloseTo(10199, 4);
      },
    );

    it(
      "(AC: design.md §2.6 step 4) subtracts credits_applied_usd from the " +
        "billing statement total",
      async () => {
        const db = createMockDb();
        db.select
          .mockImplementationOnce(() => makeChain([])) // duplicate guard
          .mockImplementationOnce(() => makeChain([{ storageAmountUsd: "1000.00" }])) // storage
          .mockImplementationOnce(() =>
            makeChain([{ amountUsd: "300.0000", type: "credit_memo" }]),
          ); // credits -> 300

        wireHappyPathDefaults();

        const insertChain = makeChain([{ id: "new-period-id" }]);
        db.insert.mockImplementationOnce(() => insertChain);

        const result = await closeVmiPeriod(db as never, baseRequest());

        expect(result.creditsAppliedUsd).toBeCloseTo(300, 4);
        expect(result.billingStatementTotalUsd).toBeCloseTo(700, 4); // 1000 - 300
      },
    );
  });

  // -------------------------------------------------------------------
  // 5. Clamped at 0 — end-to-end, not just the pure function.
  // -------------------------------------------------------------------
  it(
    "(AC: requirements.md FR-6.1 'clamped at 0', vmi_billing_periods CHECK " +
      "constraint) the INSERTed billing_statement_total_usd is never " +
      "negative even when credits exceed every charge component",
    async () => {
      const db = createMockDb();
      db.select
        .mockImplementationOnce(() => makeChain([])) // duplicate guard
        .mockImplementationOnce(() => makeChain([{ storageAmountUsd: "10.00" }])) // storage -> 10
        .mockImplementationOnce(() =>
          makeChain([{ amountUsd: "999999.0000", type: "credit_memo" }]),
        ); // huge credit

      wireHappyPathDefaults();

      const insertChain = makeChain([{ id: "new-period-id" }]);
      db.insert.mockImplementationOnce(() => insertChain);

      const result = await closeVmiPeriod(db as never, baseRequest());

      expect(result.billingStatementTotalUsd).toBe(0);
      const insertedValues = insertChain.values.mock.calls[0][0];
      expect(Number(insertedValues.billingStatementTotalUsd)).toBe(0);
    },
  );

  // -------------------------------------------------------------------
  // 6. The real June fixture, full assembly (tasks.md G.7).
  // -------------------------------------------------------------------
  it(
    "(AC: tasks.md G.7, requirements.md FR-6.3 — 'summing all nine of " +
      "June's real line items reproduces the statement's $3,023.80 grand " +
      "total exactly') the June 2026 fixture, fully assembled through " +
      "closeVmiPeriod's real orchestration/summation path, produces " +
      "billing_statement_total_usd = $3,023.80 exactly. NOTE: storage " +
      "($1,116.90), handling in/out ($220.05/$368.14), delivery ($662.71), " +
      "and recurring fees ($236.00 = $36 LOA + $0 surety bond + $200 " +
      "trucking admin + $0 manpower) are the exact figures independently " +
      "verified by tasks.md C.3/D.1/D.3/G.6. documentation_usd ($420.00) " +
      "and ad_hoc_charges_usd ($0.00) are NOT independently given anywhere " +
      "in tasks.md — they are solved by subtraction to reach the verified " +
      "$3,023.80 total (1116.90+220.05+368.14+662.71+236.00 = 2603.80; " +
      "3023.80-2603.80 = 420.00). Flagged here explicitly so this split is " +
      "never mistaken for an independently-sourced fixture figure the way " +
      "the other five components are.",
    async () => {
      const db = createMockDb();
      db.select
        .mockImplementationOnce(() => makeChain([])) // duplicate guard: none
        .mockImplementationOnce(() =>
          // Real per-day rows are C.2/C.3's own concern; a proxy set summing
          // to the verified $1,116.90 period total is sufficient here.
          makeChain([
            { storageAmountUsd: "600.50" },
            { storageAmountUsd: "516.40" },
          ]),
        )
        .mockImplementationOnce(() => makeChain([])); // credits: none this period

      mockGetLockedForexRateForClose.mockResolvedValue({
        lockedExchangeRatePhp: 61.71,
        lockedExchangeRateDate: "2026-07-01",
      });
      mockGetVmiHandlingForPeriod.mockResolvedValue({
        handlingInUsd: 220.05,
        handlingOutUsd: 368.14,
        days: [],
      });
      mockGetVmiChargeAggregationForPeriod.mockResolvedValue({
        documentationUsd: 420.0,
        deliveryPhp: 40896.0,
        deliveryUsd: 662.71,
        adHocChargesUsd: 0,
      });
      mockGetVmiRecurringFeeAggregationForPeriod.mockResolvedValue({
        recurringFeesUsd: 236.0,
        lines: [],
      });
      mockGetVmiSoaBalanceForClose.mockResolvedValue({
        soaOpeningBalanceUsd: 0,
        soaPaymentsAppliedUsd: 0,
        soaClosingBalanceUsd: 3023.8,
      });
      mockGenerateVmiPeriodNumber.mockResolvedValue("VMI-2026-06-ACME");

      const insertChain = makeChain([{ id: "june-period-id" }]);
      db.insert.mockImplementationOnce(() => insertChain);

      const result = await closeVmiPeriod(
        db as never,
        baseRequest({
          year: 2026,
          month: 6,
          periodStartDate: "2026-06-01",
          periodEndDate: "2026-06-30",
          generationDate: "2026-07-01",
        }),
      );

      expect(result.billingStatementTotalUsd).toBeCloseTo(3023.8, 2);

      const insertedValues = insertChain.values.mock.calls[0][0];
      expect(Number(insertedValues.billingStatementTotalUsd)).toBeCloseTo(
        3023.8,
        2,
      );
    },
  );

  // -------------------------------------------------------------------
  // 7. SOA wiring (D.6) — uses the just-computed billingStatementTotalUsd.
  // -------------------------------------------------------------------
  describe("SOA wiring (design.md §2.6 step 5, D.6)", () => {
    it(
      "(AC: design.md §2.6 step 5) calls getVmiSoaBalanceForClose with the " +
        "FRESHLY-computed billingStatementTotalUsd (not a stale/zero value), " +
        "the new period's own id, and periodStartDate as newPeriodStartDate, " +
        "then writes its three returned figures onto the inserted row unchanged",
      async () => {
        const db = createMockDb();
        db.select
          .mockImplementationOnce(() => makeChain([])) // duplicate guard
          .mockImplementationOnce(() => makeChain([{ storageAmountUsd: "1000.00" }]))
          .mockImplementationOnce(() => makeChain([])); // no credits

        wireHappyPathDefaults();
        mockGetVmiSoaBalanceForClose.mockResolvedValue({
          soaOpeningBalanceUsd: 3023.8,
          soaPaymentsAppliedUsd: 500,
          soaClosingBalanceUsd: 3523.8,
        });

        const insertChain = makeChain([{ id: "new-period-id" }]);
        db.insert.mockImplementationOnce(() => insertChain);

        const result = await closeVmiPeriod(db as never, baseRequest());

        expect(mockGetVmiSoaBalanceForClose).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            partyId: PARTY_ID,
            newPeriodStartDate: "2026-07-01",
            billingStatementTotalUsd: 1000, // this test's storage-only total
          }),
        );
        // The scope object passed to D.6 must carry a periodId string (the
        // application-generated new period id — see the GAP 2 header note).
        const soaCallArgs = mockGetVmiSoaBalanceForClose.mock.calls[0][1];
        expect(typeof soaCallArgs.periodId).toBe("string");
        expect(soaCallArgs.periodId.length).toBeGreaterThan(0);

        expect(result.soaOpeningBalanceUsd).toBeCloseTo(3023.8, 4);
        expect(result.soaPaymentsAppliedUsd).toBeCloseTo(500, 4);
        expect(result.soaClosingBalanceUsd).toBeCloseTo(3523.8, 4);
      },
    );
  });

  // -------------------------------------------------------------------
  // 8. Period number generation/uniqueness (D.7).
  // -------------------------------------------------------------------
  describe("period number generation (design.md §3/§2.7, D.7)", () => {
    it(
      "(AC: tasks.md D.7) calls generateVmiPeriodNumber with " +
        "{ partyCode, year, month, isCorrection: false } and writes its " +
        "returned string as the inserted period_number",
      async () => {
        const db = createMockDb();
        db.select
          .mockImplementationOnce(() => makeChain([]))
          .mockImplementationOnce(() => makeChain([]))
          .mockImplementationOnce(() => makeChain([]));
        wireHappyPathDefaults();
        mockGenerateVmiPeriodNumber.mockResolvedValue("VMI-2026-07-ACME");

        const insertChain = makeChain([{ id: "new-period-id" }]);
        db.insert.mockImplementationOnce(() => insertChain);

        const result = await closeVmiPeriod(db as never, baseRequest());

        expect(mockGenerateVmiPeriodNumber).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            partyCode: "ACME",
            year: 2026,
            month: 7,
            isCorrection: false,
          }),
        );
        expect(result.periodNumber).toBe("VMI-2026-07-ACME");
        const insertedValues = insertChain.values.mock.calls[0][0];
        expect(insertedValues.periodNumber).toBe("VMI-2026-07-ACME");
      },
    );

    it(
      "(AC: D.7 uniqueness — a collision is a hard rejection, never a " +
        "silently-mutated duplicate) propagates generateVmiPeriodNumber's " +
        "own collision rejection without ever reaching db.insert",
      async () => {
        const db = createMockDb();
        db.select
          .mockImplementationOnce(() => makeChain([]))
          .mockImplementationOnce(() => makeChain([]))
          .mockImplementationOnce(() => makeChain([]));
        wireHappyPathDefaults();
        mockGenerateVmiPeriodNumber.mockRejectedValue(
          new Error(
            "A vmi_billing_periods row with period_number = VMI-2026-07-ACME already exists.",
          ),
        );

        await expect(closeVmiPeriod(db as never, baseRequest())).rejects.toThrow(
          /already exists/i,
        );

        expect(db.insert).not.toHaveBeenCalled();
      },
    );
  });

  // -------------------------------------------------------------------
  // 9. Insert shape — status = 'draft', every computed field populated.
  // -------------------------------------------------------------------
  describe("insert shape (tasks.md D.8 — \"inserts vmi_billing_periods with status = 'draft'\")", () => {
    it(
      "(AC: tasks.md D.8/FR-9.1) inserts with status = 'draft' — NEVER " +
        "'issued' (that transition is D.9's, only after all four PDF " +
        "artifacts succeed) — and every computed field is present on the " +
        "inserted row",
      async () => {
        const db = createMockDb();
        db.select
          .mockImplementationOnce(() => makeChain([])) // duplicate guard
          .mockImplementationOnce(() =>
            makeChain([{ storageAmountUsd: "1116.90" }]),
          )
          .mockImplementationOnce(() => makeChain([])); // no credits

        mockGetLockedForexRateForClose.mockResolvedValue({
          lockedExchangeRatePhp: 61.71,
          lockedExchangeRateDate: "2026-08-01",
        });
        mockGetVmiHandlingForPeriod.mockResolvedValue({
          handlingInUsd: 220.05,
          handlingOutUsd: 368.14,
          days: [],
        });
        mockGetVmiChargeAggregationForPeriod.mockResolvedValue({
          documentationUsd: 420.0,
          deliveryPhp: 40896.0,
          deliveryUsd: 662.71,
          adHocChargesUsd: 0,
        });
        mockGetVmiRecurringFeeAggregationForPeriod.mockResolvedValue({
          recurringFeesUsd: 236.0,
          lines: [],
        });
        mockGetVmiSoaBalanceForClose.mockResolvedValue({
          soaOpeningBalanceUsd: 0,
          soaPaymentsAppliedUsd: 0,
          soaClosingBalanceUsd: 3023.8,
        });
        mockGenerateVmiPeriodNumber.mockResolvedValue("VMI-2026-07-ACME");

        const insertChain = makeChain([{ id: "new-period-id" }]);
        db.insert.mockImplementationOnce(() => insertChain);

        const result = await closeVmiPeriod(db as never, baseRequest());

        expect(result.status).toBe("draft");

        const insertedValues = insertChain.values.mock.calls[0][0];
        expect(insertedValues.status).toBe("draft");
        expect(insertedValues.status).not.toBe("issued");

        // Every computed field populated on the inserted row (design.md §1.6).
        for (const field of [
          "periodNumber",
          "partyId",
          "periodStartDate",
          "periodEndDate",
          "storageChargeUsd",
          "handlingInUsd",
          "handlingOutUsd",
          "documentationUsd",
          "deliveryUsd",
          "recurringFeesUsd",
          "adHocChargesUsd",
          "creditsAppliedUsd",
          "billingStatementTotalUsd",
          "soaOpeningBalanceUsd",
          "soaPaymentsAppliedUsd",
          "soaClosingBalanceUsd",
          "lockedExchangeRatePhp",
          "lockedExchangeRateDate",
          "billingCurrency",
        ]) {
          expect(insertedValues[field]).not.toBeUndefined();
        }

        // Never sets closedAt/closedByUserId — D.9's job, not D.8's.
        expect(insertedValues.closedAt).toBeUndefined();
        expect(insertedValues.closedByUserId).toBeUndefined();

        expect(Number(insertedValues.lockedExchangeRatePhp)).toBeCloseTo(
          61.71,
          4,
        );
        expect(insertedValues.billingCurrency).toBe("USD");
      },
    );
  });

  // -------------------------------------------------------------------
  // 10. Atomicity — a mid-pipeline failure leaves nothing committed.
  // -------------------------------------------------------------------
  describe(
    "atomicity (mirrors lib/actions/withdrawals.ts's established " +
      "'mid-loop failure leaves no partial commit' pattern, adapted for " +
      "this module's db-injected, non-withRlsTransaction shape — see the " +
      "header note on why D.8 does not use withRlsTransaction)",
    () => {
      it(
        "(AC: atomicity — a failure partway through D.1-D.7 must leave no " +
          "partial vmi_billing_periods row) rejects and never calls " +
          "db.insert when D.1 (handling) throws mid-pipeline, and never " +
          "reaches the downstream D.3/D.4/D.6/D.7 calls sequenced after it",
        async () => {
          const db = createMockDb();
          db.select
            .mockImplementationOnce(() => makeChain([])) // duplicate guard
            .mockImplementationOnce(() => makeChain([{ storageAmountUsd: "100.00" }])); // storage sum

          mockGetLockedForexRateForClose.mockResolvedValue({
            lockedExchangeRatePhp: 61.71,
            lockedExchangeRateDate: "2026-08-01",
          });
          mockGetVmiHandlingForPeriod.mockRejectedValue(
            new Error(
              "computeDailyHandling: no vmi_contract_terms version covers ledgerDate=2026-07-15",
            ),
          );

          await expect(
            closeVmiPeriod(db as never, baseRequest()),
          ).rejects.toThrow(/vmi_contract_terms/i);

          expect(db.insert).not.toHaveBeenCalled();
          expect(mockGetVmiChargeAggregationForPeriod).not.toHaveBeenCalled();
          expect(
            mockGetVmiRecurringFeeAggregationForPeriod,
          ).not.toHaveBeenCalled();
          expect(mockGetVmiSoaBalanceForClose).not.toHaveBeenCalled();
          expect(mockGenerateVmiPeriodNumber).not.toHaveBeenCalled();
        },
      );

      it(
        "(AC: atomicity — a failed INSERT itself must not resolve as " +
          "success) propagates the rejection when db.insert itself throws " +
          "(e.g. a real UNIQUE constraint race on period_number at the " +
          "Postgres tier — the DB-level backstop D.7's own module comment " +
          "names), never returning a { status: 'draft' } result for a row " +
          "that was never actually committed",
        async () => {
          const db = createMockDb();
          db.select
            .mockImplementationOnce(() => makeChain([]))
            .mockImplementationOnce(() => makeChain([]))
            .mockImplementationOnce(() => makeChain([]));
          wireHappyPathDefaults();

          db.insert.mockImplementationOnce(() => ({
            values: vi.fn(() => ({
              returning: vi.fn(() =>
                Promise.reject(
                  new Error(
                    'duplicate key value violates unique constraint "vmi_billing_periods_period_number_unique"',
                  ),
                ),
              ),
            })),
          }));

          await expect(
            closeVmiPeriod(db as never, baseRequest()),
          ).rejects.toThrow(/unique constraint/i);
        },
      );
    },
  );
});

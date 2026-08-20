// RED-step unit tests for lib/billing/vmi-daily-balance.ts (does not exist
// yet — Task C.2/C.3, lib/billing/__tests__ module).
//
// Traceability:
//   specs/12-vmi-billing/tasks.md Task Group C:
//     C.2 — "Implement the daily balance replay ... Computes beginning_cbm,
//       ending_cbm, IN/OUT split by category (FG/RAW_MATERIAL), per
//       design.md §2.2 steps 1-4."
//     C.3 — "Implement the storage-charge calculation, both timing modes ...
//       Resolves billed_balance_cbm from contract.billing_timing, resolves
//       applied_storage_rate_usd by looking up the vmi_contract_terms
//       version effective on ledger_date (design.md §2.2 step 6 — not simply
//       'the current row'), applies cbm_threshold_type (no-op when 'none'),
//       computes storage_amount_usd. Verified test: beginning_of_day, no
//       threshold, beginning_cbm = 792.02, rate = 0.05 -> $39.60 exactly."
//   specs/12-vmi-billing/design.md §2.2 (steps 1-6, the nightly-job
//     pseudocode this module implements as pure, DB-independent logic —
//     the CRON wiring itself is a separate task, C.4).
//   specs/12-vmi-billing/design.md §1.1 (vmi_contract_terms is an
//     effective-dated version history; "Any lookup that needs 'the rate in
//     effect on date X' ... queries WHERE party_id = :p AND
//     effective_from <= X AND (effective_to IS NULL OR effective_to > X) —
//     never 'the current row,' even when X happens to be today.") and §1.3
//     (vmi_daily_balance_ledger column shapes: beginningCbm, inboundCbmFg,
//     inboundCbmRawMaterial, outboundCbmFg, outboundCbmRawMaterial,
//     endingCbm, billedBalanceCbm, appliedStorageRateUsd, storageAmountUsd).
//   specs/12-vmi-billing/requirements.md FR-2 (daily balance replay) and
//     FR-3 (storage charge and optional threshold: `none` no-op,
//     `minimum_billable` floors billed_cbm at the threshold before pricing,
//     `included_allowance` splits pricing — within-threshold portion at
//     `storage_rate_per_cbm_day`, excess at `over_threshold_rate`).
//   specs/12-vmi-billing/tasks.md Task Group A, A.9 ("vmi_contract_terms
//     rate versioning") — the 2026-08-19 rewrite this module must honor: a
//     "read the contract fresh" / "current row" lookup is NOT point-in-time
//     safe against mid-period rate changes or backfilling a day after a
//     later rate change. This is C.6's (backfill utility) whole reason for
//     existing, and is tested explicitly below at this function's level.
//   specs/12-vmi-billing/tasks.md Task Group G:
//     G.1 — "Single party, beginning_of_day timing, day 1 (beginning_cbm =
//       792.02, rate 0.05) | storage_amount_usd = $39.60 exactly"; "Full
//       June fixture replayed day-by-day | ending_cbm after the last day =
//       686.24"; "Aggregate check | first_day_beginning_cbm + total_IN -
//       total_OUT = last_day_ending_cbm (792.02 + 157.18 - 262.96 = 686.24)";
//       "Storage rate changed mid-period ... Days before the change price at
//       the old rate, days on/after price at the new rate"; "Backfill a day
//       after a later rate change | Backfilled day resolves the
//       vmi_contract_terms version effective on *its own* date, not the
//       current/latest version".
//     G.3 — "cbm_threshold_type = 'none' ... no threshold logic invoked";
//       "'minimum_billable', balance below threshold | Billed at the
//       threshold floor, not the actual (lower) balance";
//       "'included_allowance', balance above threshold | Within-threshold
//       portion at base rate, excess at over_threshold_rate".
//     C.4/G.2 — CRON idempotency is owned by the CRON endpoint's
//       ON CONFLICT DO NOTHING (a separate task, not re-tested here); what
//       IS testable at this function's level is that the computation itself
//       is pure/deterministic for a given (party, date) input — no hidden
//       mutable state across calls, no mutation of caller-supplied inputs.
//
// Acceptance criteria covered (requirements.md FR-2, FR-3):
//   "Daily balance ledger replays inventory_transactions correctly for both
//   billing_timing modes and matches real June fixture data exactly."
//
// ---------------------------------------------------------------------------
// SCHEMA/DEPENDENCY VERIFICATION PERFORMED BEFORE WRITING THIS FILE:
//
//   lib/billing/vmi-movement-query.ts (Task C.1, already implemented):
//     Exports VmiMovementRow { id, direction: "IN"|"OUT",
//     category: "fg"|"raw_material"|"for_process"|"reject"|"re_inspect"|null,
//     cbm: number, partyId, movementType, qty, createdAt }. C.2 consumes
//     this shape directly — category is a straight pass-through here, never
//     re-derived from movementType a second time.
//
//   lib/db/schema/vmi_billing.ts (vmiContractTerms, vmiDailyBalanceLedger):
//     vmiContractTerms: storageRatePerCbmDay (decimal), billingTiming
//       ("beginning_of_day"|"end_of_day"), cbmThresholdType
//       ("none"|"minimum_billable"|"included_allowance"), cbmThreshold
//       (decimal, nullable), overThresholdRate (decimal, nullable),
//       effectiveFrom (timestamp, not null), effectiveTo (timestamp,
//       nullable = open-ended).
//     vmiDailyBalanceLedger: beginningCbm, inboundCbmFg,
//       inboundCbmRawMaterial, outboundCbmFg, outboundCbmRawMaterial,
//       endingCbm, billedBalanceCbm, appliedStorageRateUsd,
//       storageAmountUsd — all decimal, not null.
//
//   Only FG and RAW_MATERIAL categories are evidenced by the real fixture
//   and are the only two the vmi_daily_balance_ledger schema has columns
//   for (inboundCbmFg/inboundCbmRawMaterial/outboundCbmFg/
//   outboundCbmRawMaterial — no "other"/"uncategorized" CBM column exists
//   at this table). Per the assignment's explicit scope, this file tests
//   only those two categories; FOR_PROCESS/REJECT/RE_INSPECT/null-category
//   ledger-column mapping is a pre-existing, unaddressed gap in
//   design.md §1.3 and out of scope for C.2/C.3.
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/billing/vmi-daily-balance.ts (for
// backend-builder):
//
//   export type VmiBillingTiming = "beginning_of_day" | "end_of_day";
//   export type VmiCbmThresholdType =
//     "none" | "minimum_billable" | "included_allowance";
//
//   // One row of vmi_contract_terms, already scoped to a single party by
//   // the caller (this module does no party-scoping SQL itself — see C.1's
//   // precedent of a thin DB-facing layer feeding a pure compute layer).
//   export type VmiContractTermsVersion = {
//     id: string;
//     partyId: string;
//     storageRatePerCbmDay: number;
//     billingTiming: VmiBillingTiming;
//     cbmThresholdType: VmiCbmThresholdType;
//     cbmThreshold: number | null;
//     overThresholdRate: number | null;
//     effectiveFrom: Date;
//     effectiveTo: Date | null; // null = currently open-ended
//   };
//
//   export type VmiDailyMovementTotals = {
//     inFg: number;
//     inRawMaterial: number;
//     outFg: number;
//     outRawMaterial: number;
//   };
//
//   // design.md §2.2 step 3 — straight category pass-through/bucketing
//   // from C.1's shaped VmiMovementRow[], no re-derivation of direction or
//   // category from movementType.
//   export function sumMovementsByCategory(
//     movements: VmiMovementRow[],
//   ): VmiDailyMovementTotals;
//
//   // design.md §2.2 step 4: ending_cbm = beginning_cbm + (in_fg + in_raw)
//   // - (out_fg + out_raw)
//   export function computeEndingCbm(
//     beginningCbm: number,
//     totals: VmiDailyMovementTotals,
//   ): number;
//
//   // design.md §2.2 step 5: billed_balance_cbm = beginning_cbm if
//   // billing_timing = 'beginning_of_day' else ending_cbm.
//   export function resolveBilledBalanceCbm(
//     beginningCbm: number,
//     endingCbm: number,
//     billingTiming: VmiBillingTiming,
//   ): number;
//
//   // design.md §1.1 / §2.2 step 6: resolves whichever version was
//   // effective ON ledgerDate — WHERE effective_from <= ledgerDate AND
//   // (effective_to IS NULL OR effective_to > ledgerDate) — NOT simply the
//   // latest/current (effective_to IS NULL) row. Returns null if no version
//   // covers that date.
//   export function resolveContractTermsForDate(
//     versions: VmiContractTermsVersion[],
//     ledgerDate: string | Date,
//   ): VmiContractTermsVersion | null;
//
//   // requirements.md FR-3 / design.md §2.2 step 6's threshold sub-step.
//   // 'none': billedBalanceCbm unchanged, storageAmountUsd = billedBalanceCbm * rate.
//   // 'minimum_billable': billedBalanceCbm floored at cbmThreshold (FR-3.2:
//   //   "billed_cbm = MAX(billed_balance, cbm_threshold) before pricing"),
//   //   storageAmountUsd = flooredBilledBalanceCbm * rate.
//   // 'included_allowance': billedBalanceCbm unchanged (FR-3.3 does not
//   //   redefine billed_cbm, only splits pricing); storageAmountUsd =
//   //   MIN(billedBalanceCbm, cbmThreshold) * rate +
//   //   MAX(billedBalanceCbm - cbmThreshold, 0) * overThresholdRate.
//   export function applyCbmThresholdAndPrice(
//     billedBalanceCbm: number,
//     rate: number,
//     thresholdType: VmiCbmThresholdType,
//     threshold: number | null,
//     overThresholdRate: number | null,
//   ): { billedBalanceCbm: number; storageAmountUsd: number };
//
//   export type VmiDailyBalanceInput = {
//     partyId: string;
//     ledgerDate: string; // 'YYYY-MM-DD', Asia/Manila calendar date
//     previousEndingCbm: number | null; // null/undefined = no prior row -> 0
//     movements: VmiMovementRow[]; // already filtered to this single day
//     contractVersions: VmiContractTermsVersion[]; // this party's full version history
//   };
//
//   export type VmiDailyBalanceResult = {
//     partyId: string;
//     ledgerDate: string;
//     beginningCbm: number;
//     inboundCbmFg: number;
//     inboundCbmRawMaterial: number;
//     outboundCbmFg: number;
//     outboundCbmRawMaterial: number;
//     endingCbm: number;
//     billedBalanceCbm: number;
//     appliedStorageRateUsd: number;
//     storageAmountUsd: number;
//   };
//
//   // Orchestrates steps 1-6 (design.md §2.2). Pure — no DB access, no
//   // mutation of caller-supplied movements/contractVersions arrays, same
//   // input always produces the same output (C.4/G.2's idempotency
//   // precondition; the DB-level ON CONFLICT DO NOTHING is a separate,
//   // not-yet-implemented concern, C.4). Throws if no vmi_contract_terms
//   // version covers ledgerDate (appliedStorageRateUsd/storageAmountUsd are
//   // NOT NULL columns on vmi_daily_balance_ledger — there is no valid row
//   // to produce without a resolvable rate).
//   export function computeVmiDailyBalance(
//     input: VmiDailyBalanceInput,
//   ): VmiDailyBalanceResult;
//
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import {
  applyCbmThresholdAndPrice,
  computeEndingCbm,
  computeVmiDailyBalance,
  resolveBilledBalanceCbm,
  resolveContractTermsForDate,
  sumMovementsByCategory,
  type VmiContractTermsVersion,
} from "../vmi-daily-balance";
import type { VmiMovementRow } from "../vmi-movement-query";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function movementRow(overrides: Partial<VmiMovementRow> = {}): VmiMovementRow {
  return {
    id: "txn-1",
    direction: "IN",
    category: "fg",
    cbm: 1,
    partyId: "party-a",
    movementType: "receiving",
    qty: 1,
    createdAt: new Date("2026-06-01T00:00:00+08:00"),
    ...overrides,
  };
}

function contractVersion(
  overrides: Partial<VmiContractTermsVersion> = {},
): VmiContractTermsVersion {
  return {
    id: "contract-v1",
    partyId: "party-a",
    storageRatePerCbmDay: 0.05,
    billingTiming: "beginning_of_day",
    cbmThresholdType: "none",
    cbmThreshold: null,
    overThresholdRate: null,
    effectiveFrom: new Date("2026-01-01T00:00:00Z"),
    effectiveTo: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// sumMovementsByCategory — IN/OUT split by FG/RAW_MATERIAL, pass-through,
// no re-derivation (design.md §2.2 step 3; C.2)
// ---------------------------------------------------------------------------

describe("sumMovementsByCategory (C.2, design.md §2.2 step 3)", () => {
  it("(AC: C.2 step 3) sums IN movements into inFg/inRawMaterial by category, pass-through from the shaped rows", () => {
    const movements = [
      movementRow({ id: "m1", direction: "IN", category: "fg", cbm: 3 }),
      movementRow({ id: "m2", direction: "IN", category: "fg", cbm: 2 }),
      movementRow({ id: "m3", direction: "IN", category: "raw_material", cbm: 5 }),
    ];

    const totals = sumMovementsByCategory(movements);

    expect(totals.inFg).toBeCloseTo(5, 6);
    expect(totals.inRawMaterial).toBeCloseTo(5, 6);
    expect(totals.outFg).toBeCloseTo(0, 6);
    expect(totals.outRawMaterial).toBeCloseTo(0, 6);
  });

  it("(AC: C.2 step 3) sums OUT movements into outFg/outRawMaterial by category", () => {
    const movements = [
      movementRow({ id: "m1", direction: "OUT", category: "fg", cbm: 4 }),
      movementRow({ id: "m2", direction: "OUT", category: "raw_material", cbm: 1.5 }),
      movementRow({ id: "m3", direction: "OUT", category: "raw_material", cbm: 0.5 }),
    ];

    const totals = sumMovementsByCategory(movements);

    expect(totals.outFg).toBeCloseTo(4, 6);
    expect(totals.outRawMaterial).toBeCloseTo(2, 6);
    expect(totals.inFg).toBeCloseTo(0, 6);
    expect(totals.inRawMaterial).toBeCloseTo(0, 6);
  });

  it("(AC: category is a straight pass-through, never re-derived) does not reinterpret an already-resolved direction/category pair", () => {
    // A movement whose movementType would normally suggest something else
    // (e.g. 'pick') but whose direction/category have already been resolved
    // by C.1 — sumMovementsByCategory must trust direction/category as
    // given, not recompute from movementType.
    const movements = [
      movementRow({
        id: "m1",
        direction: "OUT",
        category: "raw_material",
        movementType: "pick",
        cbm: 7,
      }),
    ];

    const totals = sumMovementsByCategory(movements);

    expect(totals.outRawMaterial).toBeCloseTo(7, 6);
  });

  it("(AC: empty movement list) returns all-zero totals for an empty movements array", () => {
    const totals = sumMovementsByCategory([]);

    expect(totals).toEqual({ inFg: 0, inRawMaterial: 0, outFg: 0, outRawMaterial: 0 });
  });
});

// ---------------------------------------------------------------------------
// computeEndingCbm — design.md §2.2 step 4
// ---------------------------------------------------------------------------

describe("computeEndingCbm (C.2, design.md §2.2 step 4)", () => {
  it("(AC: ending_cbm = beginning_cbm + (in_fg+in_raw) - (out_fg+out_raw)) computes the exact formula", () => {
    const ending = computeEndingCbm(792.02, {
      inFg: 50,
      inRawMaterial: 20,
      outFg: 30,
      outRawMaterial: 10,
    });

    // 792.02 + (50 + 20) - (30 + 10) = 822.02
    expect(ending).toBeCloseTo(822.02, 4);
  });

  it("(AC: zero movement day) returns beginning_cbm unchanged when there is no IN/OUT movement", () => {
    const ending = computeEndingCbm(500, {
      inFg: 0,
      inRawMaterial: 0,
      outFg: 0,
      outRawMaterial: 0,
    });

    expect(ending).toBeCloseTo(500, 4);
  });
});

// ---------------------------------------------------------------------------
// beginning_cbm sourcing — design.md §2.2 steps 1-2, via computeVmiDailyBalance
// ---------------------------------------------------------------------------

describe("computeVmiDailyBalance — beginning_cbm sourcing (C.2, design.md §2.2 steps 1-2)", () => {
  it("(AC: beginning_cbm = yesterday's ending_cbm) uses previousEndingCbm as today's beginning_cbm", () => {
    const result = computeVmiDailyBalance({
      partyId: "party-a",
      ledgerDate: "2026-06-02",
      previousEndingCbm: 822.02,
      movements: [],
      contractVersions: [contractVersion()],
    });

    expect(result.beginningCbm).toBeCloseTo(822.02, 4);
  });

  it("(AC: beginning_cbm = 0 when no prior row exists) treats a null previousEndingCbm as a beginning_cbm of 0", () => {
    const result = computeVmiDailyBalance({
      partyId: "party-a",
      ledgerDate: "2026-06-01",
      previousEndingCbm: null,
      movements: [],
      contractVersions: [contractVersion()],
    });

    expect(result.beginningCbm).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// resolveBilledBalanceCbm — design.md §2.2 step 5
// ---------------------------------------------------------------------------

describe("resolveBilledBalanceCbm (C.3, design.md §2.2 step 5)", () => {
  it("(AC: billing_timing = 'beginning_of_day' selects beginning_cbm) resolves to beginningCbm", () => {
    const billed = resolveBilledBalanceCbm(792.02, 822.02, "beginning_of_day");
    expect(billed).toBeCloseTo(792.02, 4);
  });

  it("(AC: billing_timing = 'end_of_day' selects ending_cbm) resolves to endingCbm", () => {
    const billed = resolveBilledBalanceCbm(792.02, 822.02, "end_of_day");
    expect(billed).toBeCloseTo(822.02, 4);
  });

  it("(AC: the two timing modes diverge whenever the day has nonzero net movement) produces different billed balances for beginning_of_day vs end_of_day on the same day", () => {
    const beginningTiming = resolveBilledBalanceCbm(100, 150, "beginning_of_day");
    const endingTiming = resolveBilledBalanceCbm(100, 150, "end_of_day");

    expect(beginningTiming).not.toBe(endingTiming);
  });
});

// ---------------------------------------------------------------------------
// resolveContractTermsForDate — design.md §1.1 / §2.2 step 6. This is the
// core of the A.9 rewrite: resolves the version effective ON ledgerDate,
// never simply "the current/latest row" — critical for the backfill
// scenario (C.6's whole reason for existing).
// ---------------------------------------------------------------------------

describe("resolveContractTermsForDate (C.3, design.md §1.1/§2.2 step 6, tasks.md A.9)", () => {
  const oldVersion = contractVersion({
    id: "v1-old",
    storageRatePerCbmDay: 0.05,
    effectiveFrom: new Date("2026-01-01T00:00:00Z"),
    effectiveTo: new Date("2026-06-15T00:00:00Z"),
  });
  const newVersion = contractVersion({
    id: "v2-new",
    storageRatePerCbmDay: 0.08,
    effectiveFrom: new Date("2026-06-15T00:00:00Z"),
    effectiveTo: null,
  });
  const versions = [oldVersion, newVersion];

  it("(AC: resolves the version open on a date within its range) resolves a date before the rate change to the old version", () => {
    const resolved = resolveContractTermsForDate(versions, "2026-06-05");
    expect(resolved?.id).toBe("v1-old");
    expect(resolved?.storageRatePerCbmDay).toBe(0.05);
  });

  it("(AC: resolves a date after the rate change to the new version) resolves a date after the boundary to the new version", () => {
    const resolved = resolveContractTermsForDate(versions, "2026-06-20");
    expect(resolved?.id).toBe("v2-new");
    expect(resolved?.storageRatePerCbmDay).toBe(0.08);
  });

  it("(AC: effective_from is inclusive, effective_to is exclusive) resolves the exact boundary date to the NEW version, not the old one", () => {
    const resolved = resolveContractTermsForDate(versions, "2026-06-15");
    expect(resolved?.id).toBe("v2-new");
  });

  it("(AC: THE central A.9 backfill-correctness case) resolves a PAST date to the rate that was actually in effect on that date, not the current/latest version, even though the latest version is the one with effective_to = null", () => {
    // Simulates backfilling June 5 (design.md §2.2 step 6's "backfill after a
    // later rate change" scenario) — a naive "read vmi_contract_terms.effective_to
    // IS NULL" (current row) lookup would incorrectly return newVersion
    // (0.08) here. The correct, version-history-aware lookup must return
    // oldVersion (0.05), because that's what was actually in effect on
    // 2026-06-05.
    const backfillDate = "2026-06-05";
    const resolved = resolveContractTermsForDate(versions, backfillDate);

    expect(resolved?.id).not.toBe(newVersion.id);
    expect(resolved?.id).toBe(oldVersion.id);
    expect(resolved?.storageRatePerCbmDay).toBe(0.05);

    // Proves it's not just "the array's last element" or "first element"
    // either — same assertion holds when version order is reversed.
    const reversedOrderResolved = resolveContractTermsForDate(
      [newVersion, oldVersion],
      backfillDate,
    );
    expect(reversedOrderResolved?.id).toBe(oldVersion.id);
  });

  it("(AC: no version covers the given date) returns null when no version's effective range covers the date", () => {
    const resolved = resolveContractTermsForDate(versions, "2025-12-31");
    expect(resolved).toBeNull();
  });

  it("(AC: open-ended version covers all dates from effective_from onward) resolves a far-future date to the still-open version", () => {
    const resolved = resolveContractTermsForDate(versions, "2030-01-01");
    expect(resolved?.id).toBe("v2-new");
  });
});

// ---------------------------------------------------------------------------
// applyCbmThresholdAndPrice — requirements.md FR-3, three-mode matrix
// (tasks.md G.3)
// ---------------------------------------------------------------------------

describe("applyCbmThresholdAndPrice (C.3, requirements.md FR-3, tasks.md G.3)", () => {
  it("(AC: FR-3.4 / G.3 'none' — no threshold logic invoked) prices billed_balance_cbm x rate exactly, threshold fields ignored", () => {
    const result = applyCbmThresholdAndPrice(792.02, 0.05, "none", null, null);

    expect(result.billedBalanceCbm).toBeCloseTo(792.02, 4);
    // 792.02 * 0.05 = 39.601, which is the real verified $39.60 figure at
    // 2-decimal currency precision (design.md §2.2, tasks.md G.1/G.3).
    expect(result.storageAmountUsd).toBeCloseTo(39.6, 2);
  });

  it("(AC: FR-3.2 / G.3 'minimum_billable', balance below threshold — billed at the floor) floors billed_balance_cbm at cbm_threshold before pricing", () => {
    // Actual balance (50) is below the threshold (100) -> billed at the
    // 100 cbm floor, not the true 50.
    const result = applyCbmThresholdAndPrice(50, 2, "minimum_billable", 100, null);

    expect(result.billedBalanceCbm).toBe(100);
    expect(result.storageAmountUsd).toBeCloseTo(200, 4); // 100 * 2
  });

  it("(AC: FR-3.2 'minimum_billable', balance above threshold — no floor applied) prices the actual balance when it already exceeds the threshold", () => {
    const result = applyCbmThresholdAndPrice(150, 2, "minimum_billable", 100, null);

    expect(result.billedBalanceCbm).toBe(150);
    expect(result.storageAmountUsd).toBeCloseTo(300, 4); // 150 * 2
  });

  it("(AC: FR-3.3 / G.3 'included_allowance', balance above threshold — split pricing) prices the within-threshold portion at the base rate and the excess at over_threshold_rate", () => {
    // 100 cbm within-threshold at 0.05, 50 cbm excess at 0.08.
    const result = applyCbmThresholdAndPrice(150, 0.05, "included_allowance", 100, 0.08);

    // 100 * 0.05 + 50 * 0.08 = 5 + 4 = 9
    expect(result.storageAmountUsd).toBeCloseTo(9, 6);
  });

  it("(AC: FR-3.3 'included_allowance', balance at or below threshold — no excess) prices the whole balance at the base rate when it does not exceed the threshold", () => {
    const result = applyCbmThresholdAndPrice(80, 0.05, "included_allowance", 100, 0.08);

    expect(result.storageAmountUsd).toBeCloseTo(4, 6); // 80 * 0.05, no excess tier
  });
});

// ---------------------------------------------------------------------------
// computeVmiDailyBalance — the day-1 real-data regression case
// (design.md §2.2, tasks.md C.3/G.1/G.3: "$39.60 exactly")
// ---------------------------------------------------------------------------

describe("computeVmiDailyBalance — verified day-1 regression (C.2/C.3, design.md §2.2, tasks.md G.1/G.3)", () => {
  it("(AC: beginning_of_day, no threshold, beginning_cbm=792.02, rate=0.05 -> $39.60 exactly) reproduces the real June 1 storage_amount_usd figure", () => {
    const result = computeVmiDailyBalance({
      partyId: "party-a",
      ledgerDate: "2026-06-01",
      previousEndingCbm: 792.02, // real June 1 beginning balance (carried from May 31)
      movements: [],
      contractVersions: [
        contractVersion({
          storageRatePerCbmDay: 0.05,
          billingTiming: "beginning_of_day",
          cbmThresholdType: "none",
        }),
      ],
    });

    expect(result.beginningCbm).toBeCloseTo(792.02, 4);
    expect(result.billedBalanceCbm).toBeCloseTo(792.02, 4);
    expect(result.appliedStorageRateUsd).toBe(0.05);
    expect(result.storageAmountUsd).toBeCloseTo(39.6, 2);
  });
});

// ---------------------------------------------------------------------------
// computeVmiDailyBalance — full multi-day replay reproducing the verified
// aggregate identity (tasks.md G.1: "792.02 + 157.18 - 262.96 = 686.24").
//
// Note: the real June per-day breakdown is not available as structured raw
// data in specs/ (only the period aggregates — total IN 157.18, total OUT
// 262.96, first-day beginning 792.02, last-day ending 686.24 — are recorded,
// per requirements.md FR-2.4/tasks.md G.1). This 3-day fixture is
// synthetic but is constructed to sum to exactly those verified real
// figures, so it genuinely exercises day-by-day replay (each day's
// beginning_cbm literally carried from the previous day's computed
// ending_cbm, not just arithmetic on the totals) while still reproducing
// the real regression numbers. Exact reproduction of the full period's
// $1,116.90 storage total (tasks.md G.3 "Period sum") requires the actual
// complete daily dataset and is deferred to integration-level testing
// against real Postgres with the real fixture loaded, per
// specs/00-steering/testing.md's two-stage strategy — not fabricated here.
// ---------------------------------------------------------------------------

describe("computeVmiDailyBalance — full fixture day-by-day replay (C.2, tasks.md G.1)", () => {
  const contract = contractVersion({
    storageRatePerCbmDay: 0.05,
    billingTiming: "beginning_of_day",
    cbmThresholdType: "none",
  });

  function movementsFor(
    day: string,
    inFg: number,
    inRaw: number,
    outFg: number,
    outRaw: number,
  ): VmiMovementRow[] {
    const rows: VmiMovementRow[] = [];
    if (inFg) rows.push(movementRow({ id: `${day}-in-fg`, direction: "IN", category: "fg", cbm: inFg }));
    if (inRaw) rows.push(movementRow({ id: `${day}-in-raw`, direction: "IN", category: "raw_material", cbm: inRaw }));
    if (outFg) rows.push(movementRow({ id: `${day}-out-fg`, direction: "OUT", category: "fg", cbm: outFg }));
    if (outRaw) rows.push(movementRow({ id: `${day}-out-raw`, direction: "OUT", category: "raw_material", cbm: outRaw }));
    return rows;
  }

  it("(AC: ending_cbm after the last replayed day = 686.24, aggregate identity holds) replays 3 days with beginning_cbm carried day-to-day and reproduces the verified totals", () => {
    // Day 1: beginning 792.02 (carried from a prior, already-computed row —
    // simulating May 31). IN 70 (50 fg + 20 raw), OUT 40 (30 fg + 10 raw).
    const day1 = computeVmiDailyBalance({
      partyId: "party-a",
      ledgerDate: "2026-06-01",
      previousEndingCbm: 792.02,
      movements: movementsFor("d1", 50, 20, 30, 10),
      contractVersions: [contract],
    });
    expect(day1.beginningCbm).toBeCloseTo(792.02, 4);
    expect(day1.endingCbm).toBeCloseTo(822.02, 4); // 792.02 + 70 - 40

    // Day 2: beginning = day 1's ending (822.02). IN 40 (25 fg + 15 raw),
    // OUT 100 (70 fg + 30 raw).
    const day2 = computeVmiDailyBalance({
      partyId: "party-a",
      ledgerDate: "2026-06-02",
      previousEndingCbm: day1.endingCbm,
      movements: movementsFor("d2", 25, 15, 70, 30),
      contractVersions: [contract],
    });
    expect(day2.beginningCbm).toBeCloseTo(822.02, 4);
    expect(day2.endingCbm).toBeCloseTo(762.02, 4); // 822.02 + 40 - 100

    // Day 3: beginning = day 2's ending (762.02). IN 47.18 (27.18 fg + 20
    // raw), OUT 122.96 (80 fg + 42.96 raw).
    const day3 = computeVmiDailyBalance({
      partyId: "party-a",
      ledgerDate: "2026-06-03",
      previousEndingCbm: day2.endingCbm,
      movements: movementsFor("d3", 27.18, 20, 80, 42.96),
      contractVersions: [contract],
    });
    expect(day3.beginningCbm).toBeCloseTo(762.02, 4);

    // The verified real regression figure (tasks.md G.1):
    expect(day3.endingCbm).toBeCloseTo(686.24, 4);

    // Aggregate identity check (tasks.md G.1):
    // first_day_beginning_cbm + total_IN - total_OUT = last_day_ending_cbm
    const totalIn = 70 + 40 + 47.18; // 157.18
    const totalOut = 40 + 100 + 122.96; // 262.96
    expect(totalIn).toBeCloseTo(157.18, 4);
    expect(totalOut).toBeCloseTo(262.96, 4);
    expect(day1.beginningCbm + totalIn - totalOut).toBeCloseTo(686.24, 4);
    expect(day1.beginningCbm + totalIn - totalOut).toBeCloseTo(day3.endingCbm, 4);
  });
});

// ---------------------------------------------------------------------------
// computeVmiDailyBalance — mid-period rate change / backfill, at the
// full-orchestration level (tasks.md G.1, A.9)
// ---------------------------------------------------------------------------

describe("computeVmiDailyBalance — mid-period rate change resolves per-day, not per 'current' contract (C.3, tasks.md G.1/A.9)", () => {
  const oldVersion = contractVersion({
    id: "v1-old",
    storageRatePerCbmDay: 0.05,
    effectiveFrom: new Date("2026-01-01T00:00:00Z"),
    effectiveTo: new Date("2026-06-15T00:00:00Z"),
  });
  const newVersion = contractVersion({
    id: "v2-new",
    storageRatePerCbmDay: 0.08,
    effectiveFrom: new Date("2026-06-15T00:00:00Z"),
    effectiveTo: null,
  });
  const versions = [oldVersion, newVersion];

  it("(AC: a day before the rate change prices at the old rate) applies the pre-change rate for a ledgerDate before effective_to", () => {
    const result = computeVmiDailyBalance({
      partyId: "party-a",
      ledgerDate: "2026-06-10",
      previousEndingCbm: 1000,
      movements: [],
      contractVersions: versions,
    });

    expect(result.appliedStorageRateUsd).toBe(0.05);
    expect(result.storageAmountUsd).toBeCloseTo(50, 4); // 1000 * 0.05
  });

  it("(AC: a day on/after the rate change prices at the new rate) applies the post-change rate for a ledgerDate on/after the new version's effective_from", () => {
    const result = computeVmiDailyBalance({
      partyId: "party-a",
      ledgerDate: "2026-06-20",
      previousEndingCbm: 1000,
      movements: [],
      contractVersions: versions,
    });

    expect(result.appliedStorageRateUsd).toBe(0.08);
    expect(result.storageAmountUsd).toBeCloseTo(80, 4); // 1000 * 0.08
  });

  it("(AC: THE A.9 backfill-correctness case at the orchestration level) backfilling a day BEFORE the rate change, computed after the new version already exists, still prices at the rate that was actually in effect on that date — not the current/latest version", () => {
    // The presence of newVersion (the 'current' open-ended row) in
    // contractVersions must NOT influence a backfilled day whose ledgerDate
    // predates it. This is exactly the scenario design.md §2.2 step 6 and
    // tasks.md A.9/C.6 describe: a day backfilled after a later rate change
    // resolves to the rate in effect on ITS OWN date.
    const backfillResult = computeVmiDailyBalance({
      partyId: "party-a",
      ledgerDate: "2026-06-05", // before the 2026-06-15 rate change
      previousEndingCbm: 792.02,
      movements: [],
      contractVersions: versions, // both versions present, including the newer 'current' one
    });

    expect(backfillResult.appliedStorageRateUsd).toBe(0.05); // old rate, not 0.08
    expect(backfillResult.appliedStorageRateUsd).not.toBe(newVersion.storageRatePerCbmDay);
    expect(backfillResult.storageAmountUsd).toBeCloseTo(792.02 * 0.05, 4);
  });

  it("(AC: no contract version covers ledgerDate) throws rather than silently producing a row with no resolvable rate", () => {
    expect(() =>
      computeVmiDailyBalance({
        partyId: "party-a",
        ledgerDate: "2025-01-01", // before any version's effective_from
        previousEndingCbm: 0,
        movements: [],
        contractVersions: versions,
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Purity / determinism — C.4/G.2's idempotency precondition, testable at
// this function's level (the DB-level ON CONFLICT DO NOTHING behavior
// itself is C.4's concern, not re-tested here).
// ---------------------------------------------------------------------------

describe("computeVmiDailyBalance — purity/determinism (C.4/G.2 precondition, not the DB-level idempotency itself)", () => {
  it("(AC: same input always produces the same output) returns deep-equal results for two calls with identical (party, date) input", () => {
    const input = {
      partyId: "party-a",
      ledgerDate: "2026-06-01",
      previousEndingCbm: 792.02,
      movements: [
        movementRow({ id: "m1", direction: "IN", category: "fg", cbm: 10 }),
        movementRow({ id: "m2", direction: "OUT", category: "raw_material", cbm: 4 }),
      ],
      contractVersions: [contractVersion()],
    };

    const first = computeVmiDailyBalance(input);
    const second = computeVmiDailyBalance(input);

    expect(second).toEqual(first);
  });

  it("(AC: no hidden mutable state across calls) computing a second, different party/date in between does not change the result of a repeated first call", () => {
    const inputA = {
      partyId: "party-a",
      ledgerDate: "2026-06-01",
      previousEndingCbm: 100,
      movements: [movementRow({ id: "a1", direction: "IN", category: "fg", cbm: 5 })],
      contractVersions: [contractVersion()],
    };
    const inputB = {
      partyId: "party-b",
      ledgerDate: "2026-06-02",
      previousEndingCbm: 999,
      movements: [movementRow({ id: "b1", direction: "OUT", category: "raw_material", cbm: 3 })],
      contractVersions: [contractVersion({ partyId: "party-b", storageRatePerCbmDay: 0.09 })],
    };

    const firstA = computeVmiDailyBalance(inputA);
    computeVmiDailyBalance(inputB); // interleaved call for a different party/date
    const secondA = computeVmiDailyBalance(inputA);

    expect(secondA).toEqual(firstA);
  });

  it("(AC: does not mutate caller-supplied inputs) does not mutate or reorder the movements array passed in", () => {
    const movements = [
      movementRow({ id: "m1", direction: "IN", category: "fg", cbm: 6 }),
      movementRow({ id: "m2", direction: "OUT", category: "raw_material", cbm: 2 }),
    ];
    const movementsSnapshot = JSON.parse(JSON.stringify(movements));
    Object.freeze(movements); // any attempted in-place mutation will throw

    expect(() =>
      computeVmiDailyBalance({
        partyId: "party-a",
        ledgerDate: "2026-06-01",
        previousEndingCbm: 0,
        movements,
        contractVersions: [contractVersion()],
      }),
    ).not.toThrow();

    expect(JSON.parse(JSON.stringify(movements))).toEqual(movementsSnapshot);
  });
});

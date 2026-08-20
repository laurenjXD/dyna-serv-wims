// VMI daily balance replay + storage-charge calculation — specs/12-vmi-billing
// Task C.2 (daily balance replay) and C.3 (storage-charge calculation).
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
//       computes storage_amount_usd."
//   specs/12-vmi-billing/design.md §2.2 (steps 1-6) and §1.1
//     (vmi_contract_terms effective-dated version-history lookup rule:
//     `effective_from <= X AND (effective_to IS NULL OR effective_to > X)`,
//     never "the current row").
//   specs/12-vmi-billing/requirements.md FR-2 (daily balance replay) and
//     FR-3 (storage charge and optional threshold).
//   specs/12-vmi-billing/tasks.md A.9 ("vmi_contract_terms rate versioning")
//     — the whole reason this module resolves contract terms by date rather
//     than reading "the current row."
//
// This module is a pure computation layer — no DB access, no mutation of
// caller-supplied inputs. The CRON wiring (C.4) and backfill utility (C.6)
// are separate, DB-facing callers of computeVmiDailyBalance.
//
// Money/decimal note: unlike lib/billing/trading-margin-calc.ts, this
// module's public contract (per the test suite / Task C.2-C.3 spec) uses
// plain `number` for all CBM and currency fields, not decimal strings —
// vmi_contract_terms/vmi_daily_balance_ledger values arrive here already
// deserialized as numbers by the caller. Given a `number`-in/`number`-out
// contract, standard IEEE-754 arithmetic is used directly; there is no
// decimal-string round-trip to protect here the way trading-margin-calc.ts
// protects one. Storage amounts are not rounded to a fixed display scale
// inside this module — that is left to the caller/persistence layer
// (vmi_daily_balance_ledger.storage_amount_usd is `decimal(14,4)`).

import type { VmiMovementRow } from "./vmi-movement-query";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type VmiBillingTiming = "beginning_of_day" | "end_of_day";
export type VmiCbmThresholdType =
  | "none"
  | "minimum_billable"
  | "included_allowance";

// One row of vmi_contract_terms, already scoped to a single party by the
// caller (this module does no party-scoping SQL itself — mirrors C.1's
// precedent of a thin DB-facing layer feeding a pure compute layer).
export type VmiContractTermsVersion = {
  id: string;
  partyId: string;
  storageRatePerCbmDay: number;
  billingTiming: VmiBillingTiming;
  cbmThresholdType: VmiCbmThresholdType;
  cbmThreshold: number | null;
  overThresholdRate: number | null;
  effectiveFrom: Date;
  effectiveTo: Date | null; // null = currently open-ended
};

export type VmiDailyMovementTotals = {
  inFg: number;
  inRawMaterial: number;
  outFg: number;
  outRawMaterial: number;
};

export type VmiDailyBalanceInput = {
  partyId: string;
  ledgerDate: string; // 'YYYY-MM-DD', Asia/Manila calendar date
  previousEndingCbm: number | null; // null/undefined = no prior row -> 0
  movements: VmiMovementRow[]; // already filtered to this single day
  contractVersions: VmiContractTermsVersion[]; // this party's full version history
};

export type VmiDailyBalanceResult = {
  partyId: string;
  ledgerDate: string;
  beginningCbm: number;
  inboundCbmFg: number;
  inboundCbmRawMaterial: number;
  outboundCbmFg: number;
  outboundCbmRawMaterial: number;
  endingCbm: number;
  billedBalanceCbm: number;
  appliedStorageRateUsd: number;
  storageAmountUsd: number;
};

// ---------------------------------------------------------------------------
// sumMovementsByCategory — design.md §2.2 step 3. Straight category
// pass-through/bucketing from C.1's shaped VmiMovementRow[]; direction and
// category are trusted as already-resolved, never re-derived from
// movementType here.
// ---------------------------------------------------------------------------

export function sumMovementsByCategory(
  movements: VmiMovementRow[],
): VmiDailyMovementTotals {
  const totals: VmiDailyMovementTotals = {
    inFg: 0,
    inRawMaterial: 0,
    outFg: 0,
    outRawMaterial: 0,
  };

  for (const movement of movements) {
    if (movement.direction === "IN") {
      if (movement.category === "fg") {
        totals.inFg += movement.cbm;
      } else if (movement.category === "raw_material") {
        totals.inRawMaterial += movement.cbm;
      }
      // Other categories (for_process/reject/re_inspect/null) are
      // intentionally not bucketed here — vmi_daily_balance_ledger has no
      // column for them; see the test file's schema note.
    } else {
      if (movement.category === "fg") {
        totals.outFg += movement.cbm;
      } else if (movement.category === "raw_material") {
        totals.outRawMaterial += movement.cbm;
      }
    }
  }

  return totals;
}

// ---------------------------------------------------------------------------
// computeEndingCbm — design.md §2.2 step 4:
//   ending_cbm = beginning_cbm + (in_fg + in_raw) - (out_fg + out_raw)
// ---------------------------------------------------------------------------

export function computeEndingCbm(
  beginningCbm: number,
  totals: VmiDailyMovementTotals,
): number {
  return (
    beginningCbm +
    (totals.inFg + totals.inRawMaterial) -
    (totals.outFg + totals.outRawMaterial)
  );
}

// ---------------------------------------------------------------------------
// resolveBilledBalanceCbm — design.md §2.2 step 5:
//   billed_balance_cbm = beginning_cbm if billing_timing = 'beginning_of_day'
//   else ending_cbm.
// ---------------------------------------------------------------------------

export function resolveBilledBalanceCbm(
  beginningCbm: number,
  endingCbm: number,
  billingTiming: VmiBillingTiming,
): number {
  return billingTiming === "beginning_of_day" ? beginningCbm : endingCbm;
}

// ---------------------------------------------------------------------------
// resolveContractTermsForDate — design.md §1.1 / §2.2 step 6, tasks.md A.9.
//
// Resolves whichever version was effective ON ledgerDate:
//   WHERE effective_from <= ledgerDate
//     AND (effective_to IS NULL OR effective_to > ledgerDate)
//
// This is NEVER "the current/latest (effective_to IS NULL) row" — that is
// exactly the bug this version-history model exists to prevent, most
// visibly when backfilling a past date after a later rate change has
// already been recorded (tasks.md A.9/C.6).
// ---------------------------------------------------------------------------

export function resolveContractTermsForDate(
  versions: VmiContractTermsVersion[],
  ledgerDate: string | Date,
): VmiContractTermsVersion | null {
  const dateMs =
    typeof ledgerDate === "string"
      ? new Date(ledgerDate).getTime()
      : ledgerDate.getTime();

  for (const version of versions) {
    const startsOnOrBefore = version.effectiveFrom.getTime() <= dateMs;
    const endsAfter =
      version.effectiveTo === null || version.effectiveTo.getTime() > dateMs;

    if (startsOnOrBefore && endsAfter) {
      return version;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// applyCbmThresholdAndPrice — requirements.md FR-3 / design.md §2.2 step 6's
// threshold sub-step.
//
//   'none': billedBalanceCbm unchanged, storageAmountUsd = billedBalanceCbm * rate.
//   'minimum_billable': billedBalanceCbm floored at cbmThreshold (FR-3.2:
//     billed_cbm = MAX(billed_balance, cbm_threshold) before pricing),
//     storageAmountUsd = flooredBilledBalanceCbm * rate.
//   'included_allowance': billedBalanceCbm unchanged (FR-3.3 does not
//     redefine billed_cbm, only splits pricing); storageAmountUsd =
//     MIN(billedBalanceCbm, cbmThreshold) * rate +
//     MAX(billedBalanceCbm - cbmThreshold, 0) * overThresholdRate.
// ---------------------------------------------------------------------------

export function applyCbmThresholdAndPrice(
  billedBalanceCbm: number,
  rate: number,
  thresholdType: VmiCbmThresholdType,
  threshold: number | null,
  overThresholdRate: number | null,
): { billedBalanceCbm: number; storageAmountUsd: number } {
  if (thresholdType === "none") {
    return {
      billedBalanceCbm,
      storageAmountUsd: billedBalanceCbm * rate,
    };
  }

  if (thresholdType === "minimum_billable") {
    const flooredBilledBalanceCbm =
      threshold !== null
        ? Math.max(billedBalanceCbm, threshold)
        : billedBalanceCbm;

    return {
      billedBalanceCbm: flooredBilledBalanceCbm,
      storageAmountUsd: flooredBilledBalanceCbm * rate,
    };
  }

  // 'included_allowance'
  if (threshold === null) {
    // No threshold configured despite the mode — degrade to flat pricing
    // rather than throwing, mirroring 'none' behavior.
    return {
      billedBalanceCbm,
      storageAmountUsd: billedBalanceCbm * rate,
    };
  }

  const withinThresholdCbm = Math.min(billedBalanceCbm, threshold);
  const excessCbm = Math.max(billedBalanceCbm - threshold, 0);
  const effectiveOverThresholdRate = overThresholdRate ?? rate;

  const storageAmountUsd =
    withinThresholdCbm * rate + excessCbm * effectiveOverThresholdRate;

  return {
    billedBalanceCbm,
    storageAmountUsd,
  };
}

// ---------------------------------------------------------------------------
// computeVmiDailyBalance — orchestrates steps 1-6 (design.md §2.2). Pure —
// no DB access, no mutation of caller-supplied movements/contractVersions
// arrays, same input always produces the same output (C.4/G.2's idempotency
// precondition; DB-level ON CONFLICT DO NOTHING is C.4's separate concern).
//
// Throws if no vmi_contract_terms version covers ledgerDate —
// appliedStorageRateUsd/storageAmountUsd are NOT NULL columns on
// vmi_daily_balance_ledger, so there is no valid row to produce without a
// resolvable rate.
// ---------------------------------------------------------------------------

export function computeVmiDailyBalance(
  input: VmiDailyBalanceInput,
): VmiDailyBalanceResult {
  const beginningCbm = input.previousEndingCbm ?? 0;

  // Steps 3-4: sum movements and compute ending CBM.
  const totals = sumMovementsByCategory(input.movements);
  const endingCbm = computeEndingCbm(beginningCbm, totals);

  // Step 6 (rate resolution): resolve the contract terms version effective
  // on this specific ledgerDate — never "the current row."
  const contract = resolveContractTermsForDate(
    input.contractVersions,
    input.ledgerDate,
  );

  if (!contract) {
    throw new Error(
      `computeVmiDailyBalance: no vmi_contract_terms version covers ` +
        `ledgerDate=${input.ledgerDate} for partyId=${input.partyId}`,
    );
  }

  // Step 5: resolve billed_balance_cbm from billing_timing.
  const preThresholdBilledBalanceCbm = resolveBilledBalanceCbm(
    beginningCbm,
    endingCbm,
    contract.billingTiming,
  );

  // Step 6 (threshold + pricing).
  const { billedBalanceCbm, storageAmountUsd } = applyCbmThresholdAndPrice(
    preThresholdBilledBalanceCbm,
    contract.storageRatePerCbmDay,
    contract.cbmThresholdType,
    contract.cbmThreshold,
    contract.overThresholdRate,
  );

  return {
    partyId: input.partyId,
    ledgerDate: input.ledgerDate,
    beginningCbm,
    inboundCbmFg: totals.inFg,
    inboundCbmRawMaterial: totals.inRawMaterial,
    outboundCbmFg: totals.outFg,
    outboundCbmRawMaterial: totals.outRawMaterial,
    endingCbm,
    billedBalanceCbm,
    appliedStorageRateUsd: contract.storageRatePerCbmDay,
    storageAmountUsd,
  };
}

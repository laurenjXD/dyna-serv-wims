// VMI handling aggregation — specs/12-vmi-billing Task D.1.
//
// Traceability:
//   specs/12-vmi-billing/tasks.md Task Group D, D.1 — "Implement handling
//     aggregation — File: lib/billing/vmi-handling.ts. For each
//     vmi_daily_balance_ledger row in the period, resolve the
//     vmi_contract_terms version effective on that row's ledger_date and
//     price that day's IN/OUT CBM against it, then sum across the period —
//     per design.md §2.3 (not a flat total_cbm × current contract rate; see
//     A.9 for why). Verified against the June fixture (single contract
//     version active all period, so this reduces to the simple form):
//     157.18 × 1.40 = 220.05; 262.96 × 1.40 = 368.14."
//   specs/12-vmi-billing/design.md §2.3 (corrected 2026-08-19 as part of the
//     A.9 rate-versioning fix):
//       "For each vmi_daily_balance_ledger row in the period (grouped by
//       ledger_date):
//         day_contract = vmi_contract_terms WHERE party_id = :party_id
//           AND effective_from <= ledger_date AND (effective_to IS NULL OR
//           effective_to > ledger_date)
//         daily_handling_in_usd  = (in_fg + in_raw)   × day_contract.handling_in_rate_per_cbm
//         daily_handling_out_usd = (out_fg + out_raw) × day_contract.handling_out_rate_per_cbm
//       handling_in_usd  = SUM(daily_handling_in_usd)  across the period
//       handling_out_usd = SUM(daily_handling_out_usd) across the period"
//   specs/12-vmi-billing/requirements.md FR-4.1 — handling is a period
//     aggregate computed from movement replay, priced day-by-day against
//     whichever vmi_contract_terms version was effective on that specific
//     day, then summed — never an individually-entered vmi_charge_lines row.
//   specs/12-vmi-billing/tasks.md A.9 — the point-in-time rate-versioning
//     model this module must honor exactly like C.3 (storage) already does.
//
// This module reuses resolveContractTermsForDate from ./vmi-daily-balance
// (now generic over any { effectiveFrom, effectiveTo } shape) rather than
// reimplementing the point-in-time rate-resolution logic a second time.
//
// This module NEVER queries vmi_charge_lines — requirements.md FR-4.1,
// tasks.md G.4: "Handling never appears as a vmi_charge_lines row."

import { and, asc, between, eq } from "drizzle-orm";
import { vmiContractTerms, vmiDailyBalanceLedger } from "@/lib/db/schema/vmi_billing";
import { resolveContractTermsForDate } from "@/lib/billing/vmi-daily-balance";

// ---------------------------------------------------------------------------
// Public types (per the RED-step test file's documented contract)
// ---------------------------------------------------------------------------

export type VmiHandlingContractVersion = {
  handlingInRatePerCbm: number;
  handlingOutRatePerCbm: number;
  effectiveFrom: Date;
  effectiveTo: Date | null; // null = currently open-ended
};

export type VmiHandlingLedgerDay = {
  ledgerDate: string; // 'YYYY-MM-DD'
  inboundCbmFg: number;
  inboundCbmRawMaterial: number;
  outboundCbmFg: number;
  outboundCbmRawMaterial: number;
};

export type VmiDailyHandlingResult = {
  ledgerDate: string;
  dailyHandlingInUsd: number;
  dailyHandlingOutUsd: number;
};

export type VmiHandlingPeriodResult = {
  handlingInUsd: number;
  handlingOutUsd: number;
  days: VmiDailyHandlingResult[];
};

// ---------------------------------------------------------------------------
// computeDailyHandling — the per-day primitive (design.md §2.3's inner loop
// body). Pure — resolves the contract version effective ON day.ledgerDate
// (via resolveContractTermsForDate, not a reimplementation) and prices that
// single day's IN/OUT CBM against it.
//
// Throws if no version covers day.ledgerDate — mirrors
// computeVmiDailyBalance's own precedent (appliedStorageRateUsd-style NOT
// NULL columns have no valid value to produce without a resolvable rate).
// ---------------------------------------------------------------------------

export function computeDailyHandling(
  day: VmiHandlingLedgerDay,
  contractVersions: VmiHandlingContractVersion[],
): VmiDailyHandlingResult {
  const contract = resolveContractTermsForDate(contractVersions, day.ledgerDate);

  if (!contract) {
    throw new Error(
      `computeDailyHandling: no vmi_contract_terms version covers ` +
        `ledgerDate=${day.ledgerDate}`,
    );
  }

  const dailyHandlingInUsd =
    (day.inboundCbmFg + day.inboundCbmRawMaterial) * contract.handlingInRatePerCbm;
  const dailyHandlingOutUsd =
    (day.outboundCbmFg + day.outboundCbmRawMaterial) * contract.handlingOutRatePerCbm;

  return {
    ledgerDate: day.ledgerDate,
    dailyHandlingInUsd,
    dailyHandlingOutUsd,
  };
}

// ---------------------------------------------------------------------------
// computeVmiHandlingForPeriod — the period aggregate (design.md §2.3's outer
// sum). Pure — calls computeDailyHandling for every row, sums.
// ---------------------------------------------------------------------------

export function computeVmiHandlingForPeriod(
  ledgerRows: VmiHandlingLedgerDay[],
  contractVersions: VmiHandlingContractVersion[],
): VmiHandlingPeriodResult {
  const days: VmiDailyHandlingResult[] = [];
  let handlingInUsd = 0;
  let handlingOutUsd = 0;

  for (const row of ledgerRows) {
    const dayResult = computeDailyHandling(row, contractVersions);
    days.push(dayResult);
    handlingInUsd += dayResult.dailyHandlingInUsd;
    handlingOutUsd += dayResult.dailyHandlingOutUsd;
  }

  return { handlingInUsd, handlingOutUsd, days };
}

// ---------------------------------------------------------------------------
// getVmiHandlingForPeriod — DB-facing, thin orchestration layer (same "db
// injected explicitly" precedent as vmi-daily-balance-backfill.ts's
// backfillVmiDailyBalance):
//   1. Load this party's vmi_daily_balance_ledger rows within the period.
//   2. Load the party's FULL vmi_contract_terms version history (never
//      filtered to effective_to IS NULL only — a period may span a rate
//      change, same reasoning as C.6's backfill divergence from C.4a).
//   3. computeVmiHandlingForPeriod(mappedLedgerRows, mappedVersions).
// NEVER selects from vmiChargeLines — requirements.md FR-4.1.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type VmiHandlingDbLike = { select: (...args: any[]) => any };

type RawLedgerRow = {
  ledgerDate: string;
  inboundCbmFg: string;
  inboundCbmRawMaterial: string;
  outboundCbmFg: string;
  outboundCbmRawMaterial: string;
};

type RawHandlingContractVersionRow = {
  handlingInRatePerCbm: string;
  handlingOutRatePerCbm: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

function mapLedgerRow(raw: RawLedgerRow): VmiHandlingLedgerDay {
  return {
    ledgerDate: raw.ledgerDate,
    inboundCbmFg: Number(raw.inboundCbmFg),
    inboundCbmRawMaterial: Number(raw.inboundCbmRawMaterial),
    outboundCbmFg: Number(raw.outboundCbmFg),
    outboundCbmRawMaterial: Number(raw.outboundCbmRawMaterial),
  };
}

function mapHandlingContractVersionRow(
  raw: RawHandlingContractVersionRow,
): VmiHandlingContractVersion {
  return {
    handlingInRatePerCbm: Number(raw.handlingInRatePerCbm),
    handlingOutRatePerCbm: Number(raw.handlingOutRatePerCbm),
    effectiveFrom: raw.effectiveFrom,
    effectiveTo: raw.effectiveTo,
  };
}

export async function getVmiHandlingForPeriod(
  db: VmiHandlingDbLike,
  partyId: string,
  periodStartDate: string,
  periodEndDate: string,
): Promise<VmiHandlingPeriodResult> {
  const rawLedgerRows: RawLedgerRow[] = await db
    .select({
      ledgerDate: vmiDailyBalanceLedger.ledgerDate,
      inboundCbmFg: vmiDailyBalanceLedger.inboundCbmFg,
      inboundCbmRawMaterial: vmiDailyBalanceLedger.inboundCbmRawMaterial,
      outboundCbmFg: vmiDailyBalanceLedger.outboundCbmFg,
      outboundCbmRawMaterial: vmiDailyBalanceLedger.outboundCbmRawMaterial,
    })
    .from(vmiDailyBalanceLedger)
    .where(
      and(
        eq(vmiDailyBalanceLedger.partyId, partyId),
        between(vmiDailyBalanceLedger.ledgerDate, periodStartDate, periodEndDate),
      ),
    );

  const rawContractVersions: RawHandlingContractVersionRow[] = await db
    .select({
      handlingInRatePerCbm: vmiContractTerms.handlingInRatePerCbm,
      handlingOutRatePerCbm: vmiContractTerms.handlingOutRatePerCbm,
      effectiveFrom: vmiContractTerms.effectiveFrom,
      effectiveTo: vmiContractTerms.effectiveTo,
    })
    .from(vmiContractTerms)
    .where(eq(vmiContractTerms.partyId, partyId))
    .orderBy(asc(vmiContractTerms.effectiveFrom));

  const ledgerRows = rawLedgerRows.map(mapLedgerRow);
  const contractVersions = rawContractVersions.map(mapHandlingContractVersionRow);

  return computeVmiHandlingForPeriod(ledgerRows, contractVersions);
}

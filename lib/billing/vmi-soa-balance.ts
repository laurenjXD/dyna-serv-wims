// VMI SOA running-balance calculation — specs/12-vmi-billing Task D.6.
//
// Traceability:
//   specs/12-vmi-billing/tasks.md Task Group D, D.6 — "Implement SOA
//     running-balance calculation — soa_opening_balance_usd = prior
//     period's soa_closing_balance_usd (0 if first period).
//     soa_payments_applied_usd = SUM(vmi_payments WHERE type='payment' AND
//     applied_to_period_id = this period). soa_closing_balance_usd computed
//     per design.md §2.6 step 5."
//   specs/12-vmi-billing/design.md §2.6 step 5:
//       "soa_opening_balance_usd = prior vmi_billing_periods row's
//         soa_closing_balance_usd for this party (0 if this is the party's
//         first period).
//       soa_payments_applied_usd = SUM(vmi_payments WHERE type = 'payment'
//         AND applied_to_period_id = this new period's id)
//       soa_closing_balance_usd = soa_opening_balance_usd +
//         billing_statement_total_usd - soa_payments_applied_usd"
//   specs/12-vmi-billing/requirements.md FR-7.1, FR-7.2, FR-7.3.
//   specs/12-vmi-billing/tasks.md Task Group G, G.8.
//
// "Immediately-prior period" resolution: the party's most recent
// non-voided period whose periodEndDate is strictly before this new
// period's periodStartDate — never a voided period's stale balance, and
// never another party's row (see lib/billing/__tests__/vmi-soa-balance.test.ts's
// DESIGN DECISION header comment for the full rationale).
//
// Unlike billing_statement_total_usd (clamped at 0 per FR-6.1),
// soa_closing_balance_usd is a genuine running AR balance and is allowed to
// go negative (a credit position) — no clamping in this module.
//
// Mirrors lib/billing/vmi-forex-lock.ts / vmi-charge-aggregation.ts's shape:
// pure resolve/sum/compute functions over already-typed rows, plus a thin
// `db`-injected DB-facing orchestration function that re-applies the same
// scope filters defensively (isWithinScope precedent).

import { and, desc, eq, lt, ne } from "drizzle-orm";
import { vmiBillingPeriods, vmiPayments } from "@/lib/db/schema/vmi_billing";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type VmiPriorPeriodForSoa = {
  partyId: string;
  periodEndDate: string; // 'YYYY-MM-DD'
  status: string; // 'draft' | 'issued' | 'voided'
  soaClosingBalanceUsd: number;
};

export type VmiPaymentForSoa = {
  partyId: string;
  appliedToPeriodId: string;
  type: string; // 'payment' | 'credit_memo' | 'adjustment'
  amountUsd: number;
};

export type VmiSoaBalanceScope = {
  partyId: string;
  periodId: string; // the period being closed
  newPeriodStartDate: string; // 'YYYY-MM-DD', this period's own start date
  billingStatementTotalUsd: number;
};

export type VmiSoaBalanceResult = {
  soaOpeningBalanceUsd: number;
  soaPaymentsAppliedUsd: number;
  soaClosingBalanceUsd: number;
};

// ---------------------------------------------------------------------------
// resolveSoaOpeningBalance — pure resolve layer (design.md §2.6 step 5).
//
// Candidates: same partyId, status !== 'voided', periodEndDate strictly
// before newPeriodStartDate. Picks the one with the LATEST periodEndDate.
// 0 when no such row exists.
// ---------------------------------------------------------------------------

export function resolveSoaOpeningBalance(
  priorPeriods: VmiPriorPeriodForSoa[],
  scope: { partyId: string; newPeriodStartDate: string },
): number {
  const candidates = priorPeriods.filter(
    (period) =>
      period.partyId === scope.partyId &&
      period.status !== "voided" &&
      period.periodEndDate < scope.newPeriodStartDate,
  );

  if (candidates.length === 0) {
    return 0;
  }

  const mostRecent = candidates.reduce((latest, current) =>
    current.periodEndDate > latest.periodEndDate ? current : latest,
  );

  return mostRecent.soaClosingBalanceUsd;
}

// ---------------------------------------------------------------------------
// sumSoaPaymentsApplied — pure sum layer (design.md §2.6 step 5).
//
// Sums amountUsd across rows matching the exact (partyId, periodId) pair
// being closed, restricted to type === 'payment' — 'credit_memo'/
// 'adjustment' rows feed a separate figure (credits_applied_usd, design.md
// §2.6 step 3) computed elsewhere.
// ---------------------------------------------------------------------------

export function sumSoaPaymentsApplied(
  payments: VmiPaymentForSoa[],
  scope: { partyId: string; periodId: string },
): number {
  return payments
    .filter(
      (payment) =>
        payment.partyId === scope.partyId &&
        payment.appliedToPeriodId === scope.periodId &&
        payment.type === "payment",
    )
    .reduce((sum, payment) => sum + payment.amountUsd, 0);
}

// ---------------------------------------------------------------------------
// computeVmiSoaClosingBalance — pure formula layer (design.md §2.6 step 5).
//
// No clamping at 0 — a genuine credit (negative) position is a valid,
// correct result, unlike billing_statement_total_usd (FR-6.1).
// ---------------------------------------------------------------------------

export function computeVmiSoaClosingBalance(
  openingBalanceUsd: number,
  billingStatementTotalUsd: number,
  paymentsAppliedUsd: number,
): number {
  return openingBalanceUsd + billingStatementTotalUsd - paymentsAppliedUsd;
}

// ---------------------------------------------------------------------------
// computeVmiSoaBalance — pure combination of the three functions above.
// ---------------------------------------------------------------------------

export function computeVmiSoaBalance(
  priorPeriods: VmiPriorPeriodForSoa[],
  payments: VmiPaymentForSoa[],
  scope: VmiSoaBalanceScope,
): VmiSoaBalanceResult {
  const soaOpeningBalanceUsd = resolveSoaOpeningBalance(priorPeriods, {
    partyId: scope.partyId,
    newPeriodStartDate: scope.newPeriodStartDate,
  });

  const soaPaymentsAppliedUsd = sumSoaPaymentsApplied(payments, {
    partyId: scope.partyId,
    periodId: scope.periodId,
  });

  const soaClosingBalanceUsd = computeVmiSoaClosingBalance(
    soaOpeningBalanceUsd,
    scope.billingStatementTotalUsd,
    soaPaymentsAppliedUsd,
  );

  return { soaOpeningBalanceUsd, soaPaymentsAppliedUsd, soaClosingBalanceUsd };
}

// ---------------------------------------------------------------------------
// getVmiSoaBalanceForClose — DB-facing, thin orchestration layer (same
// "db injected explicitly" precedent as every other lib/billing/*.ts
// module). Queries vmi_billing_periods (party-scoped, non-voided, ended
// before the new period's start date) and vmi_payments (party + this
// period's id), then delegates to the pure functions above.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type VmiSoaBalanceDbLike = { select: (...args: any[]) => any };

type RawPriorPeriodRow = {
  partyId: string;
  periodEndDate: string;
  status: string;
  soaClosingBalanceUsd: string;
};

type RawPaymentRow = {
  partyId: string;
  appliedToPeriodId: string;
  type: string;
  amountUsd: string;
};

function mapPriorPeriodRow(raw: RawPriorPeriodRow): VmiPriorPeriodForSoa {
  return {
    partyId: raw.partyId,
    periodEndDate: raw.periodEndDate,
    status: raw.status,
    soaClosingBalanceUsd: Number(raw.soaClosingBalanceUsd),
  };
}

function mapPaymentRow(raw: RawPaymentRow): VmiPaymentForSoa {
  return {
    partyId: raw.partyId,
    appliedToPeriodId: raw.appliedToPeriodId,
    type: raw.type,
    amountUsd: Number(raw.amountUsd),
  };
}

export async function getVmiSoaBalanceForClose(
  db: VmiSoaBalanceDbLike,
  scope: VmiSoaBalanceScope,
): Promise<VmiSoaBalanceResult> {
  const rawPriorPeriodRows: RawPriorPeriodRow[] = await db
    .select({
      partyId: vmiBillingPeriods.partyId,
      periodEndDate: vmiBillingPeriods.periodEndDate,
      status: vmiBillingPeriods.status,
      soaClosingBalanceUsd: vmiBillingPeriods.soaClosingBalanceUsd,
    })
    .from(vmiBillingPeriods)
    .where(
      and(
        eq(vmiBillingPeriods.partyId, scope.partyId),
        ne(vmiBillingPeriods.status, "voided"),
        lt(vmiBillingPeriods.periodEndDate, scope.newPeriodStartDate),
      ),
    )
    .orderBy(desc(vmiBillingPeriods.periodEndDate));

  const rawPaymentRows: RawPaymentRow[] = await db
    .select({
      partyId: vmiPayments.partyId,
      appliedToPeriodId: vmiPayments.appliedToPeriodId,
      type: vmiPayments.type,
      amountUsd: vmiPayments.amountUsd,
    })
    .from(vmiPayments)
    .where(
      and(
        eq(vmiPayments.partyId, scope.partyId),
        eq(vmiPayments.appliedToPeriodId, scope.periodId),
      ),
    );

  const priorPeriods = rawPriorPeriodRows.map(mapPriorPeriodRow);
  const payments = rawPaymentRows.map(mapPaymentRow);

  return computeVmiSoaBalance(priorPeriods, payments, scope);
}

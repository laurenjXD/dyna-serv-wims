// VMI billing period-close orchestration — specs/12-vmi-billing Task D.8.
//
// Traceability:
//   specs/12-vmi-billing/tasks.md Task Group D, D.8 — "Implement the
//     period-close command — File: lib/billing/vmi-period-close.ts. Runs
//     D.1-D.7, validates no existing non-voided period for the same
//     party/month, computes billing_statement_total_usd, inserts
//     vmi_billing_periods with status = 'draft'."
//   specs/12-vmi-billing/design.md §2.6, steps 1-7 (step 8's PDF generation
//     is D.9, out of scope here).
//
// This module orchestrates D.1 (handling), D.3 (documentation/delivery/
// ad-hoc), D.4 (recurring fees), D.5 (forex lock), D.6 (SOA balance), and
// D.7 (period number generation) — each already independently implemented
// and unit-tested — plus a small, previously-unowned storage-sum step
// (sumVmiStorageCharge, see design.md §2.6 step 2) and the credits_applied_usd
// sum (design.md §2.6 step 3), both introduced by this module.
//
// credits_applied_usd is scoped EXACTLY like D.6's soaPaymentsAppliedUsd —
// WHERE partyId = this party AND appliedToPeriodId = the new period's own id
// (design.md §2.6 step 3, clarified 2026-08-20). Because vmi_payments.
// appliedToPeriodId is a NOT NULL FK, the new period's id must be generated
// application-side (a v4 UUID) BEFORE the INSERT that creates the row, so it
// can be used to scope both the credits query and the D.6 SOA call — never
// left for Postgres to assign at insert time.
//
// db-injected, not withRlsTransaction — mirrors every other lib/billing/*.ts
// module's own precedent (no authorization/capability gating performed here;
// that belongs at the call site, same as D.1-D.7's own header comments).

import { randomUUID } from "node:crypto";
import { and, between, eq, ne } from "drizzle-orm";
import { vmiBillingPeriods, vmiDailyBalanceLedger, vmiPayments } from "@/lib/db/schema/vmi_billing";
import { getVmiHandlingForPeriod } from "@/lib/billing/vmi-handling";
import { getVmiChargeAggregationForPeriod } from "@/lib/billing/vmi-charge-aggregation";
import { getVmiRecurringFeeAggregationForPeriod } from "@/lib/billing/vmi-recurring-fee-aggregation";
import { getLockedForexRateForClose } from "@/lib/billing/vmi-forex-lock";
import { getVmiSoaBalanceForClose } from "@/lib/billing/vmi-soa-balance";
import { generateVmiPeriodNumber } from "@/lib/billing/vmi-period-number";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type VmiPeriodCloseRequest = {
  partyId: string;
  partyCode: string;
  billingCurrency: string; // 'USD' | 'PHP' — caller-resolved, see module header
  year: number;
  month: number; // 1-12
  periodStartDate: string; // 'YYYY-MM-DD'
  periodEndDate: string; // 'YYYY-MM-DD'
  generationDate: string; // 'YYYY-MM-DD' — passed through to D.5 unchanged
};

export type VmiPeriodCloseResult = {
  id: string;
  periodNumber: string;
  partyId: string;
  periodStartDate: string;
  periodEndDate: string;
  storageChargeUsd: number;
  handlingInUsd: number;
  handlingOutUsd: number;
  documentationUsd: number;
  deliveryUsd: number;
  recurringFeesUsd: number;
  adHocChargesUsd: number;
  creditsAppliedUsd: number;
  billingStatementTotalUsd: number;
  soaOpeningBalanceUsd: number;
  soaPaymentsAppliedUsd: number;
  soaClosingBalanceUsd: number;
  lockedExchangeRatePhp: number;
  lockedExchangeRateDate: string;
  billingCurrency: string;
  status: "draft";
};

// ---------------------------------------------------------------------------
// sumVmiStorageCharge — pure. Sums already-priced daily rows (design.md
// §2.6 step 2 — no other D.1-D.7 module owns this sum).
// ---------------------------------------------------------------------------

export function sumVmiStorageCharge(rows: { storageAmountUsd: number }[]): number {
  return rows.reduce((sum, row) => sum + row.storageAmountUsd, 0);
}

// ---------------------------------------------------------------------------
// computeBillingStatementTotal — pure. requirements.md FR-6.1's formula,
// clamped at 0 (never negative — matches the vmi_billing_periods CHECK
// constraint).
// ---------------------------------------------------------------------------

export function computeBillingStatementTotal(components: {
  storageChargeUsd: number;
  handlingInUsd: number;
  handlingOutUsd: number;
  documentationUsd: number;
  deliveryUsd: number;
  recurringFeesUsd: number;
  adHocChargesUsd: number;
  creditsAppliedUsd: number;
}): number {
  const total =
    components.storageChargeUsd +
    components.handlingInUsd +
    components.handlingOutUsd +
    components.documentationUsd +
    components.deliveryUsd +
    components.recurringFeesUsd +
    components.adHocChargesUsd -
    components.creditsAppliedUsd;

  return Math.max(0, total);
}

// ---------------------------------------------------------------------------
// closeVmiPeriod — DB-facing orchestration (design.md §2.6 steps 1-7).
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
export type VmiPeriodCloseDbLike = {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

type RawDuplicatePeriodRow = {
  id: string;
  partyId: string;
  periodStartDate: string;
  periodEndDate: string;
  status: string;
};

type RawStorageLedgerRow = {
  storageAmountUsd: string;
};

const CREDITS_APPLIED_TYPES = ["credit_memo", "adjustment"] as const;

type RawCreditPaymentRow = {
  amountUsd: string;
  type: string;
};

export async function closeVmiPeriod(
  db: VmiPeriodCloseDbLike,
  request: VmiPeriodCloseRequest,
): Promise<VmiPeriodCloseResult> {
  // 1. Duplicate-period guard (design.md §2.6 step 1, first half) — reject
  // BEFORE any computation when a non-voided row already exists for this
  // party/month.
  const existingRows: RawDuplicatePeriodRow[] = await db
    .select({
      id: vmiBillingPeriods.id,
      partyId: vmiBillingPeriods.partyId,
      periodStartDate: vmiBillingPeriods.periodStartDate,
      periodEndDate: vmiBillingPeriods.periodEndDate,
      status: vmiBillingPeriods.status,
    })
    .from(vmiBillingPeriods)
    .where(
      and(
        eq(vmiBillingPeriods.partyId, request.partyId),
        eq(vmiBillingPeriods.periodStartDate, request.periodStartDate),
        eq(vmiBillingPeriods.periodEndDate, request.periodEndDate),
        ne(vmiBillingPeriods.status, "voided"),
      ),
    );

  // Defensive re-filter (same "defense in depth" precedent as
  // vmi-charge-aggregation.ts's isWithinScope / vmi-soa-balance.ts's own
  // re-filters) — never trust the WHERE clause alone to have excluded a
  // voided row.
  const blockingRows = existingRows.filter(
    (row) =>
      row.partyId === request.partyId &&
      row.periodStartDate === request.periodStartDate &&
      row.periodEndDate === request.periodEndDate &&
      row.status !== "voided",
  );

  if (blockingRows.length > 0) {
    throw new Error(
      `closeVmiPeriod: a non-voided vmi_billing_periods row already exists ` +
        `for partyId=${request.partyId}, period ${request.periodStartDate}..${request.periodEndDate}.`,
    );
  }

  // 2. Lock forex (design.md §2.6 step 1 second half / step 6, delegates to
  // D.5) — rejection propagates immediately, no partial insert.
  const { lockedExchangeRatePhp, lockedExchangeRateDate } = await getLockedForexRateForClose(
    db,
    request.generationDate,
  );

  // 3. Generate a new period id application-side (not DB-assigned) — see
  // module header for why: credits_applied_usd and D.6's SOA call both need
  // to scope against this exact id BEFORE the row exists.
  const newPeriodId = randomUUID();

  // 4. storage_charge_usd — the new sum this module owns directly.
  const rawStorageRows: RawStorageLedgerRow[] = await db
    .select({ storageAmountUsd: vmiDailyBalanceLedger.storageAmountUsd })
    .from(vmiDailyBalanceLedger)
    .where(
      and(
        eq(vmiDailyBalanceLedger.partyId, request.partyId),
        between(vmiDailyBalanceLedger.ledgerDate, request.periodStartDate, request.periodEndDate),
      ),
    );
  const storageChargeUsd = sumVmiStorageCharge(
    rawStorageRows.map((row) => ({ storageAmountUsd: Number(row.storageAmountUsd) })),
  );

  // 5. Handling (D.1).
  const { handlingInUsd, handlingOutUsd } = await getVmiHandlingForPeriod(
    db,
    request.partyId,
    request.periodStartDate,
    request.periodEndDate,
  );

  // 6. Documentation/delivery/ad-hoc (D.3).
  const { documentationUsd, deliveryUsd, adHocChargesUsd } = await getVmiChargeAggregationForPeriod(
    db,
    {
      partyId: request.partyId,
      periodStartDate: request.periodStartDate,
      periodEndDate: request.periodEndDate,
      lockedExchangeRatePhp,
    },
  );

  // 7. Recurring fees (D.4).
  const { recurringFeesUsd } = await getVmiRecurringFeeAggregationForPeriod(db, {
    partyId: request.partyId,
    periodStartDate: request.periodStartDate,
    periodEndDate: request.periodEndDate,
    lockedExchangeRatePhp,
  });

  // 8. credits_applied_usd (design.md §2.6 step 3) — scoped to this new
  // period's id, defensively re-filtered to credit_memo/adjustment types
  // even though the WHERE clause already scopes it.
  const rawCreditRows: RawCreditPaymentRow[] = await db
    .select({ amountUsd: vmiPayments.amountUsd, type: vmiPayments.type })
    .from(vmiPayments)
    .where(
      and(
        eq(vmiPayments.partyId, request.partyId),
        eq(vmiPayments.appliedToPeriodId, newPeriodId),
      ),
    );

  const creditsAppliedUsd = rawCreditRows
    .filter((row) => (CREDITS_APPLIED_TYPES as readonly string[]).includes(row.type))
    .reduce((sum, row) => sum + Number(row.amountUsd), 0);

  // 9. billing_statement_total_usd, clamped at 0.
  const billingStatementTotalUsd = computeBillingStatementTotal({
    storageChargeUsd,
    handlingInUsd,
    handlingOutUsd,
    documentationUsd,
    deliveryUsd,
    recurringFeesUsd,
    adHocChargesUsd,
    creditsAppliedUsd,
  });

  // 10. Period number (D.7).
  const periodNumber = await generateVmiPeriodNumber(db, {
    partyCode: request.partyCode,
    year: request.year,
    month: request.month,
    isCorrection: false,
  });

  // 11. SOA balance (D.6), using the just-computed billingStatementTotalUsd.
  const { soaOpeningBalanceUsd, soaPaymentsAppliedUsd, soaClosingBalanceUsd } =
    await getVmiSoaBalanceForClose(db, {
      partyId: request.partyId,
      periodId: newPeriodId,
      newPeriodStartDate: request.periodStartDate,
      billingStatementTotalUsd,
    });

  // 12. Insert vmi_billing_periods with status = 'draft'.
  const insertedRows = await db
    .insert(vmiBillingPeriods)
    .values({
      id: newPeriodId,
      periodNumber,
      partyId: request.partyId,
      periodStartDate: request.periodStartDate,
      periodEndDate: request.periodEndDate,
      storageChargeUsd: String(storageChargeUsd),
      handlingInUsd: String(handlingInUsd),
      handlingOutUsd: String(handlingOutUsd),
      documentationUsd: String(documentationUsd),
      deliveryUsd: String(deliveryUsd),
      recurringFeesUsd: String(recurringFeesUsd),
      adHocChargesUsd: String(adHocChargesUsd),
      creditsAppliedUsd: String(creditsAppliedUsd),
      billingStatementTotalUsd: String(billingStatementTotalUsd),
      soaOpeningBalanceUsd: String(soaOpeningBalanceUsd),
      soaPaymentsAppliedUsd: String(soaPaymentsAppliedUsd),
      soaClosingBalanceUsd: String(soaClosingBalanceUsd),
      lockedExchangeRatePhp: String(lockedExchangeRatePhp),
      lockedExchangeRateDate,
      billingCurrency: request.billingCurrency,
      status: "draft",
    })
    .returning();

  const insertedRow = insertedRows[0];

  // 13. Return the mapped result.
  return {
    id: insertedRow?.id ?? newPeriodId,
    periodNumber,
    partyId: request.partyId,
    periodStartDate: request.periodStartDate,
    periodEndDate: request.periodEndDate,
    storageChargeUsd,
    handlingInUsd,
    handlingOutUsd,
    documentationUsd,
    deliveryUsd,
    recurringFeesUsd,
    adHocChargesUsd,
    creditsAppliedUsd,
    billingStatementTotalUsd,
    soaOpeningBalanceUsd,
    soaPaymentsAppliedUsd,
    soaClosingBalanceUsd,
    lockedExchangeRatePhp,
    lockedExchangeRateDate,
    billingCurrency: request.billingCurrency,
    status: "draft",
  };
}

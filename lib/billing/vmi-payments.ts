import { and, eq } from "drizzle-orm";
import { vmiBillingPeriods, vmiPayments } from "@/lib/db/schema/vmi_billing";
import { normalizeTextInput } from "@/lib/billing/input-validation";

export const VMI_PAYMENT_TYPES = ["payment", "credit_memo", "adjustment"] as const;
export type VmiPaymentType = (typeof VMI_PAYMENT_TYPES)[number];

export type RecordVmiPaymentInput = {
  partyId: string;
  periodId: string;
  amountUsd: string;
  type: VmiPaymentType;
  paymentDate: string;
  notes?: string;
  recordedByUserId: string;
};

export type RecordVmiPaymentResult =
  | {
      ok: true;
      paymentId: string;
      periodId: string;
      periodStatus: "draft" | "issued" | "voided";
      soaPaymentsAppliedUsd: number;
      soaClosingBalanceUsd: number;
    }
  | { ok: false; errors: string[] };

/* eslint-disable @typescript-eslint/no-explicit-any */
export type VmiPaymentsDbLike = {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
  update: (...args: any[]) => any;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

function isMoney(value: string): boolean {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(value)) return false;
  const [integerPart] = value.split(".");
  // vmi_payments.amount_usd is decimal(14,4): at most ten integer digits.
  // Check the bound before Number() so enormous strings cannot become
  // Infinity and pass a simple `> 0` test.
  if (integerPart.length > 10) return false;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0;
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export function validateRecordVmiPaymentInput(
  input: Partial<RecordVmiPaymentInput>,
): string[] {
  const errors: string[] = [];
  if (typeof input.partyId !== "string" || input.partyId.trim().length === 0) errors.push("party_id_required");
  if (typeof input.periodId !== "string" || input.periodId.trim().length === 0) errors.push("period_id_required");
  if (typeof input.recordedByUserId !== "string" || input.recordedByUserId.trim().length === 0) errors.push("recorded_by_user_id_required");
  if (typeof input.amountUsd !== "string" || !isMoney(input.amountUsd.trim())) errors.push("amount_must_be_positive");
  if (typeof input.paymentDate !== "string" || !isIsoDate(input.paymentDate.trim())) errors.push("payment_date_invalid");
  if (!input.type || !VMI_PAYMENT_TYPES.includes(input.type)) errors.push("payment_type_invalid");
  if (typeof input.notes === "string" && input.notes.length > 4000) errors.push("notes_too_long");
  return errors;
}

/**
 * Records one immutable payment/credit/adjustment against one period.
 * Draft periods refresh their payment-applied and SOA closing totals. Issued
 * periods remain immutable; their payment row is retained for the next
 * period's AR processing and never rewrites the issued snapshot.
 */
export async function recordVmiPayment(
  database: VmiPaymentsDbLike,
  input: RecordVmiPaymentInput,
): Promise<RecordVmiPaymentResult> {
  const validationErrors = validateRecordVmiPaymentInput(input);
  if (validationErrors.length > 0) return { ok: false, errors: validationErrors };
  const partyId = input.partyId.trim();
  const periodId = input.periodId.trim();

  const [period] = await database
    .select({
      id: vmiBillingPeriods.id,
      partyId: vmiBillingPeriods.partyId,
      status: vmiBillingPeriods.status,
      soaOpeningBalanceUsd: vmiBillingPeriods.soaOpeningBalanceUsd,
      soaPaymentsAppliedUsd: vmiBillingPeriods.soaPaymentsAppliedUsd,
      soaClosingBalanceUsd: vmiBillingPeriods.soaClosingBalanceUsd,
      billingStatementTotalUsd: vmiBillingPeriods.billingStatementTotalUsd,
      storageChargeUsd: vmiBillingPeriods.storageChargeUsd,
      handlingInUsd: vmiBillingPeriods.handlingInUsd,
      handlingOutUsd: vmiBillingPeriods.handlingOutUsd,
      documentationUsd: vmiBillingPeriods.documentationUsd,
      deliveryUsd: vmiBillingPeriods.deliveryUsd,
      recurringFeesUsd: vmiBillingPeriods.recurringFeesUsd,
      adHocChargesUsd: vmiBillingPeriods.adHocChargesUsd,
      creditsAppliedUsd: vmiBillingPeriods.creditsAppliedUsd,
    })
    .from(vmiBillingPeriods)
    .where(and(eq(vmiBillingPeriods.id, periodId), eq(vmiBillingPeriods.partyId, partyId)))
    .limit(1);

  if (!period) return { ok: false, errors: ["period_not_found"] };
  if (period.status === "voided") return { ok: false, errors: ["period_voided"] };
  if (period.status === "issued" && input.type !== "payment") {
    return { ok: false, errors: ["credits_require_draft_period"] };
  }

  const [payment] = await database
    .insert(vmiPayments)
    .values({
      partyId,
      appliedToPeriodId: periodId,
      paymentDate: input.paymentDate.trim(),
      amountUsd: input.amountUsd.trim(),
      type: input.type,
      notes: normalizeTextInput(input.notes),
      recordedByUserId: input.recordedByUserId,
    })
    .returning({ id: vmiPayments.id });

  if (!payment) return { ok: false, errors: ["payment_not_created"] };

  if (period.status === "issued") {
    return {
      ok: true,
      paymentId: payment.id,
      periodId: period.id,
      periodStatus: period.status,
      soaPaymentsAppliedUsd: Number(period.soaPaymentsAppliedUsd ?? 0),
      soaClosingBalanceUsd: Number(period.soaClosingBalanceUsd ?? 0),
    };
  }

  const paymentRows = await database
    .select({ amountUsd: vmiPayments.amountUsd, type: vmiPayments.type })
    .from(vmiPayments)
    .where(and(eq(vmiPayments.partyId, partyId), eq(vmiPayments.appliedToPeriodId, periodId)));

  const paymentsApplied = paymentRows
    .filter((row: { type: string }) => row.type === "payment")
    .reduce((total: number, row: { amountUsd: string }) => total + Number(row.amountUsd), 0);
  const creditsApplied = paymentRows
    .filter((row: { type: string }) => row.type === "credit_memo" || row.type === "adjustment")
    .reduce((total: number, row: { amountUsd: string }) => total + Number(row.amountUsd), 0);
  const statementBeforeCredits = [
    period.storageChargeUsd,
    period.handlingInUsd,
    period.handlingOutUsd,
    period.documentationUsd,
    period.deliveryUsd,
    period.recurringFeesUsd,
    period.adHocChargesUsd,
  ].reduce((total, amount) => total + Number(amount ?? 0), 0);
  const statementTotal = Math.max(0, statementBeforeCredits - creditsApplied);
  const closingBalance =
    Number(period.soaOpeningBalanceUsd) + statementTotal - paymentsApplied;

  await database
    .update(vmiBillingPeriods)
    .set({
      creditsAppliedUsd: creditsApplied.toFixed(4),
      billingStatementTotalUsd: statementTotal.toFixed(4),
      soaPaymentsAppliedUsd: paymentsApplied.toFixed(4),
      soaClosingBalanceUsd: closingBalance.toFixed(4),
    })
    .where(eq(vmiBillingPeriods.id, periodId));

  return {
    ok: true,
    paymentId: payment.id,
    periodId: period.id,
    periodStatus: period.status,
    soaPaymentsAppliedUsd: paymentsApplied,
    soaClosingBalanceUsd: closingBalance,
  };
}

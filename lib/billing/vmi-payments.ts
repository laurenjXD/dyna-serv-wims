import { and, eq } from "drizzle-orm";
import { vmiBillingPeriods, vmiPayments } from "@/lib/db/schema/vmi_billing";

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
  return /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(value) && Number(value) > 0;
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
  if (!input.partyId) errors.push("party_id_required");
  if (!input.periodId) errors.push("period_id_required");
  if (!input.recordedByUserId) errors.push("recorded_by_user_id_required");
  if (!input.amountUsd || !isMoney(input.amountUsd)) errors.push("amount_must_be_positive");
  if (!input.paymentDate || !isIsoDate(input.paymentDate)) errors.push("payment_date_invalid");
  if (!input.type || !VMI_PAYMENT_TYPES.includes(input.type)) errors.push("payment_type_invalid");
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

  const [period] = await database
    .select({
      id: vmiBillingPeriods.id,
      partyId: vmiBillingPeriods.partyId,
      status: vmiBillingPeriods.status,
      soaOpeningBalanceUsd: vmiBillingPeriods.soaOpeningBalanceUsd,
      soaPaymentsAppliedUsd: vmiBillingPeriods.soaPaymentsAppliedUsd,
      billingStatementTotalUsd: vmiBillingPeriods.billingStatementTotalUsd,
    })
    .from(vmiBillingPeriods)
    .where(and(eq(vmiBillingPeriods.id, input.periodId), eq(vmiBillingPeriods.partyId, input.partyId)))
    .limit(1);

  if (!period) return { ok: false, errors: ["period_not_found"] };
  if (period.status === "voided") return { ok: false, errors: ["period_voided"] };

  const [payment] = await database
    .insert(vmiPayments)
    .values({
      partyId: input.partyId,
      appliedToPeriodId: input.periodId,
      paymentDate: input.paymentDate,
      amountUsd: input.amountUsd,
      type: input.type,
      notes: input.notes?.trim() || null,
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
    .where(and(eq(vmiPayments.partyId, input.partyId), eq(vmiPayments.appliedToPeriodId, input.periodId)));

  const paymentsApplied = paymentRows
    .filter((row: { type: string }) => row.type === "payment")
    .reduce((total: number, row: { amountUsd: string }) => total + Number(row.amountUsd), 0);
  const closingBalance =
    Number(period.soaOpeningBalanceUsd) + Number(period.billingStatementTotalUsd) - paymentsApplied;

  await database
    .update(vmiBillingPeriods)
    .set({
      soaPaymentsAppliedUsd: paymentsApplied.toFixed(4),
      soaClosingBalanceUsd: closingBalance.toFixed(4),
    })
    .where(eq(vmiBillingPeriods.id, input.periodId));

  return {
    ok: true,
    paymentId: payment.id,
    periodId: period.id,
    periodStatus: period.status,
    soaPaymentsAppliedUsd: paymentsApplied,
    soaClosingBalanceUsd: closingBalance,
  };
}

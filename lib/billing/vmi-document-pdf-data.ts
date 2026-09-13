import { and, between, eq } from "drizzle-orm";
import { parties } from "@/lib/db/schema/parties";
import {
  vmiBillingPeriods,
  vmiDailyBalanceLedger,
  vmiPayments,
  vmiPermits,
} from "@/lib/db/schema/vmi_billing";
import type { VmiPdfData } from "@/lib/documents/render-vmi-billing-pdf";

/**
 * Loads the single immutable billing-period snapshot used for both draft
 * preview and official rendering. Keeping this here prevents a preview and
 * issued PDF from using subtly different joins or totals.
 */
export async function loadVmiDocumentPdfData(db: any, periodId: string): Promise<VmiPdfData | null> {
  const [period] = await db.select({
    id: vmiBillingPeriods.id,
    periodNumber: vmiBillingPeriods.periodNumber,
    partyId: vmiBillingPeriods.partyId,
    partyName: parties.name,
    partyCode: parties.code,
    periodStartDate: vmiBillingPeriods.periodStartDate,
    periodEndDate: vmiBillingPeriods.periodEndDate,
    storageChargeUsd: vmiBillingPeriods.storageChargeUsd,
    handlingInUsd: vmiBillingPeriods.handlingInUsd,
    handlingOutUsd: vmiBillingPeriods.handlingOutUsd,
    documentationUsd: vmiBillingPeriods.documentationUsd,
    deliveryUsd: vmiBillingPeriods.deliveryUsd,
    recurringFeesUsd: vmiBillingPeriods.recurringFeesUsd,
    adHocChargesUsd: vmiBillingPeriods.adHocChargesUsd,
    creditsAppliedUsd: vmiBillingPeriods.creditsAppliedUsd,
    billingStatementTotalUsd: vmiBillingPeriods.billingStatementTotalUsd,
    soaOpeningBalanceUsd: vmiBillingPeriods.soaOpeningBalanceUsd,
    soaPaymentsAppliedUsd: vmiBillingPeriods.soaPaymentsAppliedUsd,
    soaClosingBalanceUsd: vmiBillingPeriods.soaClosingBalanceUsd,
    lockedExchangeRatePhp: vmiBillingPeriods.lockedExchangeRatePhp,
  }).from(vmiBillingPeriods)
    .innerJoin(parties, eq(parties.id, vmiBillingPeriods.partyId))
    .where(eq(vmiBillingPeriods.id, periodId)).limit(1);

  if (!period) return null;

  const [dailyRows, payments, permits] = await Promise.all([
    db.select({
      date: vmiDailyBalanceLedger.ledgerDate,
      beginningCbm: vmiDailyBalanceLedger.beginningCbm,
      inboundFgCbm: vmiDailyBalanceLedger.inboundCbmFg,
      inboundRawCbm: vmiDailyBalanceLedger.inboundCbmRawMaterial,
      outboundFgCbm: vmiDailyBalanceLedger.outboundCbmFg,
      outboundRawCbm: vmiDailyBalanceLedger.outboundCbmRawMaterial,
      endingCbm: vmiDailyBalanceLedger.endingCbm,
      rateUsd: vmiDailyBalanceLedger.appliedStorageRateUsd,
      amountUsd: vmiDailyBalanceLedger.storageAmountUsd,
    }).from(vmiDailyBalanceLedger).where(and(
      eq(vmiDailyBalanceLedger.partyId, period.partyId),
      between(vmiDailyBalanceLedger.ledgerDate, period.periodStartDate, period.periodEndDate),
    )),
    db.select({ date: vmiPayments.paymentDate, type: vmiPayments.type, amountUsd: vmiPayments.amountUsd, notes: vmiPayments.notes })
      .from(vmiPayments).where(eq(vmiPayments.appliedToPeriodId, period.id)),
    db.select({ permitNumber: vmiPermits.permitNumber, itemScope: vmiPermits.itemScope, validFrom: vmiPermits.validFrom, validTo: vmiPermits.validTo, monthlyFeeUsd: vmiPermits.monthlyFeeUsd })
      .from(vmiPermits).where(and(eq(vmiPermits.partyId, period.partyId), eq(vmiPermits.isActive, true))),
  ]);

  return {
    period: {
      periodNumber: period.periodNumber, partyName: period.partyName, partyCode: period.partyCode,
      periodStartDate: period.periodStartDate, periodEndDate: period.periodEndDate,
      storageChargeUsd: Number(period.storageChargeUsd), handlingInUsd: Number(period.handlingInUsd), handlingOutUsd: Number(period.handlingOutUsd),
      documentationUsd: Number(period.documentationUsd), deliveryUsd: Number(period.deliveryUsd), recurringFeesUsd: Number(period.recurringFeesUsd),
      adHocChargesUsd: Number(period.adHocChargesUsd), creditsAppliedUsd: Number(period.creditsAppliedUsd), billingStatementTotalUsd: Number(period.billingStatementTotalUsd),
      soaOpeningBalanceUsd: Number(period.soaOpeningBalanceUsd), soaPaymentsAppliedUsd: Number(period.soaPaymentsAppliedUsd), soaClosingBalanceUsd: Number(period.soaClosingBalanceUsd), lockedExchangeRatePhp: Number(period.lockedExchangeRatePhp),
    },
    dailyRows: dailyRows.map((row: any) => ({ date: row.date, beginningCbm: Number(row.beginningCbm), inboundCbm: Number(row.inboundFgCbm) + Number(row.inboundRawCbm), outboundCbm: Number(row.outboundFgCbm) + Number(row.outboundRawCbm), endingCbm: Number(row.endingCbm), rateUsd: Number(row.rateUsd), amountUsd: Number(row.amountUsd) })),
    payments: payments.map((row: any) => ({ date: row.date, type: row.type, amountUsd: Number(row.amountUsd), notes: row.notes })),
    permits: permits.map((row: any) => ({ permitNumber: row.permitNumber, itemScope: row.itemScope, validFrom: row.validFrom, validTo: row.validTo, monthlyFeeUsd: Number(row.monthlyFeeUsd) })),
  };
}

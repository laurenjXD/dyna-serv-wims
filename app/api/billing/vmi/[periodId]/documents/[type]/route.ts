import { NextResponse } from "next/server";
import { and, between, eq } from "drizzle-orm";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { parties } from "@/lib/db/schema/parties";
import { vmiBillingPeriods, vmiDailyBalanceLedger, vmiPayments, vmiPermits } from "@/lib/db/schema/vmi_billing";
import { isVmiDocumentType } from "@/lib/documents/vmi-artifacts";
import { renderVmiBillingPdf } from "@/lib/documents/render-vmi-billing-pdf";

interface RouteProps { params: Promise<{ periodId: string; type: string }>; }

export async function GET(_request: Request, { params }: RouteProps) {
  const { periodId, type } = await params;
  if (!isVmiDocumentType(type)) return NextResponse.json({ error: "Unknown VMI document type." }, { status: 400 });

  const resolver = await createPageResolver();
  const permission = await requirePermission(resolver, "reporting.financial_read");
  if (permission.kind !== "authorized") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [period] = await db.select({
    id: vmiBillingPeriods.id, periodNumber: vmiBillingPeriods.periodNumber, partyId: vmiBillingPeriods.partyId,
    partyName: parties.name, partyCode: parties.code, periodStartDate: vmiBillingPeriods.periodStartDate, periodEndDate: vmiBillingPeriods.periodEndDate,
    storageChargeUsd: vmiBillingPeriods.storageChargeUsd, handlingInUsd: vmiBillingPeriods.handlingInUsd, handlingOutUsd: vmiBillingPeriods.handlingOutUsd,
    documentationUsd: vmiBillingPeriods.documentationUsd, deliveryUsd: vmiBillingPeriods.deliveryUsd, recurringFeesUsd: vmiBillingPeriods.recurringFeesUsd,
    adHocChargesUsd: vmiBillingPeriods.adHocChargesUsd, creditsAppliedUsd: vmiBillingPeriods.creditsAppliedUsd, billingStatementTotalUsd: vmiBillingPeriods.billingStatementTotalUsd,
    soaOpeningBalanceUsd: vmiBillingPeriods.soaOpeningBalanceUsd, soaPaymentsAppliedUsd: vmiBillingPeriods.soaPaymentsAppliedUsd, soaClosingBalanceUsd: vmiBillingPeriods.soaClosingBalanceUsd,
    lockedExchangeRatePhp: vmiBillingPeriods.lockedExchangeRatePhp,
  }).from(vmiBillingPeriods).innerJoin(parties, eq(parties.id, vmiBillingPeriods.partyId)).where(eq(vmiBillingPeriods.id, periodId)).limit(1);
  if (!period) return NextResponse.json({ error: "Billing period not found." }, { status: 404 });

  const [dailyRows, payments, permits] = await Promise.all([
    db.select({ date: vmiDailyBalanceLedger.ledgerDate, beginningCbm: vmiDailyBalanceLedger.beginningCbm, inboundFgCbm: vmiDailyBalanceLedger.inboundCbmFg, inboundRawCbm: vmiDailyBalanceLedger.inboundCbmRawMaterial, outboundFgCbm: vmiDailyBalanceLedger.outboundCbmFg, outboundRawCbm: vmiDailyBalanceLedger.outboundCbmRawMaterial, endingCbm: vmiDailyBalanceLedger.endingCbm, rateUsd: vmiDailyBalanceLedger.appliedStorageRateUsd, amountUsd: vmiDailyBalanceLedger.storageAmountUsd }).from(vmiDailyBalanceLedger).where(and(eq(vmiDailyBalanceLedger.partyId, period.partyId), between(vmiDailyBalanceLedger.ledgerDate, period.periodStartDate, period.periodEndDate))),
    db.select({ date: vmiPayments.paymentDate, type: vmiPayments.type, amountUsd: vmiPayments.amountUsd, notes: vmiPayments.notes }).from(vmiPayments).where(eq(vmiPayments.appliedToPeriodId, period.id)),
    db.select({ permitNumber: vmiPermits.permitNumber, itemScope: vmiPermits.itemScope, validFrom: vmiPermits.validFrom, validTo: vmiPermits.validTo, monthlyFeeUsd: vmiPermits.monthlyFeeUsd }).from(vmiPermits).where(and(eq(vmiPermits.partyId, period.partyId), eq(vmiPermits.isActive, true))),
  ]);

  const bytes = await renderVmiBillingPdf(type, {
    period: {
      periodNumber: period.periodNumber, partyName: period.partyName, partyCode: period.partyCode, periodStartDate: period.periodStartDate, periodEndDate: period.periodEndDate,
      storageChargeUsd: Number(period.storageChargeUsd), handlingInUsd: Number(period.handlingInUsd), handlingOutUsd: Number(period.handlingOutUsd), documentationUsd: Number(period.documentationUsd), deliveryUsd: Number(period.deliveryUsd), recurringFeesUsd: Number(period.recurringFeesUsd), adHocChargesUsd: Number(period.adHocChargesUsd), creditsAppliedUsd: Number(period.creditsAppliedUsd), billingStatementTotalUsd: Number(period.billingStatementTotalUsd), soaOpeningBalanceUsd: Number(period.soaOpeningBalanceUsd), soaPaymentsAppliedUsd: Number(period.soaPaymentsAppliedUsd), soaClosingBalanceUsd: Number(period.soaClosingBalanceUsd), lockedExchangeRatePhp: Number(period.lockedExchangeRatePhp),
    },
    dailyRows: dailyRows.map((row) => ({ date: row.date, beginningCbm: Number(row.beginningCbm), inboundCbm: Number(row.inboundFgCbm) + Number(row.inboundRawCbm), outboundCbm: Number(row.outboundFgCbm) + Number(row.outboundRawCbm), endingCbm: Number(row.endingCbm), rateUsd: Number(row.rateUsd), amountUsd: Number(row.amountUsd) })),
    payments: payments.map((row) => ({ date: row.date, type: row.type, amountUsd: Number(row.amountUsd), notes: row.notes })),
    permits: permits.map((row) => ({ permitNumber: row.permitNumber, itemScope: row.itemScope, validFrom: row.validFrom, validTo: row.validTo, monthlyFeeUsd: Number(row.monthlyFeeUsd) })),
  });
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new NextResponse(body, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${period.periodNumber}-${type}.pdf"`, "Cache-Control": "private, no-store" } });
}

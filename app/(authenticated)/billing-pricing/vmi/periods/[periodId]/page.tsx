import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { and, between, eq, inArray } from "drizzle-orm";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { parties } from "@/lib/db/schema/parties";
import { vmiBillingPeriods, vmiChargeLines, vmiPayments } from "@/lib/db/schema/vmi_billing";
import { generatedDocuments } from "@/lib/db/schema/documents";
import { inventoryCommitments } from "@/lib/db/schema/commitments";
import { pickLists } from "@/lib/db/schema/pick_lists";
import { PaymentForm } from "./_components/PaymentForm";
import { ChargeLineForm } from "./_components/ChargeLineForm";

interface Props {
  params: Promise<{ periodId: string }>;
}

function money(value: string | number | null | undefined): string {
  return `$${Number(value ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function VmiPeriodDetailPage({ params }: Props) {
  const { periodId } = await params;
  const resolver = await createPageResolver();
  const permission = await requirePermission(resolver, "reporting.financial_read");
  if (permission.kind !== "authorized") {
    return <div className="mx-auto max-w-container px-8 py-12 text-center font-body text-body-md text-text-grey">You do not have permission to view billing periods.</div>;
  }

  const [period] = await db
    .select({
      id: vmiBillingPeriods.id,
      periodNumber: vmiBillingPeriods.periodNumber,
      partyId: vmiBillingPeriods.partyId,
      partyName: parties.name,
      periodStartDate: vmiBillingPeriods.periodStartDate,
      periodEndDate: vmiBillingPeriods.periodEndDate,
      billingStatementTotalUsd: vmiBillingPeriods.billingStatementTotalUsd,
      soaOpeningBalanceUsd: vmiBillingPeriods.soaOpeningBalanceUsd,
      soaPaymentsAppliedUsd: vmiBillingPeriods.soaPaymentsAppliedUsd,
      soaClosingBalanceUsd: vmiBillingPeriods.soaClosingBalanceUsd,
      lockedExchangeRatePhp: vmiBillingPeriods.lockedExchangeRatePhp,
      billingStatementArtifactId: vmiBillingPeriods.billingStatementArtifactId,
      warehousingChargesArtifactId: vmiBillingPeriods.warehousingChargesArtifactId,
      soaArtifactId: vmiBillingPeriods.soaArtifactId,
      loaArtifactId: vmiBillingPeriods.loaArtifactId,
      status: vmiBillingPeriods.status,
    })
    .from(vmiBillingPeriods)
    .innerJoin(parties, eq(parties.id, vmiBillingPeriods.partyId))
    .where(eq(vmiBillingPeriods.id, periodId))
    .limit(1);

  if (!period) notFound();

  const artifactReferences = [
    ["Billing Statement", "vmi_billing_statement", period.billingStatementArtifactId],
    ["Warehousing Charges", "vmi_warehousing_charges", period.warehousingChargesArtifactId],
    ["Statement of Account", "vmi_statement_of_account", period.soaArtifactId],
    ["Letter of Authority", "vmi_letter_of_authority", period.loaArtifactId],
  ] as const;
  const artifactIds = artifactReferences
    .map(([, , artifactId]) => artifactId)
    .filter((artifactId): artifactId is string => Boolean(artifactId));
  const artifacts = artifactIds.length === 0 ? [] : await db
    .select({ id: generatedDocuments.id, documentNumber: generatedDocuments.documentNumber, status: generatedDocuments.status })
    .from(generatedDocuments)
    .where(inArray(generatedDocuments.id, artifactIds));
  const artifactsById = new Map(artifacts.map((artifact) => [artifact.id, artifact]));

  const payments = await db
    .select({
      id: vmiPayments.id,
      amountUsd: vmiPayments.amountUsd,
      paymentDate: vmiPayments.paymentDate,
      type: vmiPayments.type,
      notes: vmiPayments.notes,
    })
    .from(vmiPayments)
    .where(eq(vmiPayments.appliedToPeriodId, period.id));

  const lines = await db
    .select({
      id: vmiChargeLines.id,
      chargeType: vmiChargeLines.chargeType,
      amount: vmiChargeLines.amount,
      currency: vmiChargeLines.currency,
      chargeDate: vmiChargeLines.chargeDate,
      receiptNumber: generatedDocuments.documentNumber,
      notes: vmiChargeLines.notes,
    })
    .from(vmiChargeLines)
    .innerJoin(generatedDocuments, eq(generatedDocuments.id, vmiChargeLines.acknowledgementReceiptId))
    .where(and(eq(vmiChargeLines.partyId, period.partyId), between(vmiChargeLines.chargeDate, period.periodStartDate, period.periodEndDate)));

  const receipts = await db
    .select({ id: generatedDocuments.id, documentNumber: generatedDocuments.documentNumber })
    .from(generatedDocuments)
    .innerJoin(inventoryCommitments, eq(inventoryCommitments.id, generatedDocuments.sourceId))
    .innerJoin(pickLists, eq(pickLists.id, inventoryCommitments.pickListId))
    .where(and(eq(generatedDocuments.documentType, "acknowledgement_receipt"), eq(generatedDocuments.sourceType, "inventory_commitment"), eq(pickLists.customerPartyId, period.partyId), eq(generatedDocuments.status, "ready")));

  return (
    <div className="mx-auto max-w-container space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <Link href="/billing-pricing?section=vmi&tab=vmi" className="inline-flex items-center font-body text-body-sm text-text-grey hover:text-brand-navy">
          <ArrowLeft size={16} className="mr-1" /> Back to VMI Billing
        </Link>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-label text-label font-bold uppercase tracking-wider text-text-grey">VMI billing period</p>
            <h1 className="mt-1 font-heading text-headline-lg font-bold text-on-surface">{period.partyName}</h1>
            <p className="mt-1 font-body text-body-md text-text-grey">{period.periodNumber} · {period.periodStartDate} to {period.periodEndDate}</p>
          </div>
          <span className="inline-flex w-fit rounded-full bg-brand-navy/10 px-3 py-1.5 font-label text-label font-bold uppercase text-brand-navy">{period.status}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Billing Statement", money(period.billingStatementTotalUsd)],
          ["SOA Opening Balance", money(period.soaOpeningBalanceUsd)],
          ["Payments Applied", money(period.soaPaymentsAppliedUsd)],
          ["SOA Closing Balance", money(period.soaClosingBalanceUsd)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1">
            <p className="font-label text-label font-bold uppercase tracking-wider text-text-grey">{label}</p>
            <p className="mt-2 font-heading text-data-display font-bold text-on-surface">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1">
          <h2 className="font-heading text-title-md font-bold text-on-surface">Period controls</h2>
          <dl className="mt-4 space-y-3 font-body text-body-sm">
            <div className="flex justify-between gap-4"><dt className="text-text-grey">Locked FX rate</dt><dd className="font-mono font-bold">1 USD = ₱{period.lockedExchangeRatePhp}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-text-grey">Documents</dt><dd><Link href="/documents?tab=soa" className="inline-flex items-center gap-1 font-label text-label font-bold text-brand-blue hover:underline"><FileText size={15} /> Open Documents Center</Link></dd></div>
          </dl>
        </div>
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1">
          <h2 className="font-heading text-title-md font-bold text-on-surface">Payment history</h2>
          {payments.length === 0 ? <p className="mt-3 font-body text-body-sm text-text-grey">No payments or adjustments recorded for this period.</p> : (
            <div className="mt-3 space-y-2">
              {payments.map((payment) => <div key={payment.id} className="flex items-center justify-between gap-3 border-b border-outline-variant/20 py-2 font-body text-body-sm"><span><span className="font-bold">{payment.type}</span> · {payment.paymentDate}{payment.notes ? ` · ${payment.notes}` : ""}</span><span className="font-mono font-bold">{money(payment.amountUsd)}</span></div>)}
            </div>
          )}
        </div>
      </div>

      <section className="rounded-2xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-heading text-title-md font-bold text-on-surface">Required financial documents</h2>
            <p className="mt-1 font-body text-body-sm text-text-grey">All four documents must be ready before the period can be issued.</p>
          </div>
          <Link href="/documents?tab=soa" className="inline-flex w-fit items-center gap-1 font-label text-label font-bold text-brand-blue hover:underline"><FileText size={15} /> Documents Center</Link>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {artifactReferences.map(([label, type, artifactId]) => {
            const artifact = artifactId ? artifactsById.get(artifactId) : undefined;
            const state = artifact?.status ?? "not generated";
            return (
              <div key={label} className="rounded-xl border border-outline-variant/20 bg-surface-light-grey/40 p-4">
                <p className="font-label text-label font-bold text-on-surface">{label}</p>
                <p className={`mt-2 font-body text-body-sm font-bold ${artifact?.status === "ready" ? "text-status-available" : artifact?.status === "failed" ? "text-status-held" : "text-text-grey"}`}>{state}</p>
                <p className="mt-1 truncate font-mono text-mono-sm text-text-grey">{artifact?.documentNumber ?? "Awaiting document pipeline"}</p>
                <Link href={`/api/billing/vmi/${period.id}/documents/${type}`} target="_blank" className="mt-3 inline-flex font-label text-label font-bold text-brand-blue hover:underline">Preview draft PDF</Link>
              </div>
            );
          })}
        </div>
      </section>

      <ChargeLineForm
        partyId={period.partyId}
        periodId={period.id}
        periodStartDate={period.periodStartDate}
        periodEndDate={period.periodEndDate}
        receipts={receipts}
        lines={lines}
        editable={period.status === "draft"}
      />

      {period.status !== "voided" && <PaymentForm partyId={period.partyId} periodId={period.id} />}
    </div>
  );
}

// `/billing-pricing/soa/[id]` — Statement of Account (SOA) & Supporting Document Package View
//
// Displays the finalized SOA and all 7 supporting document sub-schedules:
//   1. Billing Statement / SOA
//   2. Delivery & Distribution Detail
//   3. LOA Detail
//   4. Surety Bond & Other Charges Detail
//   5. Manpower Detail
//   6. Summary of Charges
//   7. Detailed Warehousing Charges (Daily CBM Schedule)

import { FileText } from "@/components/ui/icons";
import { notFound } from "next/navigation";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { listParties } from "@/lib/db/queries/parties";
import { getVmiDailyBalanceRows } from "@/lib/billing/queries/vmi-ledger";
import { getDailyForexRate } from "@/lib/billing/forex-service";
import { getVmiHandlingForPeriod } from "@/lib/billing/vmi-handling";
import { getVmiChargeAggregationForPeriod } from "@/lib/billing/vmi-charge-aggregation";
import { getVmiRecurringFeeAggregationForPeriod } from "@/lib/billing/vmi-recurring-fee-aggregation";
import { getDocumentTemplate } from "@/lib/documents/document-template";
import { WorkflowState } from "@/components/ui/WorkflowState";
import {
  SoaDetailClient,
  type SoaData,
  type DailyStorageRow,
} from "./SoaDetailClient";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ partyId?: string; month?: string; year?: string }>;
}

export default async function SoaDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { partyId: searchPartyId, month: searchMonth, year: searchYear } = await searchParams;

  const resolver = await createPageResolver();
  const permResult = await requirePermission(resolver, "reporting.financial_read");

  if (permResult.kind !== "authorized") {
    return (
      <div className="mx-auto max-w-container px-8 py-12 text-center">
        <FileText size={40} className="mx-auto mb-3 text-text-grey" />
        <p className="font-body text-body-md text-text-grey">
          You do not have permission to view Statement of Account documents.
        </p>
      </div>
    );
  }

  const isUuid = (val: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);

  if (id === "sample") notFound();

  let party: { id: string; code: string; name: string } | null = null;
  const targetPartyId = searchPartyId || id;
  if (targetPartyId) {
    // The detail view only needs the organization identity. Avoid loading
    // optional role/RBE relations here: a problem with those supporting
    // tables must not prevent an SOA from opening.
    const allParties = await listParties(db, { limit: 100 });
    party = allParties.rows.find((p) =>
      (isUuid(targetPartyId) && p.id === targetPartyId) ||
      p.code?.toLowerCase() === targetPartyId.toLowerCase() ||
      p.id.startsWith(targetPartyId) ||
      p.name.toLowerCase().includes(targetPartyId.toLowerCase())
    ) ?? null;
  } else {
    const allParties = await listParties(db, { limit: 1 });
    party = allParties.rows[0] ?? null;
  }

  if (!party) notFound();

  const now = new Date();
  const monthIdx = searchMonth !== undefined ? parseInt(searchMonth, 10) : now.getMonth();
  const year = searchYear !== undefined ? parseInt(searchYear, 10) : now.getFullYear();

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const monthName = monthNames[monthIdx] ?? "June";
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const monthPadded = String(monthIdx + 1).padStart(2, "0");
  const periodStartDate = `${year}-${monthPadded}-01`;
  const periodEndDate = `${year}-${monthPadded}-${String(daysInMonth).padStart(2, "0")}`;

  const targetDate = `${year}-${monthPadded}-01`;
  const exchangeRate = await getDailyForexRate(targetDate);

  let storageAmount = 0;
  let handlingInUsd = 0;
  let handlingOutUsd = 0;
  let deliveryUsd = 0;
  let documentationUsd = 0;
  let loaFeeUsd = 0;
  let truckingAdminUsd = 0;
  let suretyBondUsd = 0;
  const ctfUsd = 0.0;
  let customCbmRows: DailyStorageRow[] | undefined = undefined;
  let calculationUnavailable = false;

  {
      // 1. Warehousing CBM Daily Ledger Rows & Storage Sum
      try {
        const dailyRows = await getVmiDailyBalanceRows(party.id, monthIdx, year);
        storageAmount = Number(
          dailyRows.reduce((sum, r) => sum + r.storageAmountUsd, 0).toFixed(2)
        );
        customCbmRows = dailyRows.map((r) => ({
          date: r.ledgerDate,
          beg: r.beginningCbm,
          inFg: r.inFgCbm,
          inRaw: r.inRawCbm,
          outFg: r.outFgCbm,
          outRaw: r.outRawCbm,
          end: r.endingCbm,
          rate: r.appliedStorageRateUsd,
          amount: r.storageAmountUsd,
        }));
      } catch (error) {
        calculationUnavailable = true;
        console.error("SOA detail: daily balance data unavailable", error);
      }

      // 2. Handling In / Out Movement Aggregation
      try {
        const handling = await getVmiHandlingForPeriod(
          db,
          party.id,
          periodStartDate,
          periodEndDate
        );
        handlingInUsd = Number(handling.handlingInUsd.toFixed(2));
        handlingOutUsd = Number(handling.handlingOutUsd.toFixed(2));
      } catch (error) {
        calculationUnavailable = true;
        console.error("SOA detail: handling data unavailable", error);
      }

      // 3. Documentation, Delivery & Ad-hoc Charges
      try {
        const charges = await getVmiChargeAggregationForPeriod(db, {
          partyId: party.id,
          periodStartDate,
          periodEndDate,
          lockedExchangeRatePhp: exchangeRate,
        });
        documentationUsd = Number(charges.documentationUsd.toFixed(2));
        deliveryUsd = Number(charges.deliveryUsd.toFixed(2));
      } catch (error) {
        calculationUnavailable = true;
        console.error("SOA detail: charge data unavailable", error);
      }

      // 4. Recurring Fees (LOA, Trucking Admin, Surety Bond, Manpower)
      try {
        const recurring = await getVmiRecurringFeeAggregationForPeriod(db, {
          partyId: party.id,
          periodStartDate,
          periodEndDate,
          lockedExchangeRatePhp: exchangeRate,
        });
        const loaLine = recurring.lines.find((l) => l.feeType === "loa");
        const truckLine = recurring.lines.find((l) => l.feeType === "trucking_admin_fee");
        const suretyLine = recurring.lines.find((l) => l.feeType === "surety_bond");
        if (loaLine) loaFeeUsd = Number(loaLine.amountUsd.toFixed(2));
        if (truckLine) truckingAdminUsd = Number(truckLine.amountUsd.toFixed(2));
        if (suretyLine) suretyBondUsd = Number(suretyLine.amountUsd.toFixed(2));
      } catch (error) {
        calculationUnavailable = true;
        console.error("SOA detail: recurring fee data unavailable", error);
      }
  }

  if (calculationUnavailable) {
    return (
      <div className="mx-auto max-w-container px-8 py-12">
        <WorkflowState
          kind="unavailable"
          title="Statement data unavailable"
          description="The system could not load every billing component for this Organization and period. No zero-value substitute was shown. Refresh and retry, or contact an administrator if the issue continues."
          actionLabel="Back to SOA directory"
          actionHref="/billing-pricing/soa"
        />
      </div>
    );
  }

  const customerName = party.name;
  const customerCode = party.code ?? "UNASSIGNED";
  const soaNumber = `SOA-${year}-${monthPadded}-${customerCode}`;

  const totalAmount = Number(
    (
      storageAmount +
      deliveryUsd +
      documentationUsd +
      handlingInUsd +
      handlingOutUsd +
      loaFeeUsd +
      truckingAdminUsd +
      suretyBondUsd +
      ctfUsd
    ).toFixed(2)
  );

  const soaData: SoaData = {
    soaNumber,
    customerName,
    customerCode,
    customerAddress: "",
    contractNumber: "Not recorded",
    billingPeriod: `${monthName} 1 \u2013 ${monthName} ${daysInMonth}, ${year}`,
    billingPeriodStart: `${monthName} 1, ${year}`,
    billingPeriodEnd: `${monthName} ${daysInMonth}, ${year}`,
    issueDate: `${year}-${monthPadded}-01`,
    dueDate: `${year}-${monthPadded}-${daysInMonth}`,
    currency: "USD",
    exchangeRate,
    openingBalanceUsd: 0.0,
    currentChargesUsd: totalAmount,
    debitAdjustmentsUsd: 0.0,
    creditsUsd: 0.0,
    paymentsAppliedUsd: 0.0,
    outstandingBalanceUsd: totalAmount,
    categories: [
      { name: "Warehousing (Daily CBM Storage)", code: "WH-STORAGE", amount: storageAmount, sectionId: "section-7" },
      { name: "Delivery & Distribution Charges", code: "DELIVERY", amount: deliveryUsd, sectionId: "section-2" },
      { name: "Documentation Charges (DR / POD)", code: "DOCUMENTATION", amount: documentationUsd, sectionId: "section-2" },
      { name: "Handling IN (Receiving & Stripping)", code: "HANDLING-IN", amount: handlingInUsd, sectionId: "section-5" },
      { name: "Handling OUT (Picking & Loading)", code: "HANDLING-OUT", amount: handlingOutUsd, sectionId: "section-5" },
      { name: "Letter of Authority (LOA) Monthly Fee", code: "LOA-FEE", amount: loaFeeUsd, sectionId: "section-3" },
      { name: "Trucking Administrative Fee", code: "TRUCK-ADMIN", amount: truckingAdminUsd, sectionId: "section-4" },
      { name: "Surety Bond Fee", code: "SURETY-BOND", amount: suretyBondUsd, sectionId: "section-4" },
      { name: "Container Transfer Fee (CTF)", code: "CTF-FEE", amount: ctfUsd, sectionId: "section-4" },
    ],
  };

  return <SoaDetailClient soaData={soaData} cbmRows={customCbmRows} documentTemplate={await getDocumentTemplate(db)} />;
}


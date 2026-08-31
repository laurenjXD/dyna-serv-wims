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

import { FileText } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { getPartyWithRoles } from "@/lib/db/queries/parties";
import { getVmiDailyBalanceRows } from "@/lib/billing/queries/vmi-ledger";
import { getDailyForexRate } from "@/lib/billing/forex-service";
import { SoaDetailClient, type SoaData } from "./SoaDetailClient";

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

  const targetPartyId = searchPartyId || (id !== "sample" ? id : "");
  const party = targetPartyId ? await getPartyWithRoles(db, targetPartyId) : null;

  const now = new Date();
  const monthIdx = searchMonth !== undefined ? parseInt(searchMonth, 10) : now.getMonth();
  const year = searchYear !== undefined ? parseInt(searchYear, 10) : now.getFullYear();

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const monthName = monthNames[monthIdx] ?? "June";
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();

  let storageAmount = 1116.9;
  if (party) {
    const dailyRows = await getVmiDailyBalanceRows(party.id, monthIdx, year);
    if (dailyRows.length > 0) {
      storageAmount = dailyRows.reduce((sum, r) => sum + r.storageAmountUsd, 0);
    }
  }

  const customerName = party ? party.name : "United Philippine Industrial";
  const customerCode = party ? party.code : "UPI";
  const soaNumber = `SOA-${year}-${String(monthIdx + 1).padStart(2, "0")}-${customerCode}`;
  const targetDate = `${year}-${String(monthIdx + 1).padStart(2, "0")}-01`;
  const exchangeRate = await getDailyForexRate(targetDate);
  const deliveryPhp = 40896.0;
  const deliveryUsd = Number((deliveryPhp / exchangeRate).toFixed(2));

  const totalAmount = storageAmount + deliveryUsd + 420.0 + 220.05 + 368.14 + 36.0 + 200.0;

  const soaData: SoaData = {
    soaNumber,
    customerName,
    customerCode,
    contractNumber: `DSGC-VMI-${year}-001`,
    billingPeriod: `${monthName} 1 – ${monthName} ${daysInMonth}, ${year}`,
    issueDate: `${year}-${String(monthIdx + 1).padStart(2, "0")}-01`,
    dueDate: `${year}-${String(monthIdx + 1).padStart(2, "0")}-${daysInMonth}`,
    currency: "USD",
    exchangeRate,
    openingBalanceUsd: 0.0,
    currentChargesUsd: Number(totalAmount.toFixed(2)),
    debitAdjustmentsUsd: 0.0,
    creditsUsd: 0.0,
    paymentsAppliedUsd: 0.0,
    outstandingBalanceUsd: Number(totalAmount.toFixed(2)),
    categories: [
      { name: "Warehousing (Daily CBM Storage)", code: "WH-STORAGE", amount: Number(storageAmount.toFixed(2)), sectionId: "section-7" },
      { name: "Delivery & Distribution Charges", code: "DELIVERY", amount: deliveryUsd, sectionId: "section-2" },
      { name: "Documentation Charges (DR / POD)", code: "DOCUMENTATION", amount: 420.0, sectionId: "section-2" },
      { name: "Handling IN (Receiving & Stripping)", code: "HANDLING-IN", amount: 220.05, sectionId: "section-5" },
      { name: "Handling OUT (Picking & Loading)", code: "HANDLING-OUT", amount: 368.14, sectionId: "section-5" },
      { name: "Letter of Authority (LOA) Monthly Fee", code: "LOA-FEE", amount: 36.0, sectionId: "section-3" },
      { name: "Trucking Administrative Fee", code: "TRUCK-ADMIN", amount: 200.0, sectionId: "section-4" },
      { name: "Surety Bond Fee", code: "SURETY-BOND", amount: 0.0, sectionId: "section-4" },
      { name: "Container Transfer Fee (CTF)", code: "CTF-FEE", amount: 0.0, sectionId: "section-4" },
    ],
  };

  return <SoaDetailClient soaData={soaData} />;
}


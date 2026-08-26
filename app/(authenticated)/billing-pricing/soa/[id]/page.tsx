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
import { SoaDetailClient, type SoaData } from "./SoaDetailClient";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SoaDetailPage({ params }: PageProps) {
  const { id } = await params;

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

  // June 2026 Canonical Billing Fixture Data matching June Statement ($3,023.80 Total)
  const soaData: SoaData = {
    soaNumber: `SOA-2026-06-${id.slice(0, 4).toUpperCase()}`,
    customerName: "United Philippine Industrial",
    customerCode: "UPI",
    contractNumber: "DSGC-VMI-2026-001",
    billingPeriod: "June 1 – June 30, 2026",
    issueDate: "2026-07-01",
    dueDate: "2026-07-31",
    currency: "USD",
    exchangeRate: 61.71,
    openingBalanceUsd: 0.0,
    currentChargesUsd: 3023.8,
    debitAdjustmentsUsd: 0.0,
    creditsUsd: 0.0,
    paymentsAppliedUsd: 0.0,
    outstandingBalanceUsd: 3023.8,
    categories: [
      { name: "Warehousing (Daily CBM Storage)", code: "WH-STORAGE", amount: 1116.9, sectionId: "section-7" },
      { name: "Delivery & Distribution Charges", code: "DELIVERY", amount: 662.71, sectionId: "section-2" },
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


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

import Link from "next/link";
import { ArrowLeft, Download, Printer, ShieldCheck, Layers, FileText, CheckCircle } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";

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

  // Sample dynamic data fixture matching real June statement
  const soaData = {
    soaNumber: `SOA-2026-06-${id.slice(0, 4).toUpperCase()}`,
    customerName: "United Philippine Industrial (UPI)",
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
      { name: "Warehousing (Daily CBM Storage)", code: "WH-STORAGE", amount: 1116.9 },
      { name: "Delivery & Distribution Charges", code: "DELIVERY", amount: 662.71 },
      { name: "Documentation Charges (DR / POD)", code: "DOCUMENTATION", amount: 420.0 },
      { name: "Handling IN (Receiving & Stripping)", code: "HANDLING-IN", amount: 220.05 },
      { name: "Handling OUT (Picking & Loading)", code: "HANDLING-OUT", amount: 368.14 },
      { name: "Letter of Authority (LOA) Monthly Fee", code: "LOA-FEE", amount: 36.0 },
      { name: "Trucking Administrative Fee", code: "TRUCK-ADMIN", amount: 200.0 },
      { name: "Surety Bond Fee", code: "SURETY-BOND", amount: 0.0 },
      { name: "Container Transfer Fee (CTF)", code: "CTF-FEE", amount: 0.0 },
    ],
  };

  return (
    <div className="mx-auto max-w-container space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* Action Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border-light pb-4">
        <div>
          <Link
            href="/billing-pricing"
            className="inline-flex items-center text-body-sm text-text-grey hover:text-brand-blue"
          >
            <ArrowLeft size={16} className="mr-1" /> Back to Billing Dashboard
          </Link>
          <div className="mt-2 flex items-center gap-3">
            <h1 className="font-heading text-heading-lg font-bold text-text-dark">
              Statement of Account: {soaData.soaNumber}
            </h1>
            <span className="rounded-full bg-green-100 px-3 py-1 font-body text-body-xs font-semibold text-green-800 uppercase">
              Finalized & Posted
            </span>
          </div>
          <p className="font-body text-body-sm text-text-grey">
            Customer: <strong className="text-text-dark">{soaData.customerName}</strong> &bull; Period:{" "}
            <span className="font-mono font-medium">{soaData.billingPeriod}</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button className="inline-flex items-center rounded-btn bg-surface-white border border-border-medium px-4 py-2 font-body text-body-sm font-semibold text-text-dark hover:bg-surface-background shadow-card transition-colors">
            <Printer size={16} className="mr-2" /> Print Package
          </button>
          <button className="inline-flex items-center rounded-btn bg-brand-blue px-4 py-2 font-body text-body-sm font-semibold text-white shadow-card hover:bg-brand-blue-dark transition-colors">
            <Download size={16} className="mr-2" /> Download PDF Package
          </button>
        </div>
      </div>

      {/* Running AR Balance Card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-card bg-surface-white border border-border-light p-4 shadow-card">
          <span className="font-body text-body-xs text-text-grey uppercase">Opening Balance</span>
          <p className="font-mono text-mono-xl font-bold text-text-dark mt-1">
            ${soaData.openingBalanceUsd.toFixed(2)}
          </p>
        </div>
        <div className="rounded-card bg-surface-white border border-border-light p-4 shadow-card">
          <span className="font-body text-body-xs text-text-grey uppercase">Current Period Charges</span>
          <p className="font-mono text-mono-xl font-bold text-brand-blue mt-1">
            ${soaData.currentChargesUsd.toFixed(2)}
          </p>
        </div>
        <div className="rounded-card bg-surface-white border border-border-light p-4 shadow-card">
          <span className="font-body text-body-xs text-text-grey uppercase">Payments / Credits</span>
          <p className="font-mono text-mono-xl font-bold text-green-700 mt-1">
            ${soaData.paymentsAppliedUsd.toFixed(2)}
          </p>
        </div>
        <div className="rounded-card bg-surface-white border-2 border-brand-blue/30 p-4 shadow-card bg-brand-blue/5">
          <span className="font-body text-body-xs text-brand-blue font-semibold uppercase">Total Outstanding Balance</span>
          <p className="font-mono text-mono-xl font-bold text-brand-blue mt-1">
            ${soaData.outstandingBalanceUsd.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Section 1 & Section 6: Summary of Charges Table with Drill-Down Traceability */}
      <div className="rounded-card bg-surface-white border border-border-light shadow-card overflow-hidden">
        <div className="border-b border-border-light bg-surface-background p-4 flex justify-between items-center">
          <h2 className="font-heading text-heading-md font-bold text-text-dark">
            Section 6: Summary of Charges & Drill-Down Traceability
          </h2>
          <span className="font-mono text-mono-xs text-text-grey">
            Locked FX Rate: 1 USD = ₱{soaData.exchangeRate}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse font-body text-body-sm">
            <thead>
              <tr className="border-b border-border-light bg-surface-background text-text-grey text-body-xs uppercase">
                <th className="py-3 px-4">Charge Category</th>
                <th className="py-3 px-4">Charge Code</th>
                <th className="py-3 px-4 text-right">Amount (USD)</th>
                <th className="py-3 px-4 text-right">Amount (PHP)</th>
                <th className="py-3 px-4 text-right">Traceability</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light text-text-dark">
              {soaData.categories.map((cat, idx) => (
                <tr key={idx} className="hover:bg-surface-background/50 transition-colors">
                  <td className="py-3.5 px-4 font-semibold">{cat.name}</td>
                  <td className="py-3.5 px-4 font-mono text-body-xs text-text-grey">{cat.code}</td>
                  <td className="py-3.5 px-4 text-right font-mono font-bold">
                    ${cat.amount.toFixed(2)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-text-grey">
                    ₱{(cat.amount * soaData.exchangeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <button className="inline-flex items-center text-body-xs font-semibold text-brand-blue hover:underline">
                      View Calculation Details &rarr;
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="bg-surface-background font-bold text-heading-sm border-t-2 border-border-medium">
                <td colSpan={2} className="py-4 px-4 font-heading text-text-dark">
                  TOTAL CURRENT PERIOD CHARGES
                </td>
                <td className="py-4 px-4 text-right font-mono text-brand-blue">
                  ${soaData.currentChargesUsd.toFixed(2)}
                </td>
                <td className="py-4 px-4 text-right font-mono text-brand-blue">
                  ₱{(soaData.currentChargesUsd * soaData.exchangeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="py-4 px-4"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 7 Supporting Document Schedules Preview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-card bg-surface-white border border-border-light p-6 shadow-card space-y-3">
          <div className="flex items-center justify-between border-b pb-2">
            <h3 className="font-heading text-heading-sm font-semibold text-text-dark">
              Section 7: Warehousing Schedule
            </h3>
            <span className="font-mono text-mono-xs bg-brand-blue/10 text-brand-blue px-2 py-0.5 rounded">
              30 Days Unrolled
            </span>
          </div>
          <p className="font-body text-body-xs text-text-grey">
            Day-by-day CBM calculations (Beginning, IN FG/Raw, OUT FG/Raw, Ending CBM, Daily Amount).
          </p>
          <div className="pt-2">
            <span className="font-mono text-mono-sm font-bold text-text-dark">
              June Total: $1,116.90 (792.02 Beginning CBM &rarr; 686.24 Ending CBM)
            </span>
          </div>
        </div>

        <div className="rounded-card bg-surface-white border border-border-light p-6 shadow-card space-y-3">
          <div className="flex items-center justify-between border-b pb-2">
            <h3 className="font-heading text-heading-sm font-semibold text-text-dark">
              Section 2: Delivery & Distribution
            </h3>
            <span className="font-mono text-mono-xs bg-brand-blue/10 text-brand-blue px-2 py-0.5 rounded">
              DR / POD Schedule
            </span>
          </div>
          <p className="font-body text-body-xs text-text-grey">
            Consignee delivery runs, DR references, delivery charges, doc fees, and co-load remarks.
          </p>
          <div className="pt-2">
            <span className="font-mono text-mono-sm font-bold text-text-dark">
              Delivery Total: $662.71 (₱40,896.00 @ 61.71 FX)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

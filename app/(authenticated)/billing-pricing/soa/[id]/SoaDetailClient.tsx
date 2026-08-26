"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, Download, CheckCircle2, ChevronRight, FileSpreadsheet } from "lucide-react";

export interface SoaCategory {
  name: string;
  code: string;
  amount: number;
  sectionId: string;
}

export interface SoaData {
  soaNumber: string;
  customerName: string;
  customerCode: string;
  contractNumber: string;
  billingPeriod: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  exchangeRate: number;
  openingBalanceUsd: number;
  currentChargesUsd: number;
  debitAdjustmentsUsd: number;
  creditsUsd: number;
  paymentsAppliedUsd: number;
  outstandingBalanceUsd: number;
  categories: SoaCategory[];
}

interface SoaDetailClientProps {
  soaData: SoaData;
}

export function SoaDetailClient({ soaData }: SoaDetailClientProps) {
  const [activeSection, setActiveSection] = useState<string>("all");
  const [highlightedSection, setHighlightedSection] = useState<string | null>(null);

  const handleTraceClick = (sectionId: string) => {
    setActiveSection("all");
    setHighlightedSection(sectionId);

    const elem = document.getElementById(sectionId);
    if (elem) {
      elem.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    setTimeout(() => {
      setHighlightedSection(null);
    }, 3000);
  };

  // Sample 30-day June warehousing CBM replay fixture matching June total $1,116.90
  const juneDailyCbmRows = [
    { date: "2026-06-01", beg: 792.02, inFg: 0.0, inRaw: 0.0, outFg: 0.0, outRaw: 0.0, end: 792.02, rate: 0.05, amount: 39.60 },
    { date: "2026-06-02", beg: 792.02, inFg: 0.0, inRaw: 0.0, outFg: 0.0, outRaw: 0.0, end: 792.02, rate: 0.05, amount: 39.60 },
    { date: "2026-06-03", beg: 792.02, inFg: 0.0, inRaw: 0.0, outFg: 0.0, outRaw: 0.0, end: 792.02, rate: 0.05, amount: 39.60 },
    { date: "2026-06-04", beg: 792.02, inFg: 0.0, inRaw: 0.0, outFg: 0.0, outRaw: 0.0, end: 792.02, rate: 0.05, amount: 39.60 },
    { date: "2026-06-05", beg: 792.02, inFg: 0.0, inRaw: 0.0, outFg: 0.0, outRaw: 0.0, end: 792.02, rate: 0.05, amount: 39.60 },
    { date: "2026-06-06", beg: 792.02, inFg: 0.0, inRaw: 0.0, outFg: 0.0, outRaw: 0.0, end: 792.02, rate: 0.05, amount: 39.60 },
    { date: "2026-06-07", beg: 792.02, inFg: 0.0, inRaw: 0.0, outFg: 0.0, outRaw: 0.0, end: 792.02, rate: 0.05, amount: 39.60 },
    { date: "2026-06-08", beg: 792.02, inFg: 0.0, inRaw: 0.0, outFg: 0.0, outRaw: 0.0, end: 792.02, rate: 0.05, amount: 39.60 },
    { date: "2026-06-09", beg: 792.02, inFg: 0.0, inRaw: 0.0, outFg: 0.0, outRaw: 0.0, end: 792.02, rate: 0.05, amount: 39.60 },
    { date: "2026-06-10", beg: 792.02, inFg: 0.0, inRaw: 0.0, outFg: 0.0, outRaw: 0.0, end: 792.02, rate: 0.05, amount: 39.60 },
    { date: "2026-06-11", beg: 792.02, inFg: 15.0, inRaw: 0.0, outFg: 0.0, outRaw: 0.0, end: 807.02, rate: 0.05, amount: 40.35 },
    { date: "2026-06-12", beg: 807.02, inFg: 0.0, inRaw: 0.0, outFg: 0.0, outRaw: 0.0, end: 807.02, rate: 0.05, amount: 40.35 },
    { date: "2026-06-13", beg: 807.02, inFg: 0.0, inRaw: 0.0, outFg: 0.0, outRaw: 0.0, end: 807.02, rate: 0.05, amount: 40.35 },
    { date: "2026-06-14", beg: 807.02, inFg: 0.0, inRaw: 0.0, outFg: 0.0, outRaw: 0.0, end: 807.02, rate: 0.05, amount: 40.35 },
    { date: "2026-06-15", beg: 807.02, inFg: 0.0, inRaw: 0.0, outFg: 0.0, outRaw: 0.0, end: 807.02, rate: 0.05, amount: 40.35 },
    { date: "2026-06-16", beg: 807.02, inFg: 0.0, inRaw: 0.0, outFg: 0.0, outRaw: 0.0, end: 807.02, rate: 0.05, amount: 40.35 },
    { date: "2026-06-17", beg: 807.02, inFg: 0.0, inRaw: 0.0, outFg: 0.0, outRaw: 0.0, end: 807.02, rate: 0.05, amount: 40.35 },
    { date: "2026-06-18", beg: 807.02, inFg: 0.0, inRaw: 0.0, outFg: 0.0, outRaw: 0.0, end: 807.02, rate: 0.05, amount: 40.35 },
    { date: "2026-06-19", beg: 807.02, inFg: 0.0, inRaw: 0.0, outFg: 0.0, outRaw: 0.0, end: 807.02, rate: 0.05, amount: 40.35 },
    { date: "2026-06-20", beg: 807.02, inFg: 0.0, inRaw: 0.0, outFg: 0.0, outRaw: 0.0, end: 807.02, rate: 0.05, amount: 40.35 },
    { date: "2026-06-21", beg: 807.02, inFg: 0.0, inRaw: 0.0, outFg: 120.78, outRaw: 0.0, end: 686.24, rate: 0.05, amount: 34.31 },
    { date: "2026-06-22", beg: 686.24, inFg: 0.0, inRaw: 0.0, outFg: 0.0, outRaw: 0.0, end: 686.24, rate: 0.05, amount: 34.31 },
    { date: "2026-06-23", beg: 686.24, inFg: 0.0, inRaw: 0.0, outFg: 0.0, outRaw: 0.0, end: 686.24, rate: 0.05, amount: 34.31 },
    { date: "2026-06-24", beg: 686.24, inFg: 0.0, inRaw: 0.0, outFg: 0.0, outRaw: 0.0, end: 686.24, rate: 0.05, amount: 34.31 },
    { date: "2026-06-25", beg: 686.24, inFg: 0.0, inRaw: 0.0, outFg: 0.0, outRaw: 0.0, end: 686.24, rate: 0.05, amount: 34.31 },
    { date: "2026-06-26", beg: 686.24, inFg: 0.0, inRaw: 0.0, outFg: 0.0, outRaw: 0.0, end: 686.24, rate: 0.05, amount: 34.31 },
    { date: "2026-06-27", beg: 686.24, inFg: 0.0, inRaw: 0.0, outFg: 0.0, outRaw: 0.0, end: 686.24, rate: 0.05, amount: 34.31 },
    { date: "2026-06-28", beg: 686.24, inFg: 0.0, inRaw: 0.0, outFg: 0.0, outRaw: 0.0, end: 686.24, rate: 0.05, amount: 34.31 },
    { date: "2026-06-29", beg: 686.24, inFg: 0.0, inRaw: 0.0, outFg: 0.0, outRaw: 0.0, end: 686.24, rate: 0.05, amount: 34.31 },
    { date: "2026-06-30", beg: 686.24, inFg: 0.0, inRaw: 0.0, outFg: 0.0, outRaw: 0.0, end: 686.24, rate: 0.05, amount: 34.31 },
  ];

  // Delivery DR Schedule matching June delivery total $662.71
  const deliveryRows = [
    { date: "2026-06-05", dr: "DR-2026-06-014", consignee: "UPI Cavite Plant 1", delCharge: 150.00, docCharge: 70.00, remarks: "Co-load Zone 1" },
    { date: "2026-06-12", dr: "DR-2026-06-019", consignee: "UPI Laguna Warehouse", delCharge: 185.00, docCharge: 70.00, remarks: "Full Truck Load" },
    { date: "2026-06-18", dr: "DR-2026-06-025", consignee: "UPI Batangas Facility", delCharge: 177.71, docCharge: 140.00, remarks: "Co-load Zone 2" },
    { date: "2026-06-26", dr: "DR-2026-06-031", consignee: "UPI Manila Main", delCharge: 150.00, docCharge: 140.00, remarks: "Co-load Zone 1" },
  ];

  // LOA Schedule matching June LOA total $36.00
  const loaRows = [
    { permit: "LOA-2026-889", scope: "PEZA Duty-Free Tax Exemption Permit", validFrom: "2026-01-01", validTo: "2026-12-31", rate: 36.00 },
  ];

  // Other Charges matching Surety Bond ($0), CTF ($0), Trucking Admin ($200)
  const otherChargesRows = [
    { name: "Trucking Administrative Fee", code: "TRUCK-ADMIN", basis: "flat", amount: 200.00, notes: "Monthly fleet scheduling & POD archiving fee" },
    { name: "Surety Bond Fee", code: "SURETY-BOND", basis: "flat", amount: 0.00, notes: "Waived under Contract DSGC-VMI-2026-001" },
    { name: "Container Transfer Fee (CTF)", code: "CTF-FEE", basis: "flat", amount: 0.00, notes: "No container transfers logged for June 2026" },
  ];

  // Manpower Schedule matching Handling IN ($220.05) & Handling OUT ($368.14)
  const manpowerRows = [
    { role: "Receiving & Stripping Team", hours: 44.01, rate: 5.00, amount: 220.05, notes: "WRR Inbound Stripping (44.01 hrs @ $5/hr)" },
    { role: "Picking & Loading Team", hours: 73.63, rate: 5.00, amount: 368.14, notes: "Outbound Pick & Staging (73.63 hrs @ $5/hr)" },
  ];

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
            <span className="rounded-full bg-green-100 px-3 py-1 font-body text-body-xs font-semibold text-green-800 uppercase flex items-center">
              <CheckCircle2 size={14} className="mr-1" /> Finalized &amp; Posted
            </span>
          </div>
          <p className="font-body text-body-sm text-text-grey">
            Customer: <strong className="text-text-dark">{soaData.customerName}</strong> ({soaData.customerCode}) &bull; Period:{" "}
            <span className="font-mono font-medium">{soaData.billingPeriod}</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center rounded-btn bg-surface-white border border-border-medium px-4 py-2 font-body text-body-sm font-semibold text-text-dark hover:bg-surface-background shadow-card transition-colors"
          >
            <Printer size={16} className="mr-2" /> Print Package
          </button>
          <button
            onClick={() => alert("Downloading 7-Document Supporting Billing Package (PDF)...")}
            className="inline-flex items-center rounded-btn bg-brand-blue px-4 py-2 font-body text-body-sm font-semibold text-white shadow-card hover:bg-brand-blue-dark transition-colors"
          >
            <Download size={16} className="mr-2" /> Download PDF Package
          </button>
        </div>
      </div>

      {/* Quick Jump Section Pills */}
      <div className="flex flex-wrap items-center gap-2 bg-surface-background p-2 rounded-btn border border-border-light">
        <span className="font-body text-body-xs font-bold text-text-grey px-2">Jump to Schedule:</span>
        <button
          onClick={() => setActiveSection("all")}
          className={`px-3 py-1 rounded-btn font-body text-body-xs font-semibold transition-colors ${
            activeSection === "all" ? "bg-brand-blue text-white" : "bg-surface-white text-text-dark hover:bg-surface-background"
          }`}
        >
          All 7 Sections
        </button>
        <button
          onClick={() => handleTraceClick("section-6")}
          className="px-3 py-1 rounded-btn bg-surface-white font-body text-body-xs font-semibold text-text-dark hover:bg-surface-background border border-border-medium"
        >
          Sec 6: Summary
        </button>
        <button
          onClick={() => handleTraceClick("section-7")}
          className="px-3 py-1 rounded-btn bg-surface-white font-body text-body-xs font-semibold text-text-dark hover:bg-surface-background border border-border-medium"
        >
          Sec 7: Daily CBM Storage
        </button>
        <button
          onClick={() => handleTraceClick("section-2")}
          className="px-3 py-1 rounded-btn bg-surface-white font-body text-body-xs font-semibold text-text-dark hover:bg-surface-background border border-border-medium"
        >
          Sec 2: Delivery &amp; Distribution
        </button>
        <button
          onClick={() => handleTraceClick("section-3")}
          className="px-3 py-1 rounded-btn bg-surface-white font-body text-body-xs font-semibold text-text-dark hover:bg-surface-background border border-border-medium"
        >
          Sec 3: LOA Permit
        </button>
        <button
          onClick={() => handleTraceClick("section-4")}
          className="px-3 py-1 rounded-btn bg-surface-white font-body text-body-xs font-semibold text-text-dark hover:bg-surface-background border border-border-medium"
        >
          Sec 4: Other Charges
        </button>
        <button
          onClick={() => handleTraceClick("section-5")}
          className="px-3 py-1 rounded-btn bg-surface-white font-body text-body-xs font-semibold text-text-dark hover:bg-surface-background border border-border-medium"
        >
          Sec 5: Manpower
        </button>
      </div>

      {/* Running AR Balance Card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-card bg-surface-white border border-border-light p-4 shadow-card">
          <span className="font-body text-body-xs text-text-grey uppercase font-semibold">Opening Balance</span>
          <p className="font-mono text-mono-xl font-bold text-text-dark mt-1">
            ${soaData.openingBalanceUsd.toFixed(2)}
          </p>
        </div>
        <div className="rounded-card bg-surface-white border border-border-light p-4 shadow-card">
          <span className="font-body text-body-xs text-text-grey uppercase font-semibold">Current Period Charges</span>
          <p className="font-mono text-mono-xl font-bold text-brand-blue mt-1">
            ${soaData.currentChargesUsd.toFixed(2)}
          </p>
        </div>
        <div className="rounded-card bg-surface-white border border-border-light p-4 shadow-card">
          <span className="font-body text-body-xs text-text-grey uppercase font-semibold">Payments / Credits</span>
          <p className="font-mono text-mono-xl font-bold text-green-700 mt-1">
            ${soaData.paymentsAppliedUsd.toFixed(2)}
          </p>
        </div>
        <div className="rounded-card bg-surface-white border-2 border-brand-blue/30 p-4 shadow-card bg-brand-blue/5">
          <span className="font-body text-body-xs text-brand-blue font-bold uppercase">Total Outstanding Balance</span>
          <p className="font-mono text-mono-xl font-bold text-brand-blue mt-1">
            ${soaData.outstandingBalanceUsd.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Section 6: Summary of Charges & Drill-Down Traceability */}
      <div
        id="section-6"
        className={`rounded-card bg-surface-white border transition-all duration-500 shadow-card overflow-hidden ${
          highlightedSection === "section-6" ? "border-2 border-brand-blue ring-4 ring-brand-blue/20" : "border-border-light"
        }`}
      >
        <div className="border-b border-border-light bg-surface-background p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <h2 className="font-heading text-heading-md font-bold text-text-dark flex items-center">
              Section 6: Summary of Charges &amp; Drill-Down Traceability
            </h2>
            <p className="font-body text-body-xs text-text-grey mt-0.5">
              Click &quot;View Calculation Details →&quot; on any line item to jump directly to its underlying calculation schedule below.
            </p>
          </div>
          <span className="font-mono text-mono-xs bg-surface-white border border-border-medium px-3 py-1 rounded text-text-dark font-semibold">
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
                    <button
                      onClick={() => handleTraceClick(cat.sectionId)}
                      className="inline-flex items-center text-body-xs font-bold text-brand-blue hover:text-brand-blue-dark hover:underline"
                    >
                      View Calculation Details <ChevronRight size={14} className="ml-1" />
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

      {/* Section 7: Detailed Warehousing Daily CBM Calculation Schedule */}
      <div
        id="section-7"
        className={`rounded-card bg-surface-white border transition-all duration-500 shadow-card overflow-hidden ${
          highlightedSection === "section-7" ? "border-2 border-brand-blue ring-4 ring-brand-blue/20" : "border-border-light"
        }`}
      >
        <div className="border-b border-border-light bg-surface-background p-4 flex justify-between items-center">
          <div>
            <h2 className="font-heading text-heading-md font-bold text-text-dark flex items-center">
              <FileSpreadsheet size={20} className="mr-2 text-brand-blue" />
              Section 7: Detailed Warehousing Daily CBM Calculation Schedule
            </h2>
            <p className="font-body text-body-xs text-text-grey mt-0.5">
              30-Day Unrolled Inventory Replay (Beginning CBM, Inbound FG/Raw, Outbound FG/Raw, Ending CBM, Daily Storage Fee).
            </p>
          </div>
          <span className="font-mono text-mono-xs bg-brand-blue/10 text-brand-blue px-3 py-1 rounded font-bold">
            Subtotal: $1,116.90
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse font-body text-body-xs">
            <thead>
              <tr className="border-b border-border-light bg-surface-background text-text-grey uppercase font-semibold">
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3 text-right">Beg. CBM</th>
                <th className="py-2.5 px-3 text-right text-green-700">IN FG CBM</th>
                <th className="py-2.5 px-3 text-right text-green-700">IN Raw CBM</th>
                <th className="py-2.5 px-3 text-right text-red-700">OUT FG CBM</th>
                <th className="py-2.5 px-3 text-right text-red-700">OUT Raw CBM</th>
                <th className="py-2.5 px-3 text-right font-bold">Ending CBM</th>
                <th className="py-2.5 px-3 text-right">Rate ($/CBM/day)</th>
                <th className="py-2.5 px-3 text-right font-bold text-brand-blue">Daily Amount ($)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light font-mono text-text-dark">
              {juneDailyCbmRows.map((r, idx) => (
                <tr key={idx} className="hover:bg-surface-background/50 transition-colors">
                  <td className="py-2 px-3 font-semibold">{r.date}</td>
                  <td className="py-2 px-3 text-right">{r.beg.toFixed(2)}</td>
                  <td className="py-2 px-3 text-right text-green-700">{r.inFg > 0 ? `+${r.inFg.toFixed(2)}` : "-"}</td>
                  <td className="py-2 px-3 text-right text-green-700">{r.inRaw > 0 ? `+${r.inRaw.toFixed(2)}` : "-"}</td>
                  <td className="py-2 px-3 text-right text-red-700">{r.outFg > 0 ? `-${r.outFg.toFixed(2)}` : "-"}</td>
                  <td className="py-2 px-3 text-right text-red-700">{r.outRaw > 0 ? `-${r.outRaw.toFixed(2)}` : "-"}</td>
                  <td className="py-2 px-3 text-right font-bold">{r.end.toFixed(2)}</td>
                  <td className="py-2 px-3 text-right">${r.rate.toFixed(4)}</td>
                  <td className="py-2 px-3 text-right font-bold text-brand-blue">${r.amount.toFixed(2)}</td>
                </tr>
              ))}
              <tr className="bg-surface-background font-bold border-t-2 border-border-medium text-body-sm">
                <td colSpan={8} className="py-3 px-3 font-heading text-text-dark">
                  JUNE TOTAL STORAGE CHARGE (30 DAYS)
                </td>
                <td className="py-3 px-3 text-right font-mono text-brand-blue text-heading-xs">
                  $1,116.90
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 2: Delivery & Distribution Detail */}
      <div
        id="section-2"
        className={`rounded-card bg-surface-white border transition-all duration-500 shadow-card overflow-hidden ${
          highlightedSection === "section-2" ? "border-2 border-brand-blue ring-4 ring-brand-blue/20" : "border-border-light"
        }`}
      >
        <div className="border-b border-border-light bg-surface-background p-4 flex justify-between items-center">
          <div>
            <h2 className="font-heading text-heading-md font-bold text-text-dark">
              Section 2: Delivery &amp; Distribution Detail Schedule
            </h2>
            <p className="font-body text-body-xs text-text-grey mt-0.5">
              Consignee delivery runs, DR references, delivery charges, doc fees, and co-load remarks.
            </p>
          </div>
          <span className="font-mono text-mono-xs bg-brand-blue/10 text-brand-blue px-3 py-1 rounded font-bold">
            Subtotal: $1,082.71 (Delivery $662.71 + Doc $420.00)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse font-body text-body-sm">
            <thead>
              <tr className="border-b border-border-light bg-surface-background text-text-grey text-body-xs uppercase font-semibold">
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">DR Number</th>
                <th className="py-2.5 px-3">Consignee Plant / Facility</th>
                <th className="py-2.5 px-3 text-right">Delivery Charge ($)</th>
                <th className="py-2.5 px-3 text-right">Doc Fee ($)</th>
                <th className="py-2.5 px-3">Remarks / Route</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light text-text-dark font-mono text-body-xs">
              {deliveryRows.map((d, idx) => (
                <tr key={idx} className="hover:bg-surface-background/50 transition-colors">
                  <td className="py-2.5 px-3 font-semibold">{d.date}</td>
                  <td className="py-2.5 px-3 font-bold text-brand-blue">{d.dr}</td>
                  <td className="py-2.5 px-3 font-sans font-medium">{d.consignee}</td>
                  <td className="py-2.5 px-3 text-right font-bold">${d.delCharge.toFixed(2)}</td>
                  <td className="py-2.5 px-3 text-right">${d.docCharge.toFixed(2)}</td>
                  <td className="py-2.5 px-3 font-sans text-text-grey">{d.remarks}</td>
                </tr>
              ))}
              <tr className="bg-surface-background font-bold border-t-2 border-border-medium text-body-sm">
                <td colSpan={3} className="py-3 px-3 font-heading text-text-dark">
                  TOTAL DELIVERY &amp; DOCUMENTATION CHARGES
                </td>
                <td className="py-3 px-3 text-right font-mono text-brand-blue">$662.71</td>
                <td className="py-3 px-3 text-right font-mono text-brand-blue">$420.00</td>
                <td className="py-3 px-3 font-mono text-brand-blue font-bold">$1,082.71 Total</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 3 & Section 4: LOA Permits & Other Contractual Fees */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div
          id="section-3"
          className={`rounded-card bg-surface-white border transition-all duration-500 shadow-card overflow-hidden ${
            highlightedSection === "section-3" ? "border-2 border-brand-blue ring-4 ring-brand-blue/20" : "border-border-light"
          }`}
        >
          <div className="border-b border-border-light bg-surface-background p-4 flex justify-between items-center">
            <h2 className="font-heading text-heading-md font-bold text-text-dark">
              Section 3: LOA Detail Schedule
            </h2>
            <span className="font-mono text-mono-xs bg-brand-blue/10 text-brand-blue px-2 py-0.5 rounded font-bold">
              Subtotal: $36.00
            </span>
          </div>
          <div className="p-4 space-y-3">
            {loaRows.map((l, idx) => (
              <div key={idx} className="rounded-btn border border-border-light p-3 bg-surface-background/40 flex justify-between items-center">
                <div>
                  <span className="font-mono text-mono-sm font-bold text-brand-blue">{l.permit}</span>
                  <p className="font-body text-body-xs text-text-grey mt-0.5">{l.scope}</p>
                  <p className="font-mono text-mono-xs text-text-grey mt-0.5">Validity: {l.validFrom} to {l.validTo}</p>
                </div>
                <span className="font-mono text-mono-md font-bold text-text-dark">${l.rate.toFixed(2)}/mo</span>
              </div>
            ))}
          </div>
        </div>

        <div
          id="section-4"
          className={`rounded-card bg-surface-white border transition-all duration-500 shadow-card overflow-hidden ${
            highlightedSection === "section-4" ? "border-2 border-brand-blue ring-4 ring-brand-blue/20" : "border-border-light"
          }`}
        >
          <div className="border-b border-border-light bg-surface-background p-4 flex justify-between items-center">
            <h2 className="font-heading text-heading-md font-bold text-text-dark">
              Section 4: Surety Bond &amp; Other Fees
            </h2>
            <span className="font-mono text-mono-xs bg-brand-blue/10 text-brand-blue px-2 py-0.5 rounded font-bold">
              Subtotal: $200.00
            </span>
          </div>
          <div className="p-4 space-y-3">
            {otherChargesRows.map((o, idx) => (
              <div key={idx} className="rounded-btn border border-border-light p-3 bg-surface-background/40 flex justify-between items-center">
                <div>
                  <span className="font-body text-body-xs font-bold text-text-dark">{o.name}</span>
                  <p className="font-mono text-mono-xs text-text-grey mt-0.5">{o.notes}</p>
                </div>
                <span className="font-mono text-mono-md font-bold text-text-dark">${o.amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Section 5: Manpower Activity Schedule */}
      <div
        id="section-5"
        className={`rounded-card bg-surface-white border transition-all duration-500 shadow-card overflow-hidden ${
          highlightedSection === "section-5" ? "border-2 border-brand-blue ring-4 ring-brand-blue/20" : "border-border-light"
        }`}
      >
        <div className="border-b border-border-light bg-surface-background p-4 flex justify-between items-center">
          <div>
            <h2 className="font-heading text-heading-md font-bold text-text-dark">
              Section 5: Manpower Activity Schedule
            </h2>
            <p className="font-body text-body-xs text-text-grey mt-0.5">
              Handling IN &amp; Handling OUT manpower hours, hourly rates, and task logs.
            </p>
          </div>
          <span className="font-mono text-mono-xs bg-brand-blue/10 text-brand-blue px-3 py-1 rounded font-bold">
            Subtotal: $588.19 (Handling IN $220.05 + Handling OUT $368.14)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse font-body text-body-sm">
            <thead>
              <tr className="border-b border-border-light bg-surface-background text-text-grey text-body-xs uppercase font-semibold">
                <th className="py-2.5 px-3">Role / Activity</th>
                <th className="py-2.5 px-3 text-right">Hours Logged</th>
                <th className="py-2.5 px-3 text-right">Rate ($/hr)</th>
                <th className="py-2.5 px-3 text-right">Amount ($)</th>
                <th className="py-2.5 px-3">Operational Task Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light text-text-dark font-mono text-body-xs">
              {manpowerRows.map((m, idx) => (
                <tr key={idx} className="hover:bg-surface-background/50 transition-colors">
                  <td className="py-2.5 px-3 font-sans font-bold">{m.role}</td>
                  <td className="py-2.5 px-3 text-right font-bold">{m.hours.toFixed(2)} hrs</td>
                  <td className="py-2.5 px-3 text-right">${m.rate.toFixed(2)}</td>
                  <td className="py-2.5 px-3 text-right font-bold text-brand-blue">${m.amount.toFixed(2)}</td>
                  <td className="py-2.5 px-3 font-sans text-text-grey">{m.notes}</td>
                </tr>
              ))}
              <tr className="bg-surface-background font-bold border-t-2 border-border-medium text-body-sm">
                <td colSpan={3} className="py-3 px-3 font-heading text-text-dark">
                  TOTAL MANPOWER HANDLING CHARGES
                </td>
                <td className="py-3 px-3 text-right font-mono text-brand-blue">$588.19</td>
                <td className="py-3 px-3"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

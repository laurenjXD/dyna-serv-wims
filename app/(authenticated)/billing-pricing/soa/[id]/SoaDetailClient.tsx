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
    <div className="mx-auto max-w-container space-y-6 px-4 py-6 sm:px-6 lg:px-8 print:p-0 print:m-0 print:max-w-none print:space-y-0">
      {/* Global Print Styles for Executive Corporate Document PDF */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm 12mm 12mm 12mm;
          }
          html, body {
            background: #ffffff !important;
            color: #000000 !important;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
            font-size: 9.5pt !important;
            line-height: 1.35 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print {
            display: none !important;
          }
          .print-page-break {
            break-before: page !important;
            page-break-before: always !important;
          }
          .print-avoid-break {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          /* Strip all web shadows, web rounded corners, and colored card backgrounds */
          .print-card, .rounded-card, .shadow-card, .rounded, .rounded-btn, .rounded-full {
            border-radius: 0px !important;
            box-shadow: none !important;
            text-shadow: none !important;
          }
          .print-border {
            border: 1px solid #1e293b !important;
          }
          .print-header-row {
            background-color: #f1f5f9 !important;
            color: #000000 !important;
            border-bottom: 1px solid #1e293b !important;
          }
          table {
            width: 100% !important;
            border-collapse: collapse !important;
            font-size: 9pt !important;
            margin-bottom: 8px !important;
            page-break-inside: auto !important;
          }
          tr {
            page-break-inside: avoid !important;
            page-break-after: auto !important;
          }
          thead {
            display: table-header-group !important;
          }
          th {
            background-color: #f1f5f9 !important;
            color: #000000 !important;
            font-weight: 700 !important;
            text-transform: uppercase !important;
            border: 1px solid #334155 !important;
            padding: 4.5px 6px !important;
            font-size: 8.5pt !important;
          }
          td {
            padding: 4px 6px !important;
            border: 1px solid #cbd5e1 !important;
            color: #000000 !important;
          }
        }
      `}</style>

      {/* Action Header (Hidden on Print) */}
      <div className="no-print flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border-light pb-4">
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
            <Printer size={16} className="mr-2" /> Print Official SOA Package
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center rounded-btn bg-brand-blue px-4 py-2 font-body text-body-sm font-semibold text-white shadow-card hover:bg-brand-blue-dark transition-colors"
          >
            <Download size={16} className="mr-2" /> Export Corporate PDF
          </button>
        </div>
      </div>

      {/* Quick Jump Section Pills (Hidden on Print) */}
      <div className="no-print flex flex-wrap items-center gap-2 bg-surface-background p-2 rounded-btn border border-border-light">
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

      {/* ════════════════════ PAGE 1: COVER STATEMENT & SUMMARY OF CHARGES ════════════════════ */}
      <div className="print-avoid-break space-y-4 bg-surface-white p-6 print:p-0 rounded-card border border-border-light print:border-none shadow-card print:shadow-none">
        
        {/* Exact Corporate Header / Letterhead matching Real-World Template */}
        <div className="pb-2">
          <div className="flex justify-between items-start">
            <div className="flex items-start gap-3">
              {/* Dyna-Serv Globe Icon / Brand Logo */}
              <div className="no-print w-12 h-12 rounded-full border-2 border-brand-blue flex items-center justify-center text-brand-blue font-bold text-lg shrink-0">
                DS
              </div>
              <div>
                <h1 className="font-heading text-title-md font-extrabold tracking-tight text-brand-navy print:text-black">
                  DYNA-SERV GLOBAL CORPORATION
                </h1>
                <p className="font-body text-body-xs text-text-grey print:text-black">
                  Unit 7, Orient Goldcrest Building 6A,
                </p>
                <p className="font-body text-body-xs text-text-grey print:text-black">
                  149 East Main Avenue Loop, Phase 6C,
                </p>
                <p className="font-body text-body-xs text-text-grey print:text-black">
                  Laguna Technopark SEZ, Biñan City, Laguna, Philippines 4024
                </p>
                <p className="font-body text-body-xs text-brand-blue print:text-black font-semibold">
                  www.dyna-serv.com.ph
                </p>
              </div>
            </div>
          </div>

          {/* Centered Document Title */}
          <div className="text-center my-4">
            <h2 className="font-heading text-headline-xs font-extrabold text-brand-navy print:text-black uppercase tracking-wider border-b-2 border-brand-navy print:border-black inline-block pb-0.5 px-6">
              STATEMENT OF ACCOUNT
            </h2>
          </div>

          {/* Exact Real-World Metadata Grid (Left & Right Form Fields) */}
          <div className="grid grid-cols-2 gap-8 my-4 font-body text-body-xs">
            {/* Left Column: Dates & Bill To */}
            <div className="space-y-2">
              <div className="flex items-center">
                <span className="w-24 font-bold text-text-dark print:text-black">From Date</span>
                <div className="flex-1 border-b border-text-dark print:border-black px-2 py-0.5 font-mono bg-surface-background/30 print:bg-slate-100 font-medium">
                  01-May-26
                </div>
              </div>
              <div className="flex items-center">
                <span className="w-24 font-bold text-text-dark print:text-black">To Date</span>
                <div className="flex-1 border-b border-text-dark print:border-black px-2 py-0.5 font-mono bg-surface-background/30 print:bg-slate-100 font-medium">
                  26-May-26
                </div>
              </div>
              <div className="flex items-start pt-2">
                <span className="w-24 font-bold text-text-dark print:text-black pt-0.5">Bill To</span>
                <div className="flex-1 border-b border-text-dark print:border-black px-2 py-1 font-body bg-surface-background/30 print:bg-slate-100 text-text-dark print:text-black leading-snug">
                  <p className="font-bold">{soaData.customerName}</p>
                  <p>Unit 8, 35/F Cable TV Tower</p>
                  <p>9 Hoi Shing Road, Tsuen Wan NT, HK</p>
                </div>
              </div>
            </div>

            {/* Right Column: Customer, SOA No, Invoice Details */}
            <div className="space-y-2">
              <div className="flex items-center">
                <span className="w-28 font-bold text-text-dark print:text-black">Customer</span>
                <div className="flex-1 border-b border-text-dark print:border-black px-2 py-0.5 font-body font-bold text-text-dark print:text-black bg-surface-background/30 print:bg-slate-100 truncate">
                  {soaData.customerName}
                </div>
              </div>
              <div className="flex items-center">
                <span className="w-28 font-bold text-text-dark print:text-black">SOA No.</span>
                <div className="flex-1 border-b border-text-dark print:border-black px-2 py-0.5 font-mono text-text-dark print:text-black font-semibold">
                  {soaData.soaNumber}
                </div>
              </div>
              <div className="flex items-center">
                <span className="w-28 font-bold text-text-dark print:text-black">Invoice No.</span>
                <div className="flex-1 border-b border-text-dark print:border-black px-2 py-0.5 font-mono text-text-dark print:text-black text-right font-medium">
                  45
                </div>
              </div>
              <div className="flex items-center">
                <span className="w-28 font-bold text-text-dark print:text-black">Invoice Date</span>
                <div className="flex-1 border-b border-text-dark print:border-black px-2 py-0.5 font-mono text-text-dark print:text-black text-right font-medium">
                  26-May-26
                </div>
              </div>
              <div className="flex items-center">
                <span className="w-28 font-bold text-text-dark print:text-black">Terms</span>
                <div className="flex-1 border-b border-text-dark print:border-black px-2 py-0.5 font-body text-text-dark print:text-black font-medium">
                  Net 30 Days
                </div>
              </div>
              <div className="flex items-center">
                <span className="w-28 font-bold text-text-dark print:text-black">Currency</span>
                <div className="flex-1 border-b border-text-dark print:border-black px-2 py-0.5 font-mono font-bold text-text-dark print:text-black">
                  USD
                </div>
              </div>
              <div className="flex items-center">
                <span className="w-28 font-bold text-text-dark print:text-black">Reference</span>
                <div className="flex-1 border-b border-text-dark print:border-black px-2 py-0.5 font-mono text-text-dark print:text-black">
                  DSGC-VMI-2026-001
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 6: Exact Real-World Summary Table (NO, CHARGE TYPE, AMOUNT) */}
        <div
          id="section-6"
          className={`print-card rounded border border-border-light print:border-slate-800 overflow-hidden ${
            highlightedSection === "section-6" ? "border-2 border-brand-blue ring-4 ring-brand-blue/20" : ""
          }`}
        >
          <table className="w-full text-left border-collapse font-body text-body-sm">
            <thead>
              <tr className="border-t-2 border-b-2 border-brand-navy print:border-black bg-surface-background print-header-row text-brand-navy print:text-black text-body-xs uppercase font-extrabold">
                <th className="py-2 px-3 w-16 text-center">NO.</th>
                <th className="py-2 px-3">CHARGE TYPE</th>
                <th className="py-2 px-3 text-right w-48">AMOUNT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light print:divide-slate-300 text-text-dark font-body text-body-sm">
              <tr className="hover:bg-surface-background/50 transition-colors">
                <td className="py-2 px-3 text-center font-mono font-semibold">1</td>
                <td className="py-2 px-3 font-semibold">Warehousing Charge</td>
                <td className="py-2 px-3 text-right font-mono font-bold">${(1116.90).toFixed(2)}</td>
              </tr>
              <tr className="hover:bg-surface-background/50 transition-colors">
                <td className="py-2 px-3 text-center font-mono font-semibold">2</td>
                <td className="py-2 px-3 font-semibold">Documentation</td>
                <td className="py-2 px-3 text-right font-mono font-bold">${(420.00).toFixed(2)}</td>
              </tr>
              <tr className="hover:bg-surface-background/50 transition-colors">
                <td className="py-2 px-3 text-center font-mono font-semibold">3</td>
                <td className="py-2 px-3 font-semibold">Delivery Charge</td>
                <td className="py-2 px-3 text-right font-mono font-bold">${(662.71).toFixed(2)}</td>
              </tr>
              <tr className="hover:bg-surface-background/50 transition-colors">
                <td className="py-2 px-3 text-center font-mono font-semibold">4</td>
                <td className="py-2 px-3 font-semibold">Handling and Stripping</td>
                <td className="py-2 px-3 text-right font-mono font-bold">${(588.19).toFixed(2)}</td>
              </tr>
              <tr className="hover:bg-surface-background/50 transition-colors">
                <td className="py-2 px-3 text-center font-mono font-semibold">5</td>
                <td className="py-2 px-3 font-semibold">Cargo Transfer Fee</td>
                <td className="py-2 px-3 text-right font-mono text-text-grey print:text-black">0.00</td>
              </tr>
              <tr className="hover:bg-surface-background/50 transition-colors">
                <td className="py-2 px-3 text-center font-mono font-semibold">6</td>
                <td className="py-2 px-3 font-semibold">RTV</td>
                <td className="py-2 px-3 text-right font-mono text-text-grey print:text-black">0.00</td>
              </tr>
              <tr className="hover:bg-surface-background/50 transition-colors">
                <td className="py-2 px-3 text-center font-mono font-semibold">7</td>
                <td className="py-2 px-3 font-semibold">Admin Fee</td>
                <td className="py-2 px-3 text-right font-mono font-bold">${(200.00).toFixed(2)}</td>
              </tr>
              <tr className="hover:bg-surface-background/50 transition-colors">
                <td className="py-2 px-3 text-center font-mono font-semibold">8</td>
                <td className="py-2 px-3 font-semibold">Insurance</td>
                <td className="py-2 px-3 text-right font-mono text-text-grey print:text-black">0.00</td>
              </tr>
              <tr className="hover:bg-surface-background/50 transition-colors">
                <td className="py-2 px-3 text-center font-mono font-semibold">9</td>
                <td className="py-2 px-3 font-semibold">Man Power (Permits &amp; Special Handling)</td>
                <td className="py-2 px-3 text-right font-mono font-bold">${(36.00).toFixed(2)}</td>
              </tr>
              {/* Grand Total Bar matching gray shading in real-world document */}
              <tr className="border-t-2 border-b-2 border-brand-navy print:border-black bg-surface-background print-header-row font-bold text-body-md">
                <td colSpan={2} className="py-3 px-4 text-right font-heading font-extrabold text-brand-navy print:text-black uppercase tracking-wider">
                  GRAND TOTAL
                </td>
                <td className="py-3 px-3 text-right font-mono text-brand-blue print:text-black font-extrabold text-body-md bg-surface-background/80 print:bg-slate-200">
                  ${soaData.currentChargesUsd.toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Remittance & Formal Approval Signatures Block */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 font-body text-body-xs print-avoid-break">
          {/* Payment Remittance Instructions */}
          <div className="border border-border-light print:border-slate-800 p-3 bg-surface-white print:bg-white rounded">
            <span className="font-bold uppercase tracking-wider text-text-dark print:text-black block mb-1">
              Payment Remittance Instructions:
            </span>
            <p className="text-text-grey print:text-black">Please make check/wire transfers payable to:</p>
            <p className="font-bold text-text-dark print:text-black">DYNA-SERV GLOBAL CORPORATION</p>
            <p className="text-text-grey print:text-black">Bank: <strong>Bank of the Philippine Islands (BPI)</strong></p>
            <p className="text-text-grey print:text-black font-mono">Account No (USD): <strong>9812-4091-22</strong> &bull; SWIFT: <strong>BOPIPHMM</strong></p>
          </div>

          {/* Page 1 Signatures */}
          <div className="border border-border-light print:border-slate-800 p-3 bg-surface-white print:bg-white rounded flex flex-col justify-between">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-text-grey print:text-black block mb-4">Prepared By:</span>
                <div className="border-b border-text-dark print:border-black font-bold pb-0.5">MARIA LOURDES REYES</div>
                <span className="text-text-grey print:text-black text-[9px] block">Billing &amp; Finance Specialist</span>
              </div>
              <div>
                <span className="text-text-grey print:text-black block mb-4">Approved By:</span>
                <div className="border-b border-text-dark print:border-black font-bold pb-0.5">JOSEPHINE TAN</div>
                <span className="text-text-grey print:text-black text-[9px] block">Warehouse Operations Manager</span>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* ════════════════════ PAGE 2: DELIVERY & OTHER CHARGES SCHEDULE ════════════════════ */}
      <div className="print-page-break print-avoid-break space-y-6">
        <div
          id="section-2"
          className={`print-card rounded border border-border-light print:border-slate-800 overflow-hidden ${
            highlightedSection === "section-2" ? "border-2 border-brand-blue ring-4 ring-brand-blue/20" : ""
          }`}
        >
          <div className="border-b border-border-light print-header-row p-3 flex justify-between items-center">
            <div>
              <h2 className="font-heading text-body-md font-bold text-text-dark print:text-black uppercase">
                Section 2: Delivery &amp; Distribution Detail Schedule
              </h2>
              <p className="font-body text-body-xs text-text-grey print:text-black">
                Consignee delivery runs, DR references, delivery charges, documentation fees, and co-load notes.
              </p>
            </div>
            <span className="font-mono text-mono-xs bg-surface-white border border-border-medium print:border-black px-2 py-0.5 rounded text-text-dark print:text-black font-bold">
              Subtotal: $1,082.71
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse font-body text-body-sm">
              <thead>
                <tr className="border-b border-border-light print-header-row text-text-grey print:text-black text-body-xs uppercase font-bold">
                  <th className="py-2 px-3">Date</th>
                  <th className="py-2 px-3">DR Number</th>
                  <th className="py-2 px-3">Consignee Facility / Destination</th>
                  <th className="py-2 px-3 text-right">Delivery Charge ($)</th>
                  <th className="py-2 px-3 text-right">Doc Fee ($)</th>
                  <th className="py-2 px-3">Route / Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light print:divide-slate-400 text-text-dark font-mono text-body-xs">
                {deliveryRows.map((d, idx) => (
                  <tr key={idx} className="hover:bg-surface-background/50 transition-colors">
                    <td className="py-2 px-3 font-semibold">{d.date}</td>
                    <td className="py-2 px-3 font-bold text-brand-blue print:text-black">{d.dr}</td>
                    <td className="py-2 px-3 font-sans font-medium">{d.consignee}</td>
                    <td className="py-2 px-3 text-right font-bold">${d.delCharge.toFixed(2)}</td>
                    <td className="py-2 px-3 text-right">${d.docCharge.toFixed(2)}</td>
                    <td className="py-2 px-3 font-sans text-text-grey print:text-black">{d.remarks}</td>
                  </tr>
                ))}
                <tr className="bg-surface-background print-header-row font-bold border-t-2 border-border-medium print:border-black text-body-sm">
                  <td colSpan={3} className="py-2.5 px-3 font-heading text-text-dark print:text-black">
                    TOTAL DELIVERY &amp; DOCUMENTATION CHARGES
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-brand-blue print:text-black">$662.71</td>
                  <td className="py-2.5 px-3 text-right font-mono text-brand-blue print:text-black">$420.00</td>
                  <td className="py-2.5 px-3 font-mono text-brand-blue print:text-black font-extrabold">$1,082.71 Total</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 3 & Section 4: LOA Permits & Other Contractual Fees */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print-avoid-break">
          <div
            id="section-3"
            className={`print-card rounded border border-border-light print:border-slate-800 overflow-hidden ${
              highlightedSection === "section-3" ? "border-2 border-brand-blue ring-4 ring-brand-blue/20" : ""
            }`}
          >
            <div className="border-b border-border-light print-header-row p-3 flex justify-between items-center">
              <h2 className="font-heading text-body-md font-bold text-text-dark print:text-black uppercase">
                Section 3: LOA Detail Schedule
              </h2>
              <span className="font-mono text-mono-xs bg-surface-white border border-border-medium print:border-black px-2 py-0.5 rounded font-bold">
                Subtotal: $36.00
              </span>
            </div>
            <div className="p-3 space-y-2">
              {loaRows.map((l, idx) => (
                <div key={idx} className="border border-border-light print:border-slate-400 p-2.5 bg-surface-background/40 print:bg-white flex justify-between items-center rounded">
                  <div>
                    <span className="font-mono text-mono-sm font-bold text-brand-blue print:text-black">{l.permit}</span>
                    <p className="font-body text-body-xs text-text-grey print:text-black mt-0.5">{l.scope}</p>
                    <p className="font-mono text-mono-xs text-text-grey print:text-black mt-0.5">Validity: {l.validFrom} to {l.validTo}</p>
                  </div>
                  <span className="font-mono text-mono-md font-bold text-text-dark print:text-black">${l.rate.toFixed(2)}/mo</span>
                </div>
              ))}
            </div>
          </div>

          <div
            id="section-4"
            className={`print-card rounded border border-border-light print:border-slate-800 overflow-hidden ${
              highlightedSection === "section-4" ? "border-2 border-brand-blue ring-4 ring-brand-blue/20" : ""
            }`}
          >
            <div className="border-b border-border-light print-header-row p-3 flex justify-between items-center">
              <h2 className="font-heading text-body-md font-bold text-text-dark print:text-black uppercase">
                Section 4: Surety Bond &amp; Other Fees
              </h2>
              <span className="font-mono text-mono-xs bg-surface-white border border-border-medium print:border-black px-2 py-0.5 rounded font-bold">
                Subtotal: $200.00
              </span>
            </div>
            <div className="p-3 space-y-2">
              {otherChargesRows.map((o, idx) => (
                <div key={idx} className="border border-border-light print:border-slate-400 p-2.5 bg-surface-background/40 print:bg-white flex justify-between items-center rounded">
                  <div>
                    <span className="font-body text-body-xs font-bold text-text-dark print:text-black">{o.name}</span>
                    <p className="font-mono text-mono-xs text-text-grey print:text-black mt-0.5">{o.notes}</p>
                  </div>
                  <span className="font-mono text-mono-md font-bold text-text-dark print:text-black">${o.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ════════════════════ PAGE 3: MANPOWER ACTIVITY SCHEDULE ════════════════════ */}
      <div className="print-page-break print-avoid-break space-y-6">
        <div
          id="section-5"
          className={`print-card rounded border border-border-light print:border-slate-800 overflow-hidden ${
            highlightedSection === "section-5" ? "border-2 border-brand-blue ring-4 ring-brand-blue/20" : ""
          }`}
        >
          <div className="border-b border-border-light print-header-row p-3 flex justify-between items-center">
            <div>
              <h2 className="font-heading text-body-md font-bold text-text-dark print:text-black uppercase">
                Section 5: Manpower Activity Schedule
              </h2>
              <p className="font-body text-body-xs text-text-grey print:text-black">
                Handling IN &amp; Handling OUT labor hours, hourly billing rates, and operations task logs.
              </p>
            </div>
            <span className="font-mono text-mono-xs bg-surface-white border border-border-medium print:border-black px-2 py-0.5 rounded font-bold">
              Subtotal: $588.19
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse font-body text-body-sm">
              <thead>
                <tr className="border-b border-border-light print-header-row text-text-grey print:text-black text-body-xs uppercase font-bold">
                  <th className="py-2 px-3">Role / Operational Activity</th>
                  <th className="py-2 px-3 text-right">Hours Logged</th>
                  <th className="py-2 px-3 text-right">Rate ($/hr)</th>
                  <th className="py-2 px-3 text-right">Amount ($)</th>
                  <th className="py-2 px-3">Task Log Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light print:divide-slate-400 text-text-dark font-mono text-body-xs">
                {manpowerRows.map((m, idx) => (
                  <tr key={idx} className="hover:bg-surface-background/50 transition-colors">
                    <td className="py-2 px-3 font-sans font-bold">{m.role}</td>
                    <td className="py-2 px-3 text-right font-bold">{m.hours.toFixed(2)} hrs</td>
                    <td className="py-2 px-3 text-right">${m.rate.toFixed(2)}</td>
                    <td className="py-2 px-3 text-right font-bold text-brand-blue print:text-black">${m.amount.toFixed(2)}</td>
                    <td className="py-2 px-3 font-sans text-text-grey print:text-black">{m.notes}</td>
                  </tr>
                ))}
                <tr className="bg-surface-background print-header-row font-bold border-t-2 border-border-medium print:border-black text-body-sm">
                  <td colSpan={3} className="py-2.5 px-3 font-heading text-text-dark print:text-black">
                    TOTAL MANPOWER HANDLING CHARGES
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-brand-blue print:text-black font-extrabold">$588.19</td>
                  <td className="py-2.5 px-3"></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ════════════════════ PAGE 4: WAREHOUSING DAILY CBM REPLAY SCHEDULE ════════════════════ */}
      <div className="print-page-break print-avoid-break space-y-4">
        <div
          id="section-7"
          className={`print-card rounded border border-border-light print:border-slate-800 overflow-hidden ${
            highlightedSection === "section-7" ? "border-2 border-brand-blue ring-4 ring-brand-blue/20" : ""
          }`}
        >
          <div className="border-b border-border-light print-header-row p-3 flex justify-between items-center">
            <div>
              <h2 className="font-heading text-body-md font-bold text-text-dark print:text-black flex items-center uppercase">
                <FileSpreadsheet size={18} className="mr-2 text-brand-blue print:text-black no-print" />
                Section 7: Detailed Warehousing Daily CBM Calculation Schedule
              </h2>
              <p className="font-body text-body-xs text-text-grey print:text-black">
                30-Day Unrolled Inventory Replay (Beg CBM, Inbound FG/Raw, Outbound FG/Raw, Ending CBM, Storage Rate).
              </p>
            </div>
            <span className="font-mono text-mono-xs bg-surface-white border border-border-medium print:border-black px-2 py-0.5 rounded font-bold">
              Subtotal: $1,116.90
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse font-body text-body-xs">
              <thead>
                <tr className="border-b border-border-light print-header-row text-text-grey print:text-black uppercase font-bold">
                  <th className="py-1.5 px-2">Date</th>
                  <th className="py-1.5 px-2 text-right">Beg CBM</th>
                  <th className="py-1.5 px-2 text-right text-green-700 print:text-black">IN FG</th>
                  <th className="py-1.5 px-2 text-right text-green-700 print:text-black">IN Raw</th>
                  <th className="py-1.5 px-2 text-right text-red-700 print:text-black">OUT FG</th>
                  <th className="py-1.5 px-2 text-right text-red-700 print:text-black">OUT Raw</th>
                  <th className="py-1.5 px-2 text-right font-bold">End CBM</th>
                  <th className="py-1.5 px-2 text-right">Rate ($/CBM/day)</th>
                  <th className="py-1.5 px-2 text-right font-bold text-brand-blue print:text-black">Amount ($)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light print:divide-slate-400 font-mono text-text-dark">
                {juneDailyCbmRows.map((r, idx) => (
                  <tr key={idx} className="hover:bg-surface-background/50 transition-colors">
                    <td className="py-1 px-2 font-semibold">{r.date}</td>
                    <td className="py-1 px-2 text-right">{r.beg.toFixed(2)}</td>
                    <td className="py-1 px-2 text-right text-green-700 print:text-black">{r.inFg > 0 ? `+${r.inFg.toFixed(2)}` : "-"}</td>
                    <td className="py-1 px-2 text-right text-green-700 print:text-black">{r.inRaw > 0 ? `+${r.inRaw.toFixed(2)}` : "-"}</td>
                    <td className="py-1 px-2 text-right text-red-700 print:text-black">{r.outFg > 0 ? `-${r.outFg.toFixed(2)}` : "-"}</td>
                    <td className="py-1 px-2 text-right text-red-700 print:text-black">{r.outRaw > 0 ? `-${r.outRaw.toFixed(2)}` : "-"}</td>
                    <td className="py-1 px-2 text-right font-bold">{r.end.toFixed(2)}</td>
                    <td className="py-1 px-2 text-right">${r.rate.toFixed(4)}</td>
                    <td className="py-1 px-2 text-right font-bold text-brand-blue print:text-black">${r.amount.toFixed(2)}</td>
                  </tr>
                ))}
                <tr className="bg-surface-background print-header-row font-bold border-t-2 border-border-medium print:border-black text-body-sm">
                  <td colSpan={8} className="py-2 px-2 font-heading text-text-dark print:text-black">
                    TOTAL WAREHOUSING STORAGE CHARGE (30 DAYS)
                  </td>
                  <td className="py-2 px-2 text-right font-mono text-brand-blue print:text-black text-body-md font-extrabold">
                    $1,116.90
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Final Document Formal Signatures & Conforme Block */}
        <div className="border border-border-light print:border-slate-800 p-4 bg-surface-white print:bg-white font-body text-body-xs print-avoid-break">
          <span className="font-bold uppercase tracking-wider text-text-dark print:text-black block mb-4">
            FINAL DOCUMENT APPROVAL &amp; CUSTOMER CONFORME:
          </span>
          <div className="grid grid-cols-3 gap-6 text-center">
            <div>
              <span className="text-text-grey print:text-black block mb-6">Certified Correct By:</span>
              <div className="border-b border-text-dark print:border-black font-bold pb-1">MARIA LOURDES REYES</div>
              <span className="text-text-grey print:text-black text-[9px] block mt-1">Billing &amp; Finance Specialist</span>
            </div>
            <div>
              <span className="text-text-grey print:text-black block mb-6">Approved By:</span>
              <div className="border-b border-text-dark print:border-black font-bold pb-1">JOSEPHINE TAN</div>
              <span className="text-text-grey print:text-black text-[9px] block mt-1">Warehouse Operations Manager</span>
            </div>
            <div>
              <span className="text-text-grey print:text-black block mb-6">Received &amp; Accepted By (Conforme):</span>
              <div className="border-b border-text-dark print:border-black font-bold pb-1">___________________________</div>
              <span className="text-text-grey print:text-black text-[9px] block mt-1">Authorized Customer Signature &amp; Date</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

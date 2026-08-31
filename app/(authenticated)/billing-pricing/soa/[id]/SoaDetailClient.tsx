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
      {/* Global Print Styles for Executive Corporate Document PDF */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm 10mm 10mm 10mm;
          }
          body {
            background: white !important;
            color: #0f172a !important;
            font-family: system-ui, -apple-system, sans-serif !important;
            font-size: 10px !important;
            line-height: 1.3 !important;
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
          .print-card {
            border: 1px solid #64748b !important;
            box-shadow: none !important;
            border-radius: 0px !important;
            margin-bottom: 10px !important;
            background: white !important;
          }
          .print-header-bg {
            background-color: #f1f5f9 !important;
            color: #0f172a !important;
            border-bottom: 1px solid #64748b !important;
          }
          table {
            width: 100% !important;
            border-collapse: collapse !important;
            font-size: 9.5px !important;
          }
          th {
            background-color: #f1f5f9 !important;
            color: #0f172a !important;
            font-weight: bold !important;
            text-transform: uppercase !important;
            border: 1px solid #94a3b8 !important;
            padding: 4px 6px !important;
          }
          td {
            padding: 3.5px 6px !important;
            border: 1px solid #cbd5e1 !important;
          }
          .print-badge {
            background: none !important;
            border: 1px solid #64748b !important;
            color: #0f172a !important;
            padding: 1px 4px !important;
            font-weight: bold !important;
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
      <div className="print-avoid-break space-y-4 bg-surface-white p-4 print:p-0 rounded-card border border-border-light print:border-none shadow-card print:shadow-none">
        
        {/* Official Corporate Document Header / Letterhead */}
        <div className="border-b-2 border-brand-navy pb-3">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="font-heading text-headline-sm font-extrabold tracking-tight text-brand-navy print:text-black">
                DYNA-SERV GLOBAL CORP.
              </h1>
              <p className="font-body text-body-xs text-text-grey print:text-slate-700">
                Warehouse Logistics Management &amp; VMI Distribution Facility
              </p>
              <p className="font-body text-body-xs text-text-grey print:text-slate-700">
                PEZA Special Economic Zone, Gateway Business Park, Cavite / Laguna, Philippines
              </p>
              <p className="font-body text-body-xs text-text-grey print:text-slate-700 font-mono">
                PEZA Reg No: 02-VMI-2024 &bull; Tax Identification No: 004-982-110-000
              </p>
            </div>
            <div className="text-right">
              <h2 className="font-heading text-title-md font-extrabold text-brand-navy print:text-black uppercase tracking-wide">
                STATEMENT OF ACCOUNT
              </h2>
              <p className="font-mono text-mono-md font-bold text-brand-navy print:text-black mt-1">
                Ref No: {soaData.soaNumber}
              </p>
              <p className="font-mono text-mono-xs text-text-grey print:text-slate-700">Billing Date: <strong>{soaData.issueDate}</strong></p>
              <p className="font-mono text-mono-xs text-text-grey print:text-slate-700">Payment Due: <strong>{soaData.dueDate}</strong></p>
            </div>
          </div>

          {/* Customer Bill-To & Document Context Grid */}
          <div className="grid grid-cols-2 gap-4 mt-4 pt-3 border-t border-border-light print:border-slate-400 font-body text-body-xs">
            <div className="border border-border-light print:border-slate-400 p-3 bg-surface-background/40 print:bg-white rounded">
              <span className="font-bold uppercase tracking-wider text-text-grey print:text-slate-800 text-body-xs block mb-1">
                Bill To / Customer Information:
              </span>
              <p className="font-bold text-text-dark print:text-black text-body-sm">{soaData.customerName}</p>
              <p className="text-text-grey print:text-slate-700 font-mono">Account Code: {soaData.customerCode}</p>
              <p className="text-text-grey print:text-slate-700">Gateway Business Park, General Trias, Cavite</p>
              <p className="text-text-grey print:text-slate-700">Attn: Accounts Payable / Supply Chain Dept.</p>
            </div>

            <div className="border border-border-light print:border-slate-400 p-3 bg-surface-background/40 print:bg-white rounded font-mono">
              <div className="flex justify-between py-0.5">
                <span className="text-text-grey print:text-slate-700 font-sans">Billing Period:</span>
                <span className="font-bold text-text-dark print:text-black">{soaData.billingPeriod}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="text-text-grey print:text-slate-700 font-sans">Contract Reference:</span>
                <span className="font-bold text-text-dark print:text-black">{soaData.contractNumber}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="text-text-grey print:text-slate-700 font-sans">Daily Forex Exchange Rate:</span>
                <span className="font-bold text-text-dark print:text-black">1 USD = ₱{soaData.exchangeRate} PHP</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="text-text-grey print:text-slate-700 font-sans">Billing Currency:</span>
                <span className="font-bold text-text-dark print:text-black">US Dollar ($ USD)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Account Running Balance Card Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 print:gap-2">
          <div className="rounded border border-border-light print:border-slate-400 bg-surface-white p-3 print:p-2 text-center">
            <span className="font-body text-body-xs text-text-grey print:text-slate-700 uppercase font-semibold block">Opening Balance</span>
            <p className="font-mono text-mono-lg font-bold text-text-dark print:text-black mt-0.5">
              ${soaData.openingBalanceUsd.toFixed(2)}
            </p>
          </div>
          <div className="rounded border border-border-light print:border-slate-400 bg-surface-white p-3 print:p-2 text-center">
            <span className="font-body text-body-xs text-text-grey print:text-slate-700 uppercase font-semibold block">Current Period Charges</span>
            <p className="font-mono text-mono-lg font-bold text-brand-blue print:text-black mt-0.5">
              ${soaData.currentChargesUsd.toFixed(2)}
            </p>
          </div>
          <div className="rounded border border-border-light print:border-slate-400 bg-surface-white p-3 print:p-2 text-center">
            <span className="font-body text-body-xs text-text-grey print:text-slate-700 uppercase font-semibold block">Payments / Credits</span>
            <p className="font-mono text-mono-lg font-bold text-green-700 print:text-black mt-0.5">
              ${soaData.paymentsAppliedUsd.toFixed(2)}
            </p>
          </div>
          <div className="rounded border-2 border-brand-blue/40 print:border-slate-800 bg-brand-blue/5 print:bg-slate-100 p-3 print:p-2 text-center">
            <span className="font-body text-body-xs text-brand-blue print:text-black font-bold uppercase block">Total Amount Due</span>
            <p className="font-mono text-mono-xl font-extrabold text-brand-blue print:text-black mt-0.5">
              ${soaData.outstandingBalanceUsd.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Section 6: Formal Summary of Charges Table */}
        <div
          id="section-6"
          className={`print-card rounded border border-border-light print:border-slate-500 overflow-hidden ${
            highlightedSection === "section-6" ? "border-2 border-brand-blue ring-4 ring-brand-blue/20" : ""
          }`}
        >
          <div className="border-b border-border-light print-header-bg p-3 flex justify-between items-center">
            <h2 className="font-heading text-body-md font-bold text-text-dark print:text-black uppercase tracking-wide">
              SUMMARY OF BILLING CHARGES
            </h2>
            <span className="font-mono text-mono-xs bg-surface-white print-badge border border-border-medium px-2 py-0.5 rounded text-text-dark font-semibold">
              Monthly Period: {soaData.billingPeriod}
            </span>
          </div>

          <table className="w-full text-left border-collapse font-body text-body-sm">
            <thead>
              <tr className="border-b border-border-light print-header-bg text-text-grey text-body-xs uppercase font-bold">
                <th className="py-2 px-3">Itemized Charge Description</th>
                <th className="py-2 px-3">Charge Code</th>
                <th className="py-2 px-3 text-right">Amount (USD)</th>
                <th className="py-2 px-3 text-right">Amount (PHP Equivalent)</th>
                <th className="py-2 px-3 text-right no-print">Traceability</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light print:divide-slate-300 text-text-dark">
              {soaData.categories.map((cat, idx) => (
                <tr key={idx} className="hover:bg-surface-background/50 transition-colors">
                  <td className="py-2.5 px-3 font-semibold">{cat.name}</td>
                  <td className="py-2.5 px-3 font-mono text-body-xs text-text-grey print:text-slate-700">{cat.code}</td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold">
                    ${cat.amount.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-text-grey print:text-slate-700">
                    ₱{(cat.amount * soaData.exchangeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="py-2.5 px-3 text-right no-print">
                    <button
                      onClick={() => handleTraceClick(cat.sectionId)}
                      className="inline-flex items-center text-body-xs font-bold text-brand-blue hover:text-brand-blue-dark hover:underline"
                    >
                      View Schedule <ChevronRight size={14} className="ml-1" />
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="bg-surface-background print-header-bg font-bold text-body-md border-t-2 border-border-medium print:border-slate-800">
                <td colSpan={2} className="py-3 px-3 font-heading text-text-dark print:text-black">
                  TOTAL AMOUNT PAYABLE ({soaData.billingPeriod.toUpperCase()})
                </td>
                <td className="py-3 px-3 text-right font-mono text-brand-blue print:text-black font-extrabold text-body-md">
                  ${soaData.currentChargesUsd.toFixed(2)}
                </td>
                <td className="py-3 px-3 text-right font-mono text-brand-blue print:text-black font-extrabold text-body-md">
                  ₱{(soaData.currentChargesUsd * soaData.exchangeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="py-3 px-3 no-print"></td>
              </tr>
            </tbody>
          </table>

          <div className="border-t border-border-light print:border-slate-400 bg-surface-background/60 print:bg-slate-50 p-2.5 text-center">
            <p className="font-mono text-mono-sm font-bold text-brand-navy print:text-black">
              *** THREE THOUSAND TWENTY THREE DOLLARS &amp; 80/100 ONLY ($3,023.80) ***
            </p>
          </div>
        </div>

        {/* Remittance & Formal Approval Signatures Block */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 font-body text-body-xs">
          {/* Payment Remittance Instructions */}
          <div className="border border-border-light print:border-slate-400 p-3 bg-surface-white rounded">
            <span className="font-bold uppercase tracking-wider text-text-dark print:text-black block mb-1">
              Payment Remittance Instructions:
            </span>
            <p className="text-text-grey print:text-slate-800">Please make check/wire transfers payable to:</p>
            <p className="font-bold text-text-dark print:text-black">DYNA-SERV GLOBAL CORPORATION</p>
            <p className="text-text-grey print:text-slate-800">Bank: <strong>Bank of the Philippine Islands (BPI)</strong></p>
            <p className="text-text-grey print:text-slate-800 font-mono">Account No (USD): <strong>9812-4091-22</strong> &bull; SWIFT: <strong>BOPIPHMM</strong></p>
          </div>

          {/* Page 1 Signatures */}
          <div className="border border-border-light print:border-slate-400 p-3 bg-surface-white rounded flex flex-col justify-between">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-text-grey print:text-slate-700 block mb-4">Prepared By:</span>
                <div className="border-b border-text-dark print:border-black font-bold pb-0.5">MARIA LOURDES REYES</div>
                <span className="text-text-grey print:text-slate-700 text-[9px] block">Billing &amp; Finance Specialist</span>
              </div>
              <div>
                <span className="text-text-grey print:text-slate-700 block mb-4">Approved By:</span>
                <div className="border-b border-text-dark print:border-black font-bold pb-0.5">JOSEPHINE TAN</div>
                <span className="text-text-grey print:text-slate-700 text-[9px] block">Warehouse Operations Manager</span>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* ════════════════════ PAGE 2: DELIVERY & OTHER CHARGES SCHEDULE ════════════════════ */}
      <div className="print-page-break print-avoid-break space-y-6">
        <div
          id="section-2"
          className={`print-card rounded border border-border-light print:border-slate-500 overflow-hidden ${
            highlightedSection === "section-2" ? "border-2 border-brand-blue ring-4 ring-brand-blue/20" : ""
          }`}
        >
          <div className="border-b border-border-light print-header-bg p-3 flex justify-between items-center">
            <div>
              <h2 className="font-heading text-body-md font-bold text-text-dark print:text-black uppercase">
                Section 2: Delivery &amp; Distribution Detail Schedule
              </h2>
              <p className="font-body text-body-xs text-text-grey print:text-slate-700">
                Consignee delivery runs, DR references, delivery charges, documentation fees, and co-load notes.
              </p>
            </div>
            <span className="font-mono text-mono-xs bg-surface-white print-badge border border-border-medium px-2 py-0.5 rounded text-text-dark font-bold">
              Subtotal: $1,082.71
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse font-body text-body-sm">
              <thead>
                <tr className="border-b border-border-light print-header-bg text-text-grey text-body-xs uppercase font-bold">
                  <th className="py-2 px-3">Date</th>
                  <th className="py-2 px-3">DR Number</th>
                  <th className="py-2 px-3">Consignee Facility / Destination</th>
                  <th className="py-2 px-3 text-right">Delivery Charge ($)</th>
                  <th className="py-2 px-3 text-right">Doc Fee ($)</th>
                  <th className="py-2 px-3">Route / Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light print:divide-slate-300 text-text-dark font-mono text-body-xs">
                {deliveryRows.map((d, idx) => (
                  <tr key={idx} className="hover:bg-surface-background/50 transition-colors">
                    <td className="py-2 px-3 font-semibold">{d.date}</td>
                    <td className="py-2 px-3 font-bold text-brand-blue print:text-black">{d.dr}</td>
                    <td className="py-2 px-3 font-sans font-medium">{d.consignee}</td>
                    <td className="py-2 px-3 text-right font-bold">${d.delCharge.toFixed(2)}</td>
                    <td className="py-2 px-3 text-right">${d.docCharge.toFixed(2)}</td>
                    <td className="py-2 px-3 font-sans text-text-grey print:text-slate-700">{d.remarks}</td>
                  </tr>
                ))}
                <tr className="bg-surface-background print-header-bg font-bold border-t-2 border-border-medium print:border-slate-800 text-body-sm">
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
            className={`print-card rounded border border-border-light print:border-slate-500 overflow-hidden ${
              highlightedSection === "section-3" ? "border-2 border-brand-blue ring-4 ring-brand-blue/20" : ""
            }`}
          >
            <div className="border-b border-border-light print-header-bg p-3 flex justify-between items-center">
              <h2 className="font-heading text-body-md font-bold text-text-dark print:text-black uppercase">
                Section 3: LOA Detail Schedule
              </h2>
              <span className="font-mono text-mono-xs bg-surface-white print-badge border border-border-medium px-2 py-0.5 rounded font-bold">
                Subtotal: $36.00
              </span>
            </div>
            <div className="p-3 space-y-2">
              {loaRows.map((l, idx) => (
                <div key={idx} className="border border-border-light print:border-slate-300 p-2.5 bg-surface-background/40 print:bg-white flex justify-between items-center rounded">
                  <div>
                    <span className="font-mono text-mono-sm font-bold text-brand-blue print:text-black">{l.permit}</span>
                    <p className="font-body text-body-xs text-text-grey print:text-slate-700 mt-0.5">{l.scope}</p>
                    <p className="font-mono text-mono-xs text-text-grey print:text-slate-700 mt-0.5">Validity: {l.validFrom} to {l.validTo}</p>
                  </div>
                  <span className="font-mono text-mono-md font-bold text-text-dark print:text-black">${l.rate.toFixed(2)}/mo</span>
                </div>
              ))}
            </div>
          </div>

          <div
            id="section-4"
            className={`print-card rounded border border-border-light print:border-slate-500 overflow-hidden ${
              highlightedSection === "section-4" ? "border-2 border-brand-blue ring-4 ring-brand-blue/20" : ""
            }`}
          >
            <div className="border-b border-border-light print-header-bg p-3 flex justify-between items-center">
              <h2 className="font-heading text-body-md font-bold text-text-dark print:text-black uppercase">
                Section 4: Surety Bond &amp; Other Fees
              </h2>
              <span className="font-mono text-mono-xs bg-surface-white print-badge border border-border-medium px-2 py-0.5 rounded font-bold">
                Subtotal: $200.00
              </span>
            </div>
            <div className="p-3 space-y-2">
              {otherChargesRows.map((o, idx) => (
                <div key={idx} className="border border-border-light print:border-slate-300 p-2.5 bg-surface-background/40 print:bg-white flex justify-between items-center rounded">
                  <div>
                    <span className="font-body text-body-xs font-bold text-text-dark print:text-black">{o.name}</span>
                    <p className="font-mono text-mono-xs text-text-grey print:text-slate-700 mt-0.5">{o.notes}</p>
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
          className={`print-card rounded border border-border-light print:border-slate-500 overflow-hidden ${
            highlightedSection === "section-5" ? "border-2 border-brand-blue ring-4 ring-brand-blue/20" : ""
          }`}
        >
          <div className="border-b border-border-light print-header-bg p-3 flex justify-between items-center">
            <div>
              <h2 className="font-heading text-body-md font-bold text-text-dark print:text-black uppercase">
                Section 5: Manpower Activity Schedule
              </h2>
              <p className="font-body text-body-xs text-text-grey print:text-slate-700">
                Handling IN &amp; Handling OUT labor hours, hourly billing rates, and operations task logs.
              </p>
            </div>
            <span className="font-mono text-mono-xs bg-surface-white print-badge border border-border-medium px-2 py-0.5 rounded font-bold">
              Subtotal: $588.19
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse font-body text-body-sm">
              <thead>
                <tr className="border-b border-border-light print-header-bg text-text-grey text-body-xs uppercase font-bold">
                  <th className="py-2 px-3">Role / Operational Activity</th>
                  <th className="py-2 px-3 text-right">Hours Logged</th>
                  <th className="py-2 px-3 text-right">Rate ($/hr)</th>
                  <th className="py-2 px-3 text-right">Amount ($)</th>
                  <th className="py-2 px-3">Task Log Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light print:divide-slate-300 text-text-dark font-mono text-body-xs">
                {manpowerRows.map((m, idx) => (
                  <tr key={idx} className="hover:bg-surface-background/50 transition-colors">
                    <td className="py-2 px-3 font-sans font-bold">{m.role}</td>
                    <td className="py-2 px-3 text-right font-bold">{m.hours.toFixed(2)} hrs</td>
                    <td className="py-2 px-3 text-right">${m.rate.toFixed(2)}</td>
                    <td className="py-2 px-3 text-right font-bold text-brand-blue print:text-black">${m.amount.toFixed(2)}</td>
                    <td className="py-2 px-3 font-sans text-text-grey print:text-slate-700">{m.notes}</td>
                  </tr>
                ))}
                <tr className="bg-surface-background print-header-bg font-bold border-t-2 border-border-medium print:border-slate-800 text-body-sm">
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
          className={`print-card rounded border border-border-light print:border-slate-500 overflow-hidden ${
            highlightedSection === "section-7" ? "border-2 border-brand-blue ring-4 ring-brand-blue/20" : ""
          }`}
        >
          <div className="border-b border-border-light print-header-bg p-3 flex justify-between items-center">
            <div>
              <h2 className="font-heading text-body-md font-bold text-text-dark print:text-black flex items-center uppercase">
                <FileSpreadsheet size={18} className="mr-2 text-brand-blue print:text-black no-print" />
                Section 7: Detailed Warehousing Daily CBM Calculation Schedule
              </h2>
              <p className="font-body text-body-xs text-text-grey print:text-slate-700">
                30-Day Unrolled Inventory Replay (Beg CBM, Inbound FG/Raw, Outbound FG/Raw, Ending CBM, Storage Rate).
              </p>
            </div>
            <span className="font-mono text-mono-xs bg-surface-white print-badge border border-border-medium px-2 py-0.5 rounded font-bold">
              Subtotal: $1,116.90
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse font-body text-body-xs">
              <thead>
                <tr className="border-b border-border-light print-header-bg text-text-grey uppercase font-bold">
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
              <tbody className="divide-y divide-border-light print:divide-slate-300 font-mono text-text-dark">
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
                <tr className="bg-surface-background print-header-bg font-bold border-t-2 border-border-medium print:border-slate-800 text-body-sm">
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
        <div className="border border-border-light print:border-slate-500 p-4 bg-surface-white font-body text-body-xs print-avoid-break">
          <span className="font-bold uppercase tracking-wider text-text-dark print:text-black block mb-4">
            FINAL DOCUMENT APPROVAL &amp; CUSTOMER CONFORME:
          </span>
          <div className="grid grid-cols-3 gap-6 text-center">
            <div>
              <span className="text-text-grey print:text-slate-700 block mb-6">Certified Correct By:</span>
              <div className="border-b border-text-dark print:border-black font-bold pb-1">MARIA LOURDES REYES</div>
              <span className="text-text-grey print:text-slate-700 text-[9px] block mt-1">Billing &amp; Finance Specialist</span>
            </div>
            <div>
              <span className="text-text-grey print:text-slate-700 block mb-6">Approved By:</span>
              <div className="border-b border-text-dark print:border-black font-bold pb-1">JOSEPHINE TAN</div>
              <span className="text-text-grey print:text-slate-700 text-[9px] block mt-1">Warehouse Operations Manager</span>
            </div>
            <div>
              <span className="text-text-grey print:text-slate-700 block mb-6">Received &amp; Accepted By (Conforme):</span>
              <div className="border-b border-text-dark print:border-black font-bold pb-1">___________________________</div>
              <span className="text-text-grey print:text-slate-700 text-[9px] block mt-1">Authorized Customer Signature &amp; Date</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

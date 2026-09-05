"use client";

import React, { useState } from "react";
import {
  X,
  Printer,
  Download,
  CheckCircle2,
  Building2,
  FileText,
  ShieldCheck,
  Calendar,
  Lock,
  Share2,
} from "lucide-react";
import { TablePagination } from "@/components/ui/TablePagination";

const PDF_SAMPLE_ROWS = [
  { id: "1", name: "Siemens AG (Industrial)", flow: "VMI", cbm: "382.0 m³", rate: "$0.48/m³", valuation: "$5,684.16" },
  { id: "2", name: "ABB Group (Power Systems)", flow: "VMI", cbm: "215.0 m³", rate: "$0.50/m³", valuation: "$3,332.50" },
  { id: "3", name: "Fanuc Corp (Robotics)", flow: "VMI", cbm: "198.0 m³", rate: "$0.46/m³", valuation: "$2,823.36" },
  { id: "4", name: "Bearings & Transmission", flow: "Trading", cbm: "420.0 m³", rate: "22.4% Margin", valuation: "$245,000.00" },
  { id: "5", name: "Schneider Electric (Automation)", flow: "VMI", cbm: "164.0 m³", rate: "$0.45/m³", valuation: "$2,214.00" },
  { id: "6", name: "Omron Electronics (Sensors)", flow: "Trading", cbm: "110.0 m³", rate: "18.5% Margin", valuation: "$82,400.00" },
];

interface PdfPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportTitle?: string;
  reportSubtitle?: string;
  reportRefNumber?: string;
}

export function PdfPreviewModal({
  isOpen,
  onClose,
  reportTitle = "Master Inventory Position & Financial Valuation Summary",
  reportSubtitle = "Official Consolidated WMS Balance Sheet & CBM Space Reconciliation",
  reportRefNumber = "DS-RPT-2026-0831-VAL",
}: PdfPreviewModalProps) {
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(3);

  if (!isOpen) return null;

  const totalCount = PDF_SAMPLE_ROWS.length;
  const pageCount = Math.ceil(totalCount / pageSize) || 1;
  const pagedRows = PDF_SAMPLE_ROWS.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    alert(`Downloading ${reportRefNumber}.pdf...`);
  };

  const handleShare = () => {
    alert(`Secure link for ${reportRefNumber}.pdf copied to clipboard.`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 sm:p-4 backdrop-blur-xs animate-in fade-in">
      <div className="relative flex h-[100dvh] sm:h-auto sm:max-h-[92vh] w-full max-w-4xl flex-col rounded-t-3xl sm:rounded-2xl bg-white dark:bg-zinc-900 shadow-elevation-2 overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
        {/* ── Modal Header Bar ────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 bg-slate-50/90 dark:bg-zinc-800/90 px-4 sm:px-6 py-3.5">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-brand-navy dark:text-blue-400" />
            <div className="leading-tight">
              <h3 className="font-heading text-xs sm:text-sm font-bold text-brand-navy dark:text-zinc-100">
                PDF Document Viewer — {reportRefNumber}
              </h3>
              <span className="hidden sm:inline-block rounded-full bg-emerald-50 dark:bg-emerald-950 px-2 py-0.2 font-mono text-[9px] font-bold text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                AUDITED ARTIFACT
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="hidden sm:inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 font-label text-xs font-bold text-slate-700 dark:text-zinc-200 hover:bg-slate-50 shadow-2xs transition-colors"
            >
              <Printer size={13} />
              <span>Print</span>
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="hidden sm:inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-navy dark:bg-blue-600 px-3.5 font-label text-xs font-bold text-white hover:bg-brand-navy/90 shadow-2xs transition-colors"
            >
              <Download size={13} />
              <span>Download PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 sm:h-8 sm:w-8 items-center justify-center rounded-xl sm:rounded-lg bg-slate-200/60 dark:bg-zinc-700 text-slate-600 dark:text-zinc-300 hover:bg-slate-200 transition-colors"
              aria-label="Close modal"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Document Page (Simulated 8.5x11 Print Layout) ───────────────── */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-100 dark:bg-zinc-950 flex justify-center pb-24 sm:pb-8">
          <div className="w-full max-w-3xl rounded-lg border border-slate-300 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 sm:p-10 shadow-md text-slate-900 dark:text-zinc-100 font-body">
            {/* 1. Formal Document Header with Logo */}
            <div className="flex flex-col sm:flex-row items-start justify-between border-b-2 border-brand-navy dark:border-blue-500 pb-5 gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-navy dark:bg-blue-600 text-white font-heading font-black text-base shadow-sm">
                    DS
                  </div>
                  <div>
                    <h2 className="font-heading text-lg font-black text-brand-navy dark:text-blue-400 tracking-tight leading-none">
                      DYNA-SERV ENTERPRISES
                    </h2>
                    <p className="font-label text-[10px] uppercase tracking-widest text-text-grey mt-0.5">
                      Warehouse &amp; Supply Chain Management System
                    </p>
                  </div>
                </div>
                <div className="mt-3 text-xs text-text-grey space-y-0.5">
                  <p>Facility: Main Distribution Center (MDC) — All Zones</p>
                  <p>Address: Clark Special Economic Zone, Pampanga, Philippines</p>
                </div>
              </div>

              <div className="sm:text-right">
                <span className="inline-block rounded bg-brand-navy dark:bg-blue-600 px-2.5 py-1 font-mono text-xs font-bold text-white">
                  CONFIDENTIAL
                </span>
                <p className="mt-2 font-mono text-xs font-bold text-slate-800 dark:text-zinc-200">
                  Ref: <span className="text-brand-navy dark:text-blue-400">{reportRefNumber}</span>
                </p>
                <p className="mt-0.5 text-xs text-text-grey">
                  Date: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                </p>
              </div>
            </div>

            {/* 2. Document Title */}
            <div className="my-5">
              <h1 className="font-heading text-lg sm:text-xl font-bold text-brand-navy dark:text-zinc-100">
                {reportTitle}
              </h1>
              <p className="font-body text-xs text-text-grey mt-0.5">
                {reportSubtitle}
              </p>
            </div>

            {/* 3. Executive KPI Box */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-800/60 p-4 mb-6">
              <div>
                <p className="text-[10px] font-label font-bold uppercase tracking-wider text-text-grey">Total Valuation</p>
                <p className="font-mono text-sm sm:text-base font-black text-brand-navy dark:text-blue-400 mt-0.5">$2,480,500.00</p>
              </div>
              <div>
                <p className="text-[10px] font-label font-bold uppercase tracking-wider text-text-grey">Stock Items</p>
                <p className="font-mono text-sm sm:text-base font-black text-slate-900 dark:text-zinc-100 mt-0.5">1,420 SKUs</p>
              </div>
              <div>
                <p className="text-[10px] font-label font-bold uppercase tracking-wider text-text-grey">Occupied CBM</p>
                <p className="font-mono text-sm sm:text-base font-black text-blue-800 dark:text-blue-300 mt-0.5">1,640 m³ (82%)</p>
              </div>
              <div>
                <p className="text-[10px] font-label font-bold uppercase tracking-wider text-text-grey">Accrued Billing</p>
                <p className="font-mono text-sm sm:text-base font-black text-emerald-700 dark:text-emerald-400 mt-0.5">$34,200.00</p>
              </div>
            </div>

            {/* 4. Itemized Summary Table */}
            <div className="mb-6 overflow-x-auto">
              <h4 className="font-heading font-bold text-xs uppercase tracking-wider text-brand-navy dark:text-blue-400 mb-2">
                Top Client Storage &amp; Valuation Breakdown
              </h4>
              <table className="w-full border-collapse text-left text-xs border border-slate-200 dark:border-zinc-700 min-w-[500px]">
                <thead>
                  <tr className="bg-slate-100 dark:bg-zinc-800 font-label text-[11px] font-bold text-slate-700 dark:text-zinc-300 border-b border-slate-200 dark:border-zinc-700">
                    <th className="p-2 border-r border-slate-200 dark:border-zinc-700">Consignor / Category</th>
                    <th className="p-2 border-r border-slate-200 dark:border-zinc-700 text-center">Flow</th>
                    <th className="p-2 border-r border-slate-200 dark:border-zinc-700 text-right">Occupied CBM</th>
                    <th className="p-2 border-r border-slate-200 dark:border-zinc-700 text-right">Contract Rate</th>
                    <th className="p-2 text-right">MTD Valuation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-zinc-800 font-body">
                  {pagedRows.map((row) => (
                    <tr key={row.id}>
                      <td className="p-2 font-bold border-r border-slate-200 dark:border-zinc-700">{row.name}</td>
                      <td className="p-2 text-center border-r border-slate-200 dark:border-zinc-700 font-mono text-[11px]">{row.flow}</td>
                      <td className="p-2 text-right border-r border-slate-200 dark:border-zinc-700 font-mono">{row.cbm}</td>
                      <td className="p-2 text-right border-r border-slate-200 dark:border-zinc-700 font-mono">{row.rate}</td>
                      <td className="p-2 text-right font-mono font-bold text-slate-900 dark:text-zinc-100">{row.valuation}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 dark:bg-zinc-800 font-bold border-t-2 border-slate-300 dark:border-zinc-700">
                    <td className="p-2 border-r border-slate-200 dark:border-zinc-700" colSpan={2}>CONSOLIDATED TOTAL</td>
                    <td className="p-2 text-right border-r border-slate-200 dark:border-zinc-700 font-mono">1,215.0 m³</td>
                    <td className="p-2 text-right border-r border-slate-200 dark:border-zinc-700 font-mono">—</td>
                    <td className="p-2 text-right font-mono font-black text-brand-navy dark:text-blue-400">$256,839.02</td>
                  </tr>
                </tbody>
              </table>

              {/* Itemized Table Pagination */}
              <TablePagination
                pageIndex={pageIndex}
                pageSize={pageSize}
                totalCount={totalCount}
                pageCount={pageCount}
                canPreviousPage={pageIndex > 0}
                canNextPage={pageIndex < pageCount - 1}
                onPageChange={(newPageIndex) => setPageIndex(newPageIndex)}
                onPageSizeChange={(newPageSize) => {
                  setPageSize(newPageSize);
                  setPageIndex(0);
                }}
                pageSizeOptions={[2, 3, 5]}
              />
            </div>

            {/* 5. Formal Verification & Sign-off Block */}
            <div className="mt-8 pt-6 border-t border-slate-200 dark:border-zinc-800 grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
              <div>
                <p className="font-label font-bold text-text-grey uppercase text-[10px]">Prepared &amp; Verified By:</p>
                <div className="mt-6 border-b border-slate-400 w-48" />
                <p className="mt-1 font-bold text-slate-900 dark:text-zinc-100">L. Quidit</p>
                <p className="text-[11px] text-text-grey">Warehouse Supervisor / Operations Lead</p>
              </div>

              <div>
                <p className="font-label font-bold text-text-grey uppercase text-[10px]">Audited &amp; Approved By:</p>
                <div className="mt-6 border-b border-slate-400 w-48" />
                <p className="mt-1 font-bold text-slate-900 dark:text-zinc-100">Commercial &amp; Financial Controller</p>
                <p className="text-[11px] text-text-grey">Corporate Finance &amp; Contract Settlement</p>
              </div>
            </div>

            {/* 6. Footer Disclaimer */}
            <div className="mt-8 pt-4 border-t border-slate-100 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between text-[10px] text-text-grey font-mono gap-1">
              <span>Electronic Document generated via Dyna-Serv WIMS v2.4</span>
              <span>Ref: {reportRefNumber} · Confidential</span>
            </div>
          </div>
        </div>

        {/* ── Sticky Mobile Action Dock (Only visible on Mobile) ────────────── */}
        <div className="fixed sm:hidden bottom-0 inset-x-0 bg-white dark:bg-zinc-900 border-t border-slate-200 dark:border-zinc-800 p-3 grid grid-cols-3 gap-2 shadow-2xl z-20">
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center justify-center gap-1.5 min-h-[48px] rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 font-label text-xs font-bold text-slate-700 dark:text-zinc-200 active:scale-95"
          >
            <Printer size={16} />
            <span>Print</span>
          </button>

          <button
            type="button"
            onClick={handleShare}
            className="flex items-center justify-center gap-1.5 min-h-[48px] rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 font-label text-xs font-bold text-slate-700 dark:text-zinc-200 active:scale-95"
          >
            <Share2 size={16} />
            <span>Share</span>
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center justify-center gap-1.5 min-h-[48px] rounded-xl bg-brand-navy dark:bg-blue-600 text-white font-label text-xs font-bold shadow-md active:scale-95"
          >
            <Download size={16} />
            <span>Download</span>
          </button>
        </div>
      </div>
    </div>
  );
}

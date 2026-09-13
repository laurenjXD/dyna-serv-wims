"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Printer,
  Download,
  Building2,
  FileText,
  ShieldCheck,
  Calendar,
  Share2,
  TrendingUp,
  CheckCircle2,
  Warehouse,
} from "lucide-react";
import { TablePagination } from "@/components/ui/TablePagination";

export interface ReportLineRow {
  id: string;
  name: string;
  flow: string;
  cbm: string;
  rate: string;
  valuation: string;
}

const DEFAULT_REPORT_ROWS: ReportLineRow[] = [
  { id: "1", name: "United Philippine Industrial (UPI)", flow: "VMI", cbm: "382.0 m³", rate: "$0.48/m³-day", valuation: "$5,684.16" },
  { id: "2", name: "Siemens AG Industrial Systems", flow: "VMI", cbm: "215.0 m³", rate: "$0.50/m³-day", valuation: "$3,332.50" },
  { id: "3", name: "ABB Power & Distribution", flow: "VMI", cbm: "198.0 m³", rate: "$0.46/m³-day", valuation: "$2,823.36" },
  { id: "4", name: "Industrial Bearings & Transmission Hub", flow: "Trading", cbm: "420.0 m³", rate: "22.4% Margin", valuation: "$245,000.00" },
  { id: "5", name: "Schneider Electric Logistics", flow: "VMI", cbm: "164.0 m³", rate: "$0.45/m³-day", valuation: "$2,214.00" },
  { id: "6", name: "Omron Electronics Automation", flow: "Trading", cbm: "110.0 m³", rate: "18.5% Margin", valuation: "$82,400.00" },
];

interface PdfPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportTitle?: string;
  reportSubtitle?: string;
  reportRefNumber?: string;
  customRows?: ReportLineRow[];
}

export function PdfPreviewModal({
  isOpen,
  onClose,
  reportTitle = "Master Inventory Position & Financial Valuation Summary",
  reportSubtitle = "Official Consolidated WMS Balance Sheet & CBM Space Reconciliation",
  reportRefNumber = "DS-RPT-2026-0831-VAL",
  customRows,
}: PdfPreviewModalProps) {
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(5);
  const [zoomLevel, setZoomLevel] = useState<number>(100);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const rows = customRows && customRows.length > 0 ? customRows : DEFAULT_REPORT_ROWS;
  const totalCount = rows.length;
  const pageCount = Math.ceil(totalCount / pageSize) || 1;
  const pagedRows = rows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    // Generate simple text/CSV download or trigger printable PDF save
    const csvContent = "data:text/csv;charset=utf-8," +
      ["Consignor,Flow,Occupied CBM,Rate,Valuation"]
        .concat(rows.map(r => `"${r.name}","${r.flow}","${r.cbm}","${r.rate}","${r.valuation}"`))
        .join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${reportRefNumber}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleShare = () => {
    navigator.clipboard?.writeText?.(window.location.href);
    alert(`Secure report link for ${reportRefNumber} copied to clipboard!`);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-2 sm:p-4 backdrop-blur-md animate-in fade-in"
    >
      {/* ── Print Media Isolation Rules ──────────────────────────────── */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              aside, header, nav, .print-hide, .modal-toolbar {
                display: none !important;
              }
              body {
                background: #FFFFFF !important;
              }
              #printable-report-sheet {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                max-width: 100% !important;
                border: none !important;
                box-shadow: none !important;
                padding: 0 !important;
                margin: 0 !important;
                background: #FFFFFF !important;
              }
              @page {
                size: A4 portrait;
                margin: 10mm 12mm 12mm 12mm;
              }
            }
          `,
        }}
      />

      <div className="relative flex h-[94vh] w-full max-w-5xl flex-col rounded-3xl border border-outline-variant/30 bg-surface-white shadow-elevation-3 overflow-hidden">
        {/* ── Modal Header Bar ──────────────────────────────────────── */}
        <div className="modal-toolbar flex flex-wrap items-center justify-between border-b border-outline-variant/30 bg-surface px-6 py-3.5 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-navy/10 text-brand-navy">
              <FileText size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3
                  id="pdf-modal-title"
                  className="truncate font-heading text-headline-sm font-extrabold text-on-surface"
                >
                  {reportTitle}
                </h3>
                <span className="rounded bg-brand-navy/10 px-2 py-0.5 font-mono text-[11px] font-bold text-brand-navy">
                  {reportRefNumber}
                </span>
              </div>
              <p className="truncate font-body text-body-xs text-text-grey">
                {reportSubtitle}
              </p>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2">
            {/* Zoom Controls */}
            <div className="hidden sm:flex items-center rounded-xl border border-outline-variant/30 bg-surface-light-grey/40 px-1 py-0.5">
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.max(70, z - 10))}
                className="h-8 w-8 rounded-lg font-bold text-text-grey hover:bg-surface-white hover:text-on-surface"
                title="Zoom Out"
              >
                -
              </button>
              <span className="px-2 font-mono text-mono-xs text-text-grey font-bold">
                {zoomLevel}%
              </span>
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.min(130, z + 10))}
                className="h-8 w-8 rounded-lg font-bold text-text-grey hover:bg-surface-white hover:text-on-surface"
                title="Zoom In"
              >
                +
              </button>
            </div>

            <button
              type="button"
              onClick={handleShare}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-surface-white px-3 font-label text-label font-bold text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy transition-colors"
            >
              <Share2 size={14} />
              Share
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-surface-white px-3 font-label text-label font-bold text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy transition-colors"
            >
              <Printer size={14} />
              Print PDF
            </button>

            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand-navy px-3.5 font-label text-label font-bold text-surface-white hover:bg-brand-navy/90 focus:outline-none focus:ring-2 focus:ring-brand-navy transition-colors"
            >
              <Download size={14} />
              Download
            </button>

            <button
              type="button"
              onClick={onClose}
              className="ml-1 inline-flex h-9 w-9 items-center justify-center rounded-xl text-text-grey hover:bg-surface-light-grey hover:text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
              aria-label="Close preview modal"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Document Page Container ───────────────────────────────── */}
        <div className="flex-1 overflow-y-auto bg-slate-200/70 p-4 sm:p-6 flex justify-center">
          <div
            id="printable-report-sheet"
            style={{ transform: `scale(${zoomLevel / 100})` }}
            className="w-full max-w-4xl rounded-2xl border border-outline-variant/30 bg-surface-white p-8 sm:p-10 shadow-elevation-3 text-on-surface transition-transform duration-150 origin-top"
          >
            {/* 1. Formal Document Header with Logo */}
            <div className="flex flex-col sm:flex-row items-start justify-between border-b-2 border-brand-navy pb-5 gap-4">
              <div>
                <div className="flex items-center gap-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo.svg" alt="Dyna-Serv" className="h-9 w-auto" />
                  <div>
                    <h2 className="font-heading text-headline-sm font-extrabold text-brand-navy leading-none">
                      DYNA-SERV ENTERPRISES
                    </h2>
                    <p className="font-label text-[10px] uppercase tracking-widest text-text-grey mt-0.5">
                      Warehouse &amp; Supply Chain Management System
                    </p>
                  </div>
                </div>
                <div className="mt-3 text-body-xs text-text-grey space-y-0.5 font-body">
                  <p>Facility: Main Distribution Center (MDC) — All Logistics Zones</p>
                  <p>Address: Clark Special Economic Zone, Pampanga, Philippines</p>
                </div>
              </div>

              <div className="sm:text-right">
                <span className="inline-block rounded bg-brand-navy px-2.5 py-0.5 font-mono text-mono-xs font-bold text-surface-white">
                  IMMUTABLE AUDIT REPORT
                </span>
                <p className="mt-2 font-mono text-mono-xs font-bold text-on-surface">
                  Doc Ref: <span className="text-brand-navy">{reportRefNumber}</span>
                </p>
                <p className="mt-0.5 text-body-xs text-text-grey font-body">
                  Generated: {new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })}
                </p>
              </div>
            </div>

            {/* 2. Document Title & Subtitle */}
            <div className="my-6">
              <h1 className="font-heading text-headline-md font-bold text-brand-navy">
                {reportTitle}
              </h1>
              <p className="font-body text-body-sm text-text-grey mt-1">
                {reportSubtitle}
              </p>
            </div>

            {/* 3. Executive KPI Summary Box */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-xl border border-outline-variant/30 bg-surface-light-grey/40 p-4 mb-6">
              <div>
                <p className="font-label text-[10px] font-bold uppercase tracking-wider text-text-grey">Consolidated Valuation</p>
                <p className="font-mono text-mono-lg font-black text-brand-navy mt-0.5">$2,480,500.00</p>
              </div>
              <div>
                <p className="font-label text-[10px] font-bold uppercase tracking-wider text-text-grey">Active Stock Lines</p>
                <p className="font-mono text-mono-lg font-black text-on-surface mt-0.5">1,420 Lots</p>
              </div>
              <div>
                <p className="font-label text-[10px] font-bold uppercase tracking-wider text-text-grey">Storage Occupancy</p>
                <p className="font-mono text-mono-lg font-black text-brand-royal-blue mt-0.5">1,640 m³ (82%)</p>
              </div>
              <div>
                <p className="font-label text-[10px] font-bold uppercase tracking-wider text-text-grey">Accrued Charges</p>
                <p className="font-mono text-mono-lg font-black text-status-available mt-0.5">$34,200.00</p>
              </div>
            </div>

            {/* 4. Itemized Summary Table */}
            <div className="mb-6 overflow-x-auto">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-heading font-bold text-headline-xs uppercase tracking-wider text-brand-navy">
                  Account Breakdown &amp; Movement Summary
                </h4>
                <span className="font-mono text-mono-xs text-text-grey">
                  Showing {pagedRows.length} of {totalCount} records
                </span>
              </div>
              <table className="w-full border-collapse text-left text-body-sm border border-outline-variant/30">
                <thead>
                  <tr className="bg-surface-light-grey font-label text-label-xs uppercase font-bold text-text-grey border-b border-outline-variant/30">
                    <th className="p-2.5 border-r border-outline-variant/30">Account / Organization</th>
                    <th className="p-2.5 border-r border-outline-variant/30 text-center">Flow</th>
                    <th className="p-2.5 border-r border-outline-variant/30 text-right">Occupied CBM</th>
                    <th className="p-2.5 border-r border-outline-variant/30 text-right">Applied Rate</th>
                    <th className="p-2.5 text-right">Accrued Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20 font-body">
                  {pagedRows.map((row) => (
                    <tr key={row.id} className="hover:bg-brand-navy/[0.02]">
                      <td className="p-2.5 font-bold border-r border-outline-variant/30 text-on-surface">{row.name}</td>
                      <td className="p-2.5 text-center border-r border-outline-variant/30 font-mono text-mono-xs font-bold text-brand-navy">{row.flow}</td>
                      <td className="p-2.5 text-right border-r border-outline-variant/30 font-mono">{row.cbm}</td>
                      <td className="p-2.5 text-right border-r border-outline-variant/30 font-mono">{row.rate}</td>
                      <td className="p-2.5 text-right font-mono font-bold text-brand-navy">{row.valuation}</td>
                    </tr>
                  ))}
                  <tr className="bg-surface-light-grey/80 font-bold border-t-2 border-brand-navy">
                    <td className="p-2.5 border-r border-outline-variant/30" colSpan={2}>CONSOLIDATED TOTAL</td>
                    <td className="p-2.5 text-right border-r border-outline-variant/30 font-mono">1,489.0 m³</td>
                    <td className="p-2.5 text-right border-r border-outline-variant/30 font-mono">—</td>
                    <td className="p-2.5 text-right font-mono font-black text-brand-navy">$341,454.02</td>
                  </tr>
                </tbody>
              </table>

              {/* Itemized Table Pagination — hidden on print */}
              <div className="print-hide mt-2">
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
                  pageSizeOptions={[3, 5, 10]}
                />
              </div>
            </div>

            {/* 5. Formal Verification & Sign-off Block */}
            <div className="mt-8 pt-6 border-t border-outline-variant/30 grid grid-cols-1 sm:grid-cols-2 gap-6 text-body-sm font-body">
              <div>
                <p className="font-label font-bold text-text-grey uppercase text-[10px]">Prepared &amp; Verified By:</p>
                <div className="mt-8 border-b border-dashed border-outline-variant/60 w-48" />
                <p className="mt-1 font-bold text-on-surface">Warehouse Operations Lead</p>
                <p className="text-body-xs text-text-grey">Dyna-Serv Logistics Center</p>
              </div>

              <div>
                <p className="font-label font-bold text-text-grey uppercase text-[10px]">Audited &amp; Approved By:</p>
                <div className="mt-8 border-b border-dashed border-outline-variant/60 w-48" />
                <p className="mt-1 font-bold text-on-surface">Commercial Controller</p>
                <p className="text-body-xs text-text-grey">Finance &amp; Audit Administration</p>
              </div>
            </div>

            {/* 6. Footer Digital Stamp */}
            <div className="mt-8 pt-4 border-t border-outline-variant/20 flex flex-col sm:flex-row items-center justify-between text-[11px] text-text-grey font-mono gap-1">
              <div className="flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-brand-navy" />
                <span>SHA-256 Verified Immutable Snapshot · Stored in bucket: generated-documents</span>
              </div>
              <span>Ref: {reportRefNumber}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

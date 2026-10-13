"use client";

import React from "react";
import { Building2, ShieldCheck, Printer } from "lucide-react";

export interface MasterDocumentHeaderProps {
  documentTitle: string;
  documentNumber?: string;
  documentDate?: string | Date;
  status?: string;
  warehouseName?: string;
  companyName?: string;
  subtitle?: string;
  facilityAddress?: string;
  contactInfo?: string;
  taxOrPezaReg?: string;
  isoAccreditation?: string;
  orientation?: "portrait" | "landscape";
  showPrintButton?: boolean;
}

export function MasterDocumentHeader({
  documentTitle,
  documentNumber,
  documentDate = new Date(),
  status,
  warehouseName = "Main Warehouse & Logistics Hub — Biñan",
  companyName = "DYNA-SERV ENTERPRISES / LOGISTICS",
  subtitle = "Warehouse Inventory Management System (WIMS)",
  facilityAddress = "Lot 14 Block 3, Laguna Technopark Special Economic Zone, Biñan, Laguna 4024",
  contactInfo = "Tel: +63 (49) 541-2345 | Email: warehouse.ops@dyna-serv.com",
  taxOrPezaReg = "PEZA Reg. No. 01-1234 | VAT Reg. TIN: 008-765-432-000",
  isoAccreditation = "ISO 9001:2015 Certified Logistics Facility",
  orientation = "portrait",
  showPrintButton = true,
}: MasterDocumentHeaderProps) {
  const formattedDate =
    typeof documentDate === "string"
      ? documentDate
      : documentDate.toISOString().split("T")[0];

  return (
    <div
      className={`master-print-header w-full border-b-2 border-slate-900 pb-4 mb-6 ${
        orientation === "landscape" ? "max-w-6xl" : "max-w-4xl"
      }`}
    >
      <style>{`
        @media print {
          .master-print-header {
            border-bottom: 2px solid #000000 !important;
            padding-bottom: 12px !important;
            margin-bottom: 16px !important;
          }
          .print-header-actions {
            display: none !important;
          }
          @page {
            size: ${orientation === "landscape" ? "landscape" : "portrait"};
            margin: 12mm 15mm 15mm 15mm;
          }
        }
      `}</style>

      {/* Top Banner: Corporate Identity & Doc Metadata */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        {/* Left: Organization & Facility Profile */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white font-mono font-black text-sm print:border print:border-black">
              DS
            </span>
            <h1 className="font-heading text-lg font-black tracking-tight text-slate-900 uppercase">
              {companyName}
            </h1>
          </div>
          <p className="font-heading text-xs font-bold uppercase tracking-wider text-slate-600">
            {subtitle}
          </p>
          <p className="font-body text-xs text-slate-600 leading-tight">
            {facilityAddress}
          </p>
          <p className="font-body text-[11px] text-slate-500 font-mono">
            {contactInfo}
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[10px] font-mono text-slate-600">
            <span className="font-semibold">{taxOrPezaReg}</span>
            {isoAccreditation && (
              <>
                <span>•</span>
                <span className="text-slate-500">{isoAccreditation}</span>
              </>
            )}
          </div>
        </div>

        {/* Right: Document Designation & Actions */}
        <div className="flex flex-col sm:items-end justify-between self-stretch shrink-0">
          {showPrintButton && (
            <div className="print-header-actions mb-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-bold text-white shadow-xs hover:bg-slate-800 transition-all active:scale-[0.98]"
              >
                <Printer size={13} />
                <span>Print Document</span>
              </button>
            </div>
          )}

          <div className="rounded-lg border border-slate-300 bg-slate-50/80 p-2.5 sm:text-right min-w-[210px] print:border-black print:bg-white">
            <div className="font-mono text-xs font-bold uppercase tracking-wide text-slate-500">
              Document Ref
            </div>
            <div className="font-mono text-base font-black text-slate-900 tracking-tight">
              {documentNumber ?? "OFFICIAL COPY"}
            </div>
            <div className="mt-1 flex items-center justify-between sm:justify-end gap-3 text-xs font-mono text-slate-600">
              <span>Date: <strong>{formattedDate}</strong></span>
              {status && (
                <span className="rounded bg-slate-200 px-1.5 py-0.2 text-[10px] font-bold uppercase tracking-wider text-slate-800 print:border print:border-black">
                  {status}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Document Title Banner */}
      <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3">
        <h2 className="font-heading text-base font-extrabold uppercase tracking-wide text-slate-900">
          {documentTitle}
        </h2>
        <span className="font-mono text-xs font-medium text-slate-500">
          Warehouse: <strong className="text-slate-700">{warehouseName}</strong>
        </span>
      </div>
    </div>
  );
}

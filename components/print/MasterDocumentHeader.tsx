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
  logoUrl?: string;
  subtitle?: string;
  facilityAddress?: string;
  contactInfo?: string;
  taxOrPezaReg?: string;
  isoAccreditation?: string;
  orientation?: "portrait" | "landscape";
  showPrintButton?: boolean;
  headerAlignment?: "left" | "center";
  titleAlignment?: "left" | "center";
}

export function MasterDocumentHeader({
  documentTitle,
  documentNumber,
  documentDate = new Date(),
  status,
  warehouseName = "Main Warehouse & Logistics Hub — Biñan",
  companyName = "DYNA-SERV ENTERPRISES / LOGISTICS",
  logoUrl = "/logo-hd.png",
  subtitle = "Warehouse Inventory Management System (WIMS)",
  facilityAddress = "Lot 14 Block 3, Laguna Technopark Special Economic Zone, Biñan, Laguna 4024",
  contactInfo = "Tel: +63 (49) 541-2345 | Email: warehouse.ops@dyna-serv.com",
  taxOrPezaReg,
  isoAccreditation,
  orientation = "portrait",
  showPrintButton = true,
  headerAlignment = "left",
  titleAlignment = "left",
}: MasterDocumentHeaderProps) {
  const formattedDate =
    typeof documentDate === "string"
      ? documentDate
      : documentDate.toISOString().split("T")[0];

  const hasSubMeta = Boolean(taxOrPezaReg?.trim() || isoAccreditation?.trim());

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
      {headerAlignment === "center" ? (
        <div className="flex flex-col items-center text-center space-y-0.5 mb-2">
          {logoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={logoUrl}
              alt={companyName}
              className="h-8 w-auto max-w-[130px] object-contain mb-1 print:h-7"
            />
          ) : null}
          <h1 className="font-heading text-[15px] font-bold tracking-tight text-slate-900 uppercase">
            {companyName}
          </h1>
          <p className="font-heading text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            {subtitle}
          </p>
          <p className="font-body text-[11px] text-slate-600 leading-tight max-w-xl">
            {facilityAddress}
          </p>
          {contactInfo && (
            <p className="font-mono text-[11px] text-slate-500">
              {contactInfo}
            </p>
          )}
          {hasSubMeta && (
            <div className="flex flex-wrap justify-center items-center gap-2 pt-0.5 text-[10px] font-mono text-slate-500">
              {taxOrPezaReg && <span className="font-semibold">{taxOrPezaReg}</span>}
              {taxOrPezaReg && isoAccreditation && <span>•</span>}
              {isoAccreditation && (
                <span>{isoAccreditation}</span>
              )}
            </div>
          )}

          {/* Document Reference Block for Centered Layout (No bulky card) */}
          <div className="mt-2.5 flex w-full flex-wrap items-center justify-between gap-3 font-mono text-[11px] text-slate-600 border-t border-slate-200/80 pt-2">
            <div className="flex items-center gap-1.5 text-left">
              <span className="uppercase text-slate-500 text-[10px]">Doc Ref:</span>
              <strong className="font-bold text-slate-900 text-[12px]">{documentNumber ?? "OFFICIAL COPY"}</strong>
            </div>

            <div className="flex items-center gap-3">
              <span>Date: <strong className="text-slate-800">{formattedDate}</strong></span>
              {status && (
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-700 print:border print:border-black">
                  {status}
                </span>
              )}
              {showPrintButton && (
                <div className="print-header-actions print:hidden">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex h-6 items-center gap-1 rounded bg-slate-900 px-2 text-[11px] font-bold text-white shadow-xs hover:bg-slate-800"
                  >
                    <Printer size={11} />
                    <span>Print</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Left-aligned layout */
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          {/* Left: Organization & Facility Profile */}
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              {logoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={logoUrl}
                  alt={companyName}
                  className="h-8 w-auto max-w-[120px] shrink-0 object-contain print:h-7"
                />
              ) : null}
              <h1 className="font-heading text-[15px] font-bold tracking-tight text-slate-900 uppercase">
                {companyName}
              </h1>
            </div>
            <p className="font-heading text-[11px] font-semibold uppercase tracking-wider text-slate-600">
              {subtitle}
            </p>
            <p className="font-body text-[11px] text-slate-600 leading-tight">
              {facilityAddress}
            </p>
            {contactInfo && (
              <p className="font-mono text-[11px] text-slate-500">
                {contactInfo}
              </p>
            )}
            {hasSubMeta && (
              <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[10px] font-mono text-slate-500">
                {taxOrPezaReg && <span className="font-semibold">{taxOrPezaReg}</span>}
                {taxOrPezaReg && isoAccreditation && <span>•</span>}
                {isoAccreditation && (
                  <span>{isoAccreditation}</span>
                )}
              </div>
            )}
          </div>

          {/* Right: Document Designation & Actions (No bulky card) */}
          <div className="flex flex-col sm:items-end justify-between self-stretch shrink-0">
            {showPrintButton && (
              <div className="print-header-actions mb-1.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 text-[11px] font-bold text-white shadow-xs hover:bg-slate-800 transition-all active:scale-[0.98]"
                >
                  <Printer size={12} />
                  <span>Print Document</span>
                </button>
              </div>
            )}

            <div className="sm:text-right font-mono text-[11px] space-y-0.5">
              <div className="flex items-center sm:justify-end gap-1.5">
                <span className="text-slate-500 uppercase text-[10px]">Doc Ref:</span>
                <strong className="font-bold text-slate-900 text-[12px] tracking-tight">
                  {documentNumber ?? "OFFICIAL COPY"}
                </strong>
              </div>
              <div className="flex items-center sm:justify-end gap-2 text-slate-600">
                <span>Date: <strong className="text-slate-800">{formattedDate}</strong></span>
                {status && (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-700 print:border print:border-black">
                    {status}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Document Title Banner */}
      <div
        className={`mt-3 flex items-center border-t border-slate-200 pt-2.5 ${
          titleAlignment === "center"
            ? "flex-col justify-center text-center gap-0.5"
            : "justify-between"
        }`}
      >
        <h2 className="font-heading text-sm font-bold uppercase tracking-wider text-slate-900">
          {documentTitle}
        </h2>
        <span className="font-mono text-[11px] font-medium text-slate-500">
          Warehouse: <strong className="text-slate-700">{warehouseName}</strong>
        </span>
      </div>
    </div>
  );
}

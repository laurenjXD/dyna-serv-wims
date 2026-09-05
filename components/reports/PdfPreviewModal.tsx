"use client";

import React from "react";
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
} from "lucide-react";

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
  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    alert(`Downloading ${reportRefNumber}.pdf...`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in">
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-elevation-2 overflow-hidden">
        {/* ── Modal Header Bar ────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/90 px-6 py-3.5">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-brand-navy" />
            <h3 className="font-heading text-sm font-bold text-brand-navy">
              Live PDF Document Viewer — {reportRefNumber}
            </h3>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-800 border border-emerald-200">
              AUDITED ARTIFACT
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 font-label text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors"
            >
              <Printer size={13} />
              <span>Print</span>
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-navy px-3.5 font-label text-xs font-bold text-white hover:bg-brand-navy/90 shadow-2xs transition-colors"
            >
              <Download size={13} />
              <span>Download PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
              aria-label="Close modal"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Document Page (Simulated 8.5x11 Print Layout) ───────────────── */}
        <div className="overflow-y-auto p-6 sm:p-8 bg-slate-100 flex justify-center">
          <div className="w-full max-w-3xl rounded-lg border border-slate-300 bg-white p-8 sm:p-10 shadow-md text-slate-900 font-body">
            {/* 1. Formal Document Header with Logo */}
            <div className="flex items-start justify-between border-b-2 border-brand-navy pb-5">
              <div>
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-navy text-white font-heading font-black text-base shadow-sm">
                    DS
                  </div>
                  <div>
                    <h2 className="font-heading text-lg font-black text-brand-navy tracking-tight leading-none">
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

              <div className="text-right">
                <span className="inline-block rounded bg-brand-navy px-2.5 py-1 font-mono text-xs font-bold text-white">
                  CONFIDENTIAL
                </span>
                <p className="mt-2 font-mono text-xs font-bold text-slate-800">
                  Ref: <span className="text-brand-navy">{reportRefNumber}</span>
                </p>
                <p className="mt-0.5 text-xs text-text-grey">
                  Date: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                </p>
              </div>
            </div>

            {/* 2. Document Title */}
            <div className="my-5">
              <h1 className="font-heading text-xl font-bold text-brand-navy">
                {reportTitle}
              </h1>
              <p className="font-body text-xs text-text-grey mt-0.5">
                {reportSubtitle}
              </p>
            </div>

            {/* 3. Executive KPI Box */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4 mb-6">
              <div>
                <p className="text-[10px] font-label font-bold uppercase tracking-wider text-text-grey">Total Valuation</p>
                <p className="font-mono text-base font-black text-brand-navy mt-0.5">$2,480,500.00</p>
              </div>
              <div>
                <p className="text-[10px] font-label font-bold uppercase tracking-wider text-text-grey">Total Stock SKUs</p>
                <p className="font-mono text-base font-black text-slate-900 mt-0.5">1,420 Items</p>
              </div>
              <div>
                <p className="text-[10px] font-label font-bold uppercase tracking-wider text-text-grey">Occupied CBM</p>
                <p className="font-mono text-base font-black text-blue-800 mt-0.5">1,640.0 m³ (82%)</p>
              </div>
              <div>
                <p className="text-[10px] font-label font-bold uppercase tracking-wider text-text-grey">Net Accrued Billing</p>
                <p className="font-mono text-base font-black text-emerald-700 mt-0.5">$34,200.00</p>
              </div>
            </div>

            {/* 4. Itemized Summary Table */}
            <div className="mb-6">
              <h4 className="font-heading font-bold text-xs uppercase tracking-wider text-brand-navy mb-2">
                Top Client Storage &amp; Valuation Breakdown
              </h4>
              <table className="w-full border-collapse text-left text-xs border border-slate-200">
                <thead>
                  <tr className="bg-slate-100 font-label text-[11px] font-bold text-slate-700 border-b border-slate-200">
                    <th className="p-2 border-r border-slate-200">Consignor / Category</th>
                    <th className="p-2 border-r border-slate-200 text-center">Flow Type</th>
                    <th className="p-2 border-r border-slate-200 text-right">Occupied CBM</th>
                    <th className="p-2 border-r border-slate-200 text-right">Contract Rate</th>
                    <th className="p-2 text-right">MTD Valuation / Storage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-body">
                  <tr>
                    <td className="p-2 font-bold border-r border-slate-200">Siemens AG (Industrial High-Bay)</td>
                    <td className="p-2 text-center border-r border-slate-200 font-mono text-[11px]">VMI</td>
                    <td className="p-2 text-right border-r border-slate-200 font-mono">382.0 m³</td>
                    <td className="p-2 text-right border-r border-slate-200 font-mono">$0.48/m³</td>
                    <td className="p-2 text-right font-mono font-bold text-slate-900">$5,684.16</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-bold border-r border-slate-200">ABB Group (Power Systems)</td>
                    <td className="p-2 text-center border-r border-slate-200 font-mono text-[11px]">VMI</td>
                    <td className="p-2 text-right border-r border-slate-200 font-mono">215.0 m³</td>
                    <td className="p-2 text-right border-r border-slate-200 font-mono">$0.50/m³</td>
                    <td className="p-2 text-right font-mono font-bold text-slate-900">$3,332.50</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-bold border-r border-slate-200">Fanuc Corp (Robotics &amp; Servos)</td>
                    <td className="p-2 text-center border-r border-slate-200 font-mono text-[11px]">VMI</td>
                    <td className="p-2 text-right border-r border-slate-200 font-mono">198.0 m³</td>
                    <td className="p-2 text-right border-r border-slate-200 font-mono">$0.46/m³</td>
                    <td className="p-2 text-right font-mono font-bold text-slate-900">$2,823.36</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-bold border-r border-slate-200">Bearings &amp; Transmission Line</td>
                    <td className="p-2 text-center border-r border-slate-200 font-mono text-[11px]">Trading</td>
                    <td className="p-2 text-right border-r border-slate-200 font-mono">420.0 m³</td>
                    <td className="p-2 text-right border-r border-slate-200 font-mono">22.4% Margin</td>
                    <td className="p-2 text-right font-mono font-bold text-slate-900">$245,000.00</td>
                  </tr>
                  <tr className="bg-slate-50 font-bold border-t-2 border-slate-300">
                    <td className="p-2 border-r border-slate-200" colSpan={2}>CONSOLIDATED TOTAL</td>
                    <td className="p-2 text-right border-r border-slate-200 font-mono">1,215.0 m³</td>
                    <td className="p-2 text-right border-r border-slate-200 font-mono">—</td>
                    <td className="p-2 text-right font-mono font-black text-brand-navy">$256,839.02</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 5. Formal Verification & Sign-off Block */}
            <div className="mt-10 pt-6 border-t border-slate-200 grid grid-cols-2 gap-8 text-xs">
              <div>
                <p className="font-label font-bold text-text-grey uppercase text-[10px]">Prepared &amp; Verified By:</p>
                <div className="mt-6 border-b border-slate-400 w-48" />
                <p className="mt-1 font-bold text-slate-900">L. Quidit</p>
                <p className="text-[11px] text-text-grey">Warehouse Supervisor / Operations Lead</p>
              </div>

              <div>
                <p className="font-label font-bold text-text-grey uppercase text-[10px]">Audited &amp; Approved By:</p>
                <div className="mt-6 border-b border-slate-400 w-48" />
                <p className="mt-1 font-bold text-slate-900">Commercial &amp; Financial Controller</p>
                <p className="text-[11px] text-text-grey">Corporate Finance &amp; Contract Settlement</p>
              </div>
            </div>

            {/* 6. Footer Disclaimer */}
            <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between text-[10px] text-text-grey font-mono">
              <span>Electronic Document generated via Dyna-Serv WIMS v2.4</span>
              <span>Page 1 of 1 · System Time: 2026-08-31 23:59:59 PST</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

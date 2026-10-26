"use client";

import React, { useState } from "react";
import {
  X,
  Clock,
  Download,
} from "lucide-react";
import type { VmiBillingRow } from "./types";

interface VmiAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  row: VmiBillingRow | null;
}

export function VmiAuditModal({ isOpen, onClose, row }: VmiAuditModalProps) {
  const [activeAuditTab, setActiveAuditTab] = useState<"daily_cbm" | "lot_dwell">("daily_cbm");

  if (!isOpen || !row) return null;

  // Audit rows must come from the VMI ledger and inventory tables. Do not
  // synthesize movements or lot identities in a financial audit surface.
  const dailyAuditRows: Array<{
    date: string;
    dayNumber: number;
    openingCbm: number;
    inboundCbm: number;
    outboundCbm: number;
    closingCbm: number;
    rate: number;
    dailyFee: number;
    cumulativeCost: number;
  }> = [];
  const lotDwellRows: Array<{
    lotNumber: string;
    itemCode: string;
    itemName: string;
    intakeDate: string;
    qty: number;
    cbm: number;
    dwellDays: number;
    status: string;
  }> = [];
  const rate = row.contractedRatePerCbmDay;

  const handleExportAuditCsv = () => {
    const headers = ["Date", "Opening CBM", "Inbound CBM", "Outbound CBM", "Closing Billable CBM", "Rate ($/m3/day)", "Daily Storage Fee ($)", "Cumulative ($)"];
    const rowsCsv = dailyAuditRows.map((d) => [
      d.date,
      d.openingCbm,
      d.inboundCbm,
      d.outboundCbm,
      d.closingCbm,
      d.rate,
      d.dailyFee,
      d.cumulativeCost,
    ]);
    const csvContent = [headers.join(","), ...rowsCsv.map((e) => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `vmi-cbm-dwell-audit-${row.clientCode}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-[#F8FAFC] px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-brand-navy border border-blue-200/80">
              <Clock size={20} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-heading text-title-md font-bold text-brand-navy">
                  VMI CBM &amp; Dwell Time Audit Ledger
                </h3>
                <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 font-mono text-[10px] font-bold text-emerald-800">
                  VERIFIED AUDIT
                </span>
              </div>
              <p className="font-body text-xs text-text-grey">
                Organization: <strong className="text-slate-800">{row.clientName}</strong> ({row.clientCode}) · Live VMI ledger
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Summary Metric Strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <p className="font-label text-[10px] font-bold uppercase tracking-wider text-text-grey">
                Occupied Space
              </p>
              <p className="mt-1 font-mono text-title-sm font-bold text-brand-navy">
                {row.occupiedCbm.toLocaleString()} <span className="text-xs font-normal text-text-grey">m³</span>
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <p className="font-label text-[10px] font-bold uppercase tracking-wider text-text-grey">
                Storage Rate
              </p>
              <p className="mt-1 font-mono text-title-sm font-bold text-slate-800">
                {rate > 0 ? `$${rate.toFixed(2)}` : "—"} {rate > 0 && <span className="text-xs font-normal text-text-grey">/ m³ / day</span>}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <p className="font-label text-[10px] font-bold uppercase tracking-wider text-text-grey">
                Utilization
              </p>
              <p className="mt-1 font-mono text-title-sm font-bold text-slate-800">
                {row.utilizationPct}% <span className="text-xs font-normal text-text-grey">of allocated</span>
              </p>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
              <p className="font-label text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                MTD Accrued Fee
              </p>
              <p className="mt-1 font-mono text-title-sm font-bold text-emerald-700">
                ${row.mtdAccruedStorage.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          {/* Audit Sub-Tabs */}
          <div className="flex border-b border-slate-200">
            <button
              type="button"
              onClick={() => setActiveAuditTab("daily_cbm")}
              className={`border-b-2 px-4 py-2 font-label text-xs font-bold transition-all ${
                activeAuditTab === "daily_cbm"
                  ? "border-brand-navy text-brand-navy font-extrabold"
                  : "border-transparent text-text-grey hover:text-slate-900"
              }`}
            >
              Day-by-Day CBM Ledger (30 Days)
            </button>
            <button
              type="button"
              onClick={() => setActiveAuditTab("lot_dwell")}
              className={`border-b-2 px-4 py-2 font-label text-xs font-bold transition-all ${
                activeAuditTab === "lot_dwell"
                  ? "border-brand-navy text-brand-navy font-extrabold"
                  : "border-transparent text-text-grey hover:text-slate-900"
              }`}
            >
              Active Lot Dwell Times ({lotDwellRows.length} Lots)
            </button>
          </div>

          {/* Content Views */}
          {activeAuditTab === "daily_cbm" ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-2xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-[#F8FAFC] text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    <th className="px-3 py-2.5">Date</th>
                    <th className="px-3 py-2.5 text-right">Opening CBM</th>
                    <th className="px-3 py-2.5 text-right">Inbound (+)</th>
                    <th className="px-3 py-2.5 text-right">Outbound (-)</th>
                    <th className="px-3 py-2.5 text-right">Billable CBM</th>
                    <th className="px-3 py-2.5 text-right">Daily Fee</th>
                    <th className="px-3 py-2.5 text-right">Cumulative</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-mono">
                  {dailyAuditRows.length === 0 ? (
                    <tr><td colSpan={7} className="px-3 py-8 text-center font-body text-sm text-text-grey">No VMI ledger rows are available for this organization.</td></tr>
                  ) : dailyAuditRows.map((d) => (
                    <tr key={d.date} className="hover:bg-blue-50/40 transition-colors">
                      <td className="px-3 py-2 font-bold text-slate-800">{d.date}</td>
                      <td className="px-3 py-2 text-right text-text-grey">{d.openingCbm} m³</td>
                      <td className="px-3 py-2 text-right text-emerald-700">
                        {d.inboundCbm > 0 ? `+${d.inboundCbm} m³` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-purple-700">
                        {d.outboundCbm > 0 ? `-${d.outboundCbm} m³` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-brand-navy">{d.closingCbm} m³</td>
                      <td className="px-3 py-2 text-right text-slate-700">${d.dailyFee.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-bold text-emerald-700">${d.cumulativeCost.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-2xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-[#F8FAFC] text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    <th className="px-3 py-2.5">Lot Number</th>
                    <th className="px-3 py-2.5">Item Description</th>
                    <th className="px-3 py-2.5">Intake Date</th>
                    <th className="px-3 py-2.5 text-right">Quantity</th>
                    <th className="px-3 py-2.5 text-right">Volume</th>
                    <th className="px-3 py-2.5 text-right">Dwell Time</th>
                    <th className="px-3 py-2.5">Storage Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-mono">
                  {lotDwellRows.length === 0 ? (
                    <tr><td colSpan={7} className="px-3 py-8 text-center font-body text-sm text-text-grey">No active lot dwell records are available.</td></tr>
                  ) : lotDwellRows.map((lot) => (
                    <tr key={lot.lotNumber} className="hover:bg-blue-50/40 transition-colors">
                      <td className="px-3 py-2 font-bold text-brand-navy">{lot.lotNumber}</td>
                      <td className="px-3 py-2 font-body text-slate-800">
                        <span className="font-mono text-xs font-bold text-slate-700 mr-1">{lot.itemCode}</span>
                        {lot.itemName}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{lot.intakeDate}</td>
                      <td className="px-3 py-2 text-right font-bold">{lot.qty.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-text-grey">{lot.cbm} m³</td>
                      <td className="px-3 py-2 text-right font-bold text-amber-700">{lot.dwellDays} Days</td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200">
                          {lot.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-[#F8FAFC] px-6 py-3.5">
          <button
            type="button"
            onClick={handleExportAuditCsv}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 font-label text-xs font-bold text-brand-navy shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <Download size={13} />
            <span>Export Audit Ledger (.CSV)</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-brand-navy px-4 py-2 font-label text-xs font-bold text-white shadow-2xs hover:bg-brand-navy/90 transition-colors cursor-pointer"
          >
            Close Audit
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import {
  X,
  Clock,
  Download,
} from "@/components/ui/icons";
import type { VmiBillingRow } from "./types";

interface VmiAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  row: VmiBillingRow | null;
}

export function VmiAuditModal({ isOpen, onClose, row }: VmiAuditModalProps) {
  if (!isOpen || !row) return null;

  const dailyAuditRows = row.dailyLedgerRows.reduce<Array<{
    date: string;
    openingCbm: number;
    inboundCbm: number;
    outboundCbm: number;
    closingCbm: number;
    rate: number;
    dailyFee: number;
    cumulativeCost: number;
  }>>((rows, day) => {
    const cumulativeCost = (rows.at(-1)?.cumulativeCost ?? 0) + day.storageAmountUsd;
    rows.push({
      date: day.date,
      openingCbm: day.beginningCbm,
      inboundCbm: day.inboundCbm,
      outboundCbm: day.outboundCbm,
      closingCbm: day.billedBalanceCbm,
      rate: day.appliedRateUsd,
      dailyFee: day.storageAmountUsd,
      cumulativeCost,
    });
    return rows;
  }, []);
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
                Contract CBM Threshold
              </p>
              <p className="mt-1 font-mono text-title-sm font-bold text-slate-800">
                {row.cbmThresholdType === "none" || row.cbmThresholdCbm === null
                  ? "None"
                  : `${row.cbmThresholdType.replaceAll("_", " ")} · ${row.cbmThresholdCbm.toLocaleString()} m³`}
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

          <h4 className="border-b border-slate-200 pb-2 font-label text-xs font-bold text-brand-navy">Day-by-Day CBM Ledger · Current Month</h4>

          {/* Content Views */}
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
                    <tr><td colSpan={7} className="px-3 py-8 text-center font-body text-sm text-text-grey">No VMI ledger rows are available for this Organization. Close this view and choose another Organization.</td></tr>
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

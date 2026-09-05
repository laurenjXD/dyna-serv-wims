"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Building2,
  FileText,
  Download,
  Clock,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  Receipt,
  Search,
} from "lucide-react";
import type { VmiBillingRow } from "./types";
import { VMI_BILLING_SEED } from "./data/reportsSeedData";

interface VmiBillingTableProps {
  onGenerateInvoicePdf: (row: VmiBillingRow) => void;
  onAuditDwellTime: (row: VmiBillingRow) => void;
}

export function VmiBillingTable({
  onGenerateInvoicePdf,
  onAuditDwellTime,
}: VmiBillingTableProps) {
  const [data, setData] = useState<VmiBillingRow[]>(VMI_BILLING_SEED);
  const [searchTerm, setSearchTerm] = useState("");

  const filteredData = data.filter((row) =>
    row.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    row.clientCode.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalAccrued = data.reduce((acc, row) => acc + row.mtdAccruedStorage, 0);
  const totalOccupied = data.reduce((acc, row) => acc + row.occupiedCbm, 0);
  const totalAllocated = data.reduce((acc, row) => acc + row.allocatedSpaceCbm, 0);
  const avgUtilization = Math.round((totalOccupied / totalAllocated) * 100);

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-surface-white shadow-sm overflow-hidden">
      {/* ── Table Header Strip ──────────────────────────────────────────── */}
      <div className="border-b border-slate-100 bg-slate-50/70 p-5 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-heading text-title-md font-bold text-brand-navy flex items-center gap-2">
              <Receipt size={18} className="text-brand-navy" />
              VMI Client Storage &amp; CBM Billing Reconciliation
            </h3>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 font-mono text-[10px] font-bold text-emerald-800 border border-emerald-200">
              AUDITED CONTRACT RATES
            </span>
          </div>
          <p className="mt-0.5 font-body text-xs text-text-grey">
            Calculates daily volumetric CBM consumption, contracted rates, and unbilled periods for month-end SOA settlement.
          </p>
        </div>

        {/* Global Search & Summary Badges */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search consignor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8 w-44 rounded-lg border border-slate-200 bg-white pl-7 pr-2.5 font-body text-xs text-brand-navy focus:border-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-navy shadow-2xs"
            />
          </div>

          <div className="hidden lg:flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs">
            <span className="font-label text-[11px] font-bold text-text-grey">MTD Total:</span>
            <span className="font-mono text-xs font-black text-brand-navy">
              ${totalAccrued.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>

      {/* ── Table Grid ──────────────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs font-body">
          <thead>
            <tr className="border-b border-slate-200/80 bg-slate-50/70 font-label text-[11px] font-bold uppercase tracking-wider text-text-grey">
              <th className="px-4 py-3">Client / Consignor</th>
              <th className="px-4 py-3 text-right">Allocated Space</th>
              <th className="px-4 py-3 min-w-[180px]">Occupied &amp; Utilization</th>
              <th className="px-4 py-3 text-right">Rate ($/m³/day)</th>
              <th className="px-4 py-3 text-right">MTD Accrued</th>
              <th className="px-4 py-3 text-center">Unbilled Period</th>
              <th className="px-4 py-3 text-center">Billing Status</th>
              <th className="px-4 py-3 text-center">Row Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-body">
            {filteredData.map((row) => {
              const utilColor =
                row.utilizationPct > 80
                  ? "bg-rose-500"
                  : row.utilizationPct > 65
                  ? "bg-blue-600"
                  : "bg-emerald-500";

              return (
                <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                  {/* Client / Consignor */}
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 font-mono text-xs font-bold text-brand-navy">
                        {row.clientCode.slice(0, 3)}
                      </div>
                      <div>
                        <p className="font-bold text-slate-900">{row.clientName}</p>
                        <p className="text-[11px] text-text-grey font-medium">{row.contactPerson}</p>
                      </div>
                    </div>
                  </td>

                  {/* Allocated Space */}
                  <td className="px-4 py-3 text-right font-mono font-bold text-slate-700">
                    {row.allocatedSpaceCbm} m³
                  </td>

                  {/* Occupied CBM & Utilization % Meter */}
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-mono font-bold text-slate-800">{row.occupiedCbm} m³</span>
                        <span className="font-mono font-black text-brand-navy">{row.utilizationPct}%</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${utilColor}`}
                          style={{ width: `${row.utilizationPct}%` }}
                        />
                      </div>
                    </div>
                  </td>

                  {/* Contracted Rate */}
                  <td className="px-4 py-3 text-right font-mono font-semibold text-slate-700">
                    ${row.contractedRatePerCbmDay.toFixed(2)}
                  </td>

                  {/* MTD Accrued Storage */}
                  <td className="px-4 py-3 text-right font-mono font-black text-emerald-700">
                    ${row.mtdAccruedStorage.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </td>

                  {/* Unbilled Days */}
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-700">
                      <Clock size={11} className="text-slate-400" />
                      {row.unbilledDays} Days
                    </span>
                  </td>

                  {/* Billing Status Badge */}
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-label text-[10px] font-bold ${
                        row.billingStatus === "Ready to Invoice"
                          ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                          : row.billingStatus === "Draft Generated"
                          ? "bg-amber-50 text-amber-800 border border-amber-200"
                          : "bg-blue-50 text-blue-800 border border-blue-200"
                      }`}
                    >
                      {row.billingStatus === "Ready to Invoice" && <CheckCircle2 size={11} />}
                      {row.billingStatus}
                    </span>
                  </td>

                  {/* Row Actions */}
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onGenerateInvoicePdf(row)}
                        className="inline-flex items-center gap-1 rounded-lg bg-brand-navy px-2.5 py-1 font-label text-[11px] font-bold text-white hover:bg-brand-navy/90 shadow-2xs transition-colors"
                        title="Generate Statement of Account (PDF)"
                      >
                        <FileText size={12} />
                        <span>Generate Bill</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onAuditDwellTime(row)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 font-label text-[11px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
                        title="Audit Dwell Time & Movement Logs"
                      >
                        <Clock size={12} className="text-slate-400" />
                        <span>Audit Dwell</span>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Table Footer Summary ────────────────────────────────────────── */}
      <div className="border-t border-slate-200 bg-slate-50/50 p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-4 text-text-grey font-medium">
          <span>Active Consignors: <strong className="text-slate-900">{data.length}</strong></span>
          <span>Avg Warehouse Utilization: <strong className="text-brand-navy font-mono font-bold">{avgUtilization}%</strong></span>
        </div>

        <Link
          href="/billing-pricing"
          className="inline-flex items-center gap-1 font-label text-xs font-bold text-brand-navy hover:underline"
        >
          <span>Open Full Billing &amp; Pricing Hub</span>
          <ExternalLink size={12} />
        </Link>
      </div>
    </div>
  );
}

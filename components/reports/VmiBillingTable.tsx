"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Building2,
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  Receipt,
  Search,
} from "lucide-react";
import type { VmiBillingRow } from "./types";
import { TablePagination } from "@/components/ui/TablePagination";

interface VmiBillingTableProps {
  initialData?: VmiBillingRow[];
  onGenerateInvoicePdf: (row: VmiBillingRow) => void;
  onAuditDwellTime: (row: VmiBillingRow) => void;
}

export function VmiBillingTable({
  initialData,
  onGenerateInvoicePdf,
  onAuditDwellTime,
}: VmiBillingTableProps) {
  const [data] = useState<VmiBillingRow[]>(initialData || []);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedRows, setExpandedRows] = useState<string[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(5);

  const toggleRowExpand = (id: string) => {
    setExpandedRows((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
  };

  const filteredData = data.filter((row) =>
    row.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    row.clientCode.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalCount = filteredData.length;
  const pageCount = Math.ceil(totalCount / pageSize) || 1;
  const pagedData = filteredData.slice(
    pageIndex * pageSize,
    (pageIndex + 1) * pageSize
  );

  const handleSearchChange = (term: string) => {
    setSearchTerm(term);
    setPageIndex(0);
  };

  const totalAccrued = data.reduce((acc, row) => acc + row.mtdAccruedStorage, 0);
  const totalOccupied = data.reduce((acc, row) => acc + row.occupiedCbm, 0);

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-surface-white p-5 shadow-sm space-y-4">
      {/* ── Table Header & Controls ────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-heading text-title-md font-bold text-brand-navy flex items-center gap-2">
              <Receipt size={18} className="text-brand-navy" />
              VMI Client Storage &amp; CBM Billing Reconciliation
            </h3>
            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 font-mono text-[10px] font-bold text-brand-navy border border-blue-200">
              AUDIT READY
            </span>
          </div>
          <p className="mt-0.5 font-body text-xs text-text-grey">
            Consolidated daily CBM consumption, contracted rates, and unbilled storage accruals across consignment clients.
          </p>
        </div>

        {/* Global Stats and Search Bar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search VMI Client..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 font-body text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-navy focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-3 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 font-mono text-xs">
            <div>
              <span className="text-[10px] text-text-grey uppercase block">Total Occupied:</span>
              <span className="font-bold text-slate-900">{totalOccupied.toLocaleString()} m³</span>
            </div>
            <div className="border-l border-slate-200 pl-3">
              <span className="text-[10px] text-text-grey uppercase block">MTD Accrued:</span>
              <span className="font-bold text-emerald-700">${totalAccrued.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── 📱 Mobile Card Accordion View (< 1024px) ────────────────────────── */}
      <div className="block lg:hidden space-y-3">
        {pagedData.length > 0 ? (
          pagedData.map((row) => {
            const isExpanded = expandedRows.includes(row.id);
            return (
              <div
                key={row.id}
                className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm space-y-3 transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-brand-navy shrink-0">
                      <Building2 size={16} />
                    </div>
                    <div>
                      <h4 className="font-heading text-sm font-bold text-brand-navy">
                        {row.clientName}
                      </h4>
                      <p className="font-mono text-[11px] text-text-grey">
                        {row.clientCode} · {row.contactPerson}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold ${
                      row.billingStatus === "Ready to Invoice"
                        ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                        : row.billingStatus === "Draft Generated"
                        ? "bg-blue-50 text-blue-800 border border-blue-200"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {row.billingStatus}
                  </span>
                </div>

                {/* Primary Metric Pill Row */}
                <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-xl text-xs font-mono">
                  <div>
                    <span className="text-[10px] text-text-grey block font-sans">Space Utilization:</span>
                    <span className="font-bold text-slate-900">{row.occupiedCbm} / {row.allocatedSpaceCbm} m³</span>
                    <span className="text-[10px] text-brand-navy font-semibold ml-1">({row.utilizationPct}%)</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-text-grey block font-sans">MTD Accrued ({row.currency}):</span>
                    <span className="font-bold text-emerald-800 text-sm">
                      ${row.mtdAccruedStorage.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* Expanded Details Drawer */}
                {isExpanded && (
                  <div className="pt-2 border-t border-slate-100 space-y-2 text-xs font-body animate-in fade-in">
                    <div className="flex justify-between py-1 border-b border-slate-50">
                      <span className="text-text-grey">Contract Storage Rate:</span>
                      <span className="font-mono font-bold text-slate-800">${row.contractedRatePerCbmDay} / m³ / day</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-50">
                      <span className="text-text-grey">Unbilled Cycle Days:</span>
                      <span className="font-mono font-bold text-slate-800">{row.unbilledDays} days (Full MTD)</span>
                    </div>
                  </div>
                )}

                {/* Action Dock (Minimum 44px touch targets) */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => onAuditDwellTime(row)}
                    className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white font-label text-xs font-bold text-slate-700 shadow-2xs active:bg-slate-50"
                  >
                    <Clock size={14} className="text-slate-500" />
                    <span>Audit Dwell</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onGenerateInvoicePdf(row)}
                    className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-brand-navy font-label text-xs font-bold text-white shadow-2xs active:bg-brand-navy/90"
                  >
                    <FileText size={14} />
                    <span>Statement SOA</span>
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-xs text-text-grey">
            No VMI billing clients match your search.
          </div>
        )}
      </div>

      {/* ── 🖥️ Desktop Full Table View (>= 1024px) ─────────────────────────── */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/70 font-label text-[11px] font-bold uppercase tracking-wider text-text-grey">
              <th className="px-4 py-3">Client / Consignor</th>
              <th className="px-4 py-3">Allocated CBM</th>
              <th className="px-4 py-3">Occupied CBM</th>
              <th className="px-4 py-3">Utilization</th>
              <th className="px-4 py-3">Rate / m³ / Day</th>
              <th className="px-4 py-3 text-right">MTD Accrued</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-body text-xs">
            {pagedData.length > 0 ? (
              pagedData.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-brand-navy font-bold text-xs">
                        <Building2 size={14} />
                      </div>
                      <div>
                        <span className="font-bold text-slate-900 block">{row.clientName}</span>
                        <span className="font-mono text-[11px] text-text-grey">{row.clientCode} · {row.contactPerson}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-700">
                    {row.allocatedSpaceCbm} m³
                  </td>
                  <td className="px-4 py-3 font-mono font-bold text-slate-900">
                    {row.occupiedCbm} m³
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-1.5 rounded-full ${
                            row.utilizationPct > 80
                              ? "bg-amber-500"
                              : "bg-brand-navy"
                          }`}
                          style={{ width: `${Math.min(row.utilizationPct, 100)}%` }}
                        ></div>
                      </div>
                      <span className="font-mono font-semibold text-slate-700 text-[11px]">
                        {row.utilizationPct}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-700">
                    ${row.contractedRatePerCbmDay.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 font-mono font-black text-right text-emerald-800 text-sm">
                    ${row.mtdAccruedStorage.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[11px] font-bold ${
                        row.billingStatus === "Ready to Invoice"
                          ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                          : row.billingStatus === "Draft Generated"
                          ? "bg-blue-50 text-blue-800 border border-blue-200"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {row.billingStatus === "Ready to Invoice" && <CheckCircle2 size={11} />}
                      {row.billingStatus === "Draft Generated" && <FileText size={11} />}
                      {row.billingStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onAuditDwellTime(row)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 font-label text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
                        title="Audit Dwell Time & Space Consumption Log"
                      >
                        <Clock size={12} className="text-slate-400" />
                        <span>Dwell</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onGenerateInvoicePdf(row)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg bg-brand-navy px-2.5 font-label text-xs font-bold text-white hover:bg-brand-navy/90 transition-colors shadow-2xs"
                        title="Generate Official Statement of Account PDF"
                      >
                        <FileText size={12} />
                        <span>SOA Invoice</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="py-8 text-center text-xs text-text-grey">
                  No VMI billing clients match your search criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Standard Pagination Bar ────────────────────────────────────────── */}
      <TablePagination
        currentPage={pageIndex + 1}
        totalPages={pageCount}
        pageSize={pageSize}
        totalItems={totalCount}
        onPageChange={(page) => setPageIndex(page - 1)}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          setPageIndex(0);
        }}
        pageSizeOptions={[5, 10, 20]}
        className="border-t border-slate-100 pt-2"
      />
    </div>
  );
}

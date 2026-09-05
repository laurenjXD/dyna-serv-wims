"use client";

import React from "react";
import Link from "next/link";
import {
  TrendingUp,
  DollarSign,
  PackageCheck,
  ClipboardList,
  FlaskConical,
  AlertTriangle,
  Lock,
  CheckCircle2,
  Warehouse,
  Receipt,
  ArrowUpRight,
  Sparkles,
} from "lucide-react";
import type { DashboardKpiData } from "./types";

interface KpiGridProps {
  data: DashboardKpiData;
}

export function KpiGrid({ data }: KpiGridProps) {
  const { valuation, floorQueues, financialSummary } = data;
  const totalOpenTasks =
    floorQueues.pendingReceivingWrrs +
    floorQueues.activePickLists +
    floorQueues.pendingQcInspections;

  return (
    <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
      {/* ── CARD 1: Total Inventory Valuation ────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-surface-white p-5 shadow-sm transition-all hover:shadow-md">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-label text-[11px] font-bold uppercase tracking-wider text-text-grey">
              Total Inventory Valuation
            </p>
            <div className="mt-1.5 flex items-baseline gap-2">
              <h2 className="font-mono text-2xl sm:text-3xl font-black text-brand-navy tracking-tight">
                ${valuation.total.toLocaleString()}
              </h2>
              <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 font-mono text-xs font-bold text-emerald-700 border border-emerald-200/60">
                <TrendingUp size={12} />
                +{valuation.trendPct}%
              </span>
            </div>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-brand-navy border border-blue-200/80 shrink-0">
            <DollarSign size={22} />
          </div>
        </div>

        {/* Secondary breakdown pills */}
        <div className="mt-4 pt-3.5 border-t border-slate-100 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-xs font-bold text-slate-800 border border-slate-200/60">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-navy"></span>
            VMI: ${(valuation.vmiAmount / 1000000).toFixed(1)}M
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1 font-mono text-xs font-bold text-blue-900 border border-blue-200/60">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500"></span>
            Trading: ${(valuation.tradingAmount / 1000).toFixed(0)}K
          </span>
        </div>
      </div>

      {/* ── CARD 2: Open Floor Queues (Alerting Urgent Status) ───────────── */}
      <div className="relative overflow-hidden rounded-2xl border-2 border-amber-300/80 bg-gradient-to-b from-amber-50/40 via-surface-white to-surface-white p-5 shadow-sm transition-all hover:shadow-md flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
              </span>
              <p className="font-label text-[11px] font-black uppercase tracking-wider text-amber-900">
                Open Floor Queues
              </p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-0.5 font-mono text-[11px] font-black text-white shadow-2xs">
              {totalOpenTasks} PENDING
            </span>
          </div>

          <div className="mt-3 space-y-2">
            {/* Receiving Queue */}
            <Link
              href="/receiving"
              className="group flex items-center justify-between rounded-xl bg-amber-100/60 hover:bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-950 transition-colors border border-amber-200/80 shadow-2xs"
            >
              <div className="flex items-center gap-2">
                <PackageCheck size={15} className="text-amber-700 group-hover:scale-110 transition-transform shrink-0" />
                <span>Pending Receiving WRRs</span>
              </div>
              <span className="font-mono font-black text-xs text-white bg-amber-600 group-hover:bg-amber-700 px-2.5 py-0.5 rounded-md shadow-xs ring-2 ring-amber-300/80">
                {floorQueues.pendingReceivingWrrs}
              </span>
            </Link>

            {/* Pick Lists Queue */}
            <Link
              href="/outgoing"
              className="group flex items-center justify-between rounded-xl bg-blue-100/60 hover:bg-blue-100 px-3 py-2 text-xs font-semibold text-blue-950 transition-colors border border-blue-200/80 shadow-2xs"
            >
              <div className="flex items-center gap-2">
                <ClipboardList size={15} className="text-blue-700 group-hover:scale-110 transition-transform shrink-0" />
                <span>Active Pick Lists to Execute</span>
              </div>
              <span className="font-mono font-black text-xs text-white bg-blue-600 group-hover:bg-blue-700 px-2.5 py-0.5 rounded-md shadow-xs ring-2 ring-blue-300/80">
                {floorQueues.activePickLists}
              </span>
            </Link>

            {/* QC Queue */}
            <Link
              href="/inspection"
              className="group flex items-center justify-between rounded-xl bg-rose-100/60 hover:bg-rose-100 px-3 py-2 text-xs font-semibold text-rose-950 transition-colors border border-rose-200/80 shadow-2xs"
            >
              <div className="flex items-center gap-2">
                <FlaskConical size={15} className="text-rose-700 group-hover:scale-110 transition-transform shrink-0" />
                <span>Pending QC Inspections</span>
              </div>
              <span className="font-mono font-black text-xs text-white bg-rose-600 group-hover:bg-rose-700 px-2.5 py-0.5 rounded-md shadow-xs ring-2 ring-rose-300/80">
                {floorQueues.pendingQcInspections}
              </span>
            </Link>
          </div>
        </div>
      </div>

      {/* ── CARD 3: Financial Summary ────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-surface-white p-5 shadow-sm transition-all hover:shadow-md flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between">
            <p className="font-label text-[11px] font-bold uppercase tracking-wider text-text-grey">
              Financial Summary
            </p>
            <span className="font-mono text-[11px] font-bold text-brand-navy">
              MTD Position
            </span>
          </div>

          <div className="mt-3 space-y-2.5">
            {/* VMI Daily CBM Storage Rate */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-1.5 text-xs text-slate-700">
                <Warehouse size={13} className="text-slate-400" />
                <span>VMI Storage Rate</span>
              </div>
              <div className="text-right">
                <span className="font-mono text-xs font-bold text-slate-900">
                  ${financialSummary.vmiDailyCbmRate.toFixed(2)} / m³
                </span>
                <span className="block text-[10px] text-text-grey">
                  Avg across {financialSummary.vmiClientCount} clients
                </span>
              </div>
            </div>

            {/* Trading Margin */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-xs text-slate-700">Trading Margin (MTD)</span>
              <div className="text-right">
                <span className="font-mono text-xs font-bold text-brand-navy">
                  {financialSummary.tradingMarginPct}%
                </span>
                <span className="block text-[10px] text-text-grey">
                  Target: {financialSummary.tradingMarginTargetPct}%
                </span>
              </div>
            </div>

            {/* Pending Billing */}
            <div className="flex items-center justify-between pt-0.5">
              <div className="flex items-center gap-1.5 text-xs text-slate-700">
                <Receipt size={13} className="text-slate-400" />
                <span>Pending Billing</span>
              </div>
              <div className="text-right">
                <span className="font-mono text-xs font-bold text-emerald-700">
                  ${financialSummary.pendingBillingAmount.toLocaleString()}
                </span>
                <span className="block text-[10px] text-text-grey">
                  {financialSummary.pendingInvoicesCount} invoices to issue
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

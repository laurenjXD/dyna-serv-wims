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
  const { valuation, floorQueues, stockHealth, financialSummary } = data;

  return (
    <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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

      {/* ── CARD 2: Open Floor Queues ────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-surface-white p-5 shadow-sm transition-all hover:shadow-md flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between">
            <p className="font-label text-[11px] font-bold uppercase tracking-wider text-text-grey">
              Open Floor Queues
            </p>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-700">
              {floorQueues.pendingReceivingWrrs + floorQueues.activePickLists + floorQueues.pendingQcInspections} Tasks
            </span>
          </div>

          <div className="mt-3 space-y-2">
            {/* Receiving Queue */}
            <Link
              href="/receiving"
              className="group flex items-center justify-between rounded-xl bg-slate-50/90 px-3 py-2 text-xs font-medium text-slate-800 hover:bg-blue-50 hover:text-brand-navy transition-colors border border-slate-200/60"
            >
              <div className="flex items-center gap-2">
                <PackageCheck size={14} className="text-blue-600 group-hover:scale-110 transition-transform" />
                <span>Pending Receiving WRRs</span>
              </div>
              <span className="font-mono font-bold text-brand-navy bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-2xs">
                {floorQueues.pendingReceivingWrrs}
              </span>
            </Link>

            {/* Pick Lists Queue */}
            <Link
              href="/outgoing"
              className="group flex items-center justify-between rounded-xl bg-slate-50/90 px-3 py-2 text-xs font-medium text-slate-800 hover:bg-blue-50 hover:text-brand-navy transition-colors border border-slate-200/60"
            >
              <div className="flex items-center gap-2">
                <ClipboardList size={14} className="text-indigo-600 group-hover:scale-110 transition-transform" />
                <span>Active Pick Lists to Execute</span>
              </div>
              <span className="font-mono font-bold text-indigo-900 bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-2xs">
                {floorQueues.activePickLists}
              </span>
            </Link>

            {/* QC Queue */}
            <Link
              href="/inspection"
              className="group flex items-center justify-between rounded-xl bg-slate-50/90 px-3 py-2 text-xs font-medium text-slate-800 hover:bg-blue-50 hover:text-brand-navy transition-colors border border-slate-200/60"
            >
              <div className="flex items-center gap-2">
                <FlaskConical size={14} className="text-amber-600 group-hover:scale-110 transition-transform" />
                <span>Pending QC Inspections</span>
              </div>
              <span className="font-mono font-bold text-amber-900 bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-2xs">
                {floorQueues.pendingQcInspections}
              </span>
            </Link>
          </div>
        </div>
      </div>

      {/* ── CARD 3: Stock Health & Quality ──────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-surface-white p-5 shadow-sm transition-all hover:shadow-md flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between">
            <p className="font-label text-[11px] font-bold uppercase tracking-wider text-text-grey">
              Stock Health &amp; Quality
            </p>
            <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-emerald-700">
              <CheckCircle2 size={13} />
              {stockHealth.qcPassRatePct}% Pass
            </span>
          </div>

          <div className="mt-3 space-y-2">
            {/* Low Stock Alert */}
            <div className="flex items-center justify-between rounded-xl bg-amber-50/80 border border-amber-200/70 px-3 py-2 text-xs">
              <div className="flex items-center gap-2 text-amber-900 font-medium">
                <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                <span>Low Stock Reorder Alerts</span>
              </div>
              <span className="font-mono font-bold text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-md">
                {stockHealth.lowStockCount} items
              </span>
            </div>

            {/* Held / Quarantined Lots */}
            <div className="flex items-center justify-between rounded-xl bg-rose-50/80 border border-rose-200/70 px-3 py-2 text-xs">
              <div className="flex items-center gap-2 text-rose-900 font-medium">
                <Lock size={14} className="text-rose-600 shrink-0" />
                <span>Held / Quarantined Lots</span>
              </div>
              <span className="font-mono font-bold text-rose-800 bg-rose-100/80 px-2 py-0.5 rounded-md">
                {stockHealth.heldLotsCount} lots
              </span>
            </div>

            {/* QC Pass Rate */}
            <div className="flex items-center justify-between rounded-xl bg-emerald-50/80 border border-emerald-200/70 px-3 py-2 text-xs">
              <div className="flex items-center gap-2 text-emerald-900 font-medium">
                <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                <span>QC Pass Rate (30d)</span>
              </div>
              <span className="font-mono font-bold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-md">
                {stockHealth.qcPassRatePct}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── CARD 4: Financial Summary ────────────────────────────────────── */}
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

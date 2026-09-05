"use client";

import React from "react";
import Link from "next/link";
import {
  TrendingUp,
  DollarSign,
  PackageCheck,
  ClipboardList,
  AlertTriangle,
  Lock,
  Warehouse,
  Receipt,
  ArrowRight,
  Sparkles,
  Layers,
  ArrowUpRight,
} from "lucide-react";
import type { DashboardKpiData } from "./types";

interface KpiGridProps {
  data: DashboardKpiData;
  onFilterStockHealth?: (filter: "all" | "low_stock" | "held") => void;
  activeStockFilter?: "all" | "low_stock" | "held";
}

export function KpiGrid({
  data,
  onFilterStockHealth,
  activeStockFilter = "all",
}: KpiGridProps) {
  const { valuation, floorQueues, stockHealth, financialSummary } = data;

  return (
    <div className="mb-6 space-y-4">
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 📱 MOBILE FLOOR EXECUTION (< 1024px)                                */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="block lg:hidden space-y-3.5">
        {/* Top Action Hero: Oversized Floor Queue Cards (Glove-Friendly) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Active Pick Lists to Execute */}
          <div className="relative overflow-hidden rounded-2xl border-2 border-blue-500/80 bg-gradient-to-br from-blue-50 via-white to-blue-50/30 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-2.5 py-0.5 font-label text-[11px] font-black uppercase tracking-wider text-white">
                <ClipboardList size={13} />
                Floor Outbound
              </span>
              <span className="font-mono text-xs font-bold text-blue-900 bg-blue-100 px-2 py-0.5 rounded-md">
                HIGH PRIORITY
              </span>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <div>
                <p className="font-mono text-3xl font-black text-brand-navy tracking-tight">
                  {floorQueues.activePickLists}
                </p>
                <p className="font-label text-xs font-bold text-slate-600">
                  Dispatched Pick Lists Active
                </p>
              </div>
            </div>
            <Link
              href="/outgoing"
              className="mt-3.5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 font-heading text-sm font-bold text-white shadow-md active:scale-[0.98] transition-transform"
            >
              <span>Start Pick Run</span>
              <ArrowRight size={17} />
            </Link>
          </div>

          {/* Pending Receiving WRRs */}
          <div className="relative overflow-hidden rounded-2xl border-2 border-amber-400/80 bg-gradient-to-br from-amber-50 via-white to-amber-50/30 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-600 px-2.5 py-0.5 font-label text-[11px] font-black uppercase tracking-wider text-white">
                <PackageCheck size={13} />
                Floor Inbound
              </span>
              <span className="font-mono text-xs font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded-md">
                12 WRRs READY
              </span>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <div>
                <p className="font-mono text-3xl font-black text-amber-950 tracking-tight">
                  {floorQueues.pendingReceivingWrrs}
                </p>
                <p className="font-label text-xs font-bold text-slate-600">
                  Inbound WRRs Pending Receipt
                </p>
              </div>
            </div>
            <Link
              href="/receiving"
              className="mt-3.5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-700 px-4 font-heading text-sm font-bold text-white shadow-md active:scale-[0.98] transition-transform"
            >
              <span>Receive WRR Intake</span>
              <ArrowRight size={17} />
            </Link>
          </div>
        </div>

        {/* Alert Row: High-Contrast Amber (Low Stock) & Rose (Held Lots) Touch Cards */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => onFilterStockHealth?.(activeStockFilter === "low_stock" ? "all" : "low_stock")}
            className={`flex min-h-[52px] items-center justify-between rounded-xl border p-3 text-left transition-all active:scale-[0.98] ${
              activeStockFilter === "low_stock"
                ? "border-amber-500 bg-amber-100/80 ring-2 ring-amber-400"
                : "border-amber-200 bg-amber-50/80 hover:bg-amber-100/60"
            }`}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-amber-600 shrink-0" />
              <div>
                <p className="font-label text-[11px] font-black uppercase text-amber-950">
                  Low Stock
                </p>
                <p className="font-mono text-xs font-extrabold text-amber-800">
                  5 SKUs
                </p>
              </div>
            </div>
            <span className="font-mono text-[11px] font-bold text-amber-900 bg-amber-200/80 px-1.5 py-0.5 rounded">
              DEFICIT
            </span>
          </button>

          <button
            type="button"
            onClick={() => onFilterStockHealth?.(activeStockFilter === "held" ? "all" : "held")}
            className={`flex min-h-[52px] items-center justify-between rounded-xl border p-3 text-left transition-all active:scale-[0.98] ${
              activeStockFilter === "held"
                ? "border-rose-500 bg-rose-100/80 ring-2 ring-rose-400"
                : "border-rose-200 bg-rose-50/80 hover:bg-rose-100/60"
            }`}
          >
            <div className="flex items-center gap-2">
              <Lock size={18} className="text-rose-600 shrink-0" />
              <div>
                <p className="font-label text-[11px] font-black uppercase text-rose-950">
                  Quarantine
                </p>
                <p className="font-mono text-xs font-extrabold text-rose-800">
                  2 Lots
                </p>
              </div>
            </div>
            <span className="font-mono text-[11px] font-bold text-rose-900 bg-rose-200/80 px-1.5 py-0.5 rounded">
              HELD
            </span>
          </button>
        </div>

        {/* Valuation & Capacity: Horizontal Swipe Carousel */}
        <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 scrollbar-none">
          {/* Card 1: Valuation */}
          <div className="min-w-[260px] flex-1 snap-start rounded-2xl border border-black/5 bg-white/90 p-4 shadow-sm backdrop-blur-md">
            <p className="font-label text-[11px] font-bold uppercase tracking-wider text-text-grey">
              Total Stock Valuation
            </p>
            <div className="mt-1 flex items-baseline justify-between">
              <p className="font-mono text-2xl font-black text-brand-navy">
                ${valuation.total.toLocaleString()}
              </p>
              <span className="font-mono text-xs font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                +{valuation.trendPct}% MTD
              </span>
            </div>
            <div className="mt-2.5 flex items-center gap-2 pt-2 border-t border-slate-100">
              <span className="text-[11px] font-bold text-slate-700">
                VMI: ${(valuation.vmiAmount / 1000000).toFixed(1)}M
              </span>
              <span className="text-slate-300">|</span>
              <span className="text-[11px] font-bold text-blue-700">
                Trading: ${(valuation.tradingAmount / 1000).toFixed(0)}K
              </span>
            </div>
          </div>

          {/* Card 2: Warehouse Capacity */}
          <div className="min-w-[260px] flex-1 snap-start rounded-2xl border border-black/5 bg-white/90 p-4 shadow-sm backdrop-blur-md">
            <p className="font-label text-[11px] font-bold uppercase tracking-wider text-text-grey">
              Capacity Utilization
            </p>
            <div className="mt-1 flex items-baseline justify-between">
              <p className="font-mono text-2xl font-black text-slate-900">
                38% Full
              </p>
              <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                Zone A Primary
              </span>
            </div>
            <div className="mt-2.5 w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div className="bg-brand-navy h-2 rounded-full" style={{ width: "38%" }}></div>
            </div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 🖥️ DESKTOP BENTO ROW (>= 1024px)                                    */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="hidden lg:grid grid-cols-4 gap-4">
        {/* ── CARD 1: Total Inventory Valuation ────────────────────────────── */}
        <div className="relative overflow-hidden rounded-2xl border border-black/5 bg-white/80 dark:bg-zinc-900/80 p-5 shadow-sm backdrop-blur-md transition-all hover:shadow-md">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-label text-[11px] font-bold uppercase tracking-wider text-text-grey">
                Total Inventory Valuation
              </p>
              <div className="mt-1.5 flex items-baseline gap-2">
                <h2 className="font-mono text-2xl font-black text-brand-navy tracking-tight">
                  ${valuation.total.toLocaleString()}
                </h2>
                <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 font-mono text-xs font-bold text-emerald-700 border border-emerald-200/60">
                  <TrendingUp size={12} />
                  +{valuation.trendPct}%
                </span>
              </div>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-brand-navy border border-blue-200/80 shrink-0">
              <DollarSign size={20} />
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

        {/* ── CARD 2: Open Floor Execution & Queue ──────────────────────────── */}
        <div className="relative overflow-hidden rounded-2xl border-2 border-blue-400/80 bg-gradient-to-b from-blue-50/50 via-white to-white p-5 shadow-sm transition-all hover:shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <p className="font-label text-[11px] font-black uppercase tracking-wider text-blue-950">
                Floor Execution Queue
              </p>
              <span className="inline-flex items-center rounded-full bg-blue-600 px-2 py-0.5 font-mono text-[10px] font-black text-white">
                LIVE
              </span>
            </div>

            <div className="mt-3 space-y-2">
              <Link
                href="/receiving"
                className="group flex items-center justify-between rounded-xl bg-amber-50 hover:bg-amber-100/70 px-3 py-2 text-xs font-semibold text-amber-950 transition-colors border border-amber-200/60"
              >
                <div className="flex items-center gap-2">
                  <PackageCheck size={14} className="text-amber-700 group-hover:scale-110 transition-transform" />
                  <span>Pending WRRs</span>
                </div>
                <span className="font-mono font-black text-xs text-white bg-amber-600 px-2 py-0.5 rounded shadow-xs">
                  {floorQueues.pendingReceivingWrrs}
                </span>
              </Link>

              <Link
                href="/outgoing"
                className="group flex items-center justify-between rounded-xl bg-blue-50 hover:bg-blue-100/70 px-3 py-2 text-xs font-semibold text-blue-950 transition-colors border border-blue-200/60"
              >
                <div className="flex items-center gap-2">
                  <ClipboardList size={14} className="text-blue-700 group-hover:scale-110 transition-transform" />
                  <span>Active Pick Lists</span>
                </div>
                <span className="font-mono font-black text-xs text-white bg-blue-600 px-2 py-0.5 rounded shadow-xs">
                  {floorQueues.activePickLists}
                </span>
              </Link>
            </div>
          </div>
        </div>

        {/* ── CARD 3: Inventory Reorder & Risk Summary ──────────────────────── */}
        <div className="relative overflow-hidden rounded-2xl border border-black/5 bg-white/80 dark:bg-zinc-900/80 p-5 shadow-sm backdrop-blur-md transition-all hover:shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <p className="font-label text-[11px] font-bold uppercase tracking-wider text-text-grey">
                Inventory Health &amp; Risk
              </p>
              <span className="font-mono text-[11px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded">
                ATTENTION
              </span>
            </div>

            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between rounded-xl bg-amber-50/70 px-3 py-2 text-xs font-semibold text-amber-950 border border-amber-200/60">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-amber-600" />
                  <span>Stock Alerts</span>
                </div>
                <span className="font-mono text-xs font-black text-amber-900">
                  {stockHealth.lowStockCount} below safety
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-rose-50/70 px-3 py-2 text-xs font-semibold text-rose-950 border border-rose-200/60">
                <div className="flex items-center gap-2">
                  <Lock size={14} className="text-rose-600" />
                  <span>Quarantined</span>
                </div>
                <span className="font-mono text-xs font-black text-rose-900">
                  {stockHealth.heldLotsCount} lots held
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── CARD 4: Settlement & Billing Summary ─────────────────────────── */}
        <div className="relative overflow-hidden rounded-2xl border border-black/5 bg-white/80 dark:bg-zinc-900/80 p-5 shadow-sm backdrop-blur-md transition-all hover:shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <p className="font-label text-[11px] font-bold uppercase tracking-wider text-text-grey">
                Settlement &amp; Billing
              </p>
              <span className="font-mono text-[11px] font-bold text-brand-navy">
                MTD
              </span>
            </div>

            <div className="mt-2 space-y-1.5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                <span className="text-[11px] text-slate-600">VMI Storage Rate</span>
                <span className="font-mono text-xs font-bold text-slate-900">
                  ${financialSummary.vmiDailyCbmRate.toFixed(2)}/m³/day
                </span>
              </div>

              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                <span className="text-[11px] text-slate-600">Realized Margin</span>
                <span className="font-mono text-xs font-bold text-brand-navy">
                  {financialSummary.tradingMarginPct}% <span className="text-[10px] text-text-grey font-normal">(Target 20%)</span>
                </span>
              </div>

              <div className="flex items-center justify-between pt-0.5">
                <span className="text-[11px] text-slate-600">Unbilled Receivables</span>
                <span className="font-mono text-xs font-bold text-emerald-700">
                  ${financialSummary.pendingBillingAmount.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


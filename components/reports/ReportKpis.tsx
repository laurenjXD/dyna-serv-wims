"use client";

import React from "react";
import Link from "next/link";
import {
  DollarSign,
  TrendingUp,
  PackageCheck,
  ClipboardList,
  AlertTriangle,
  Lock,
  Warehouse,
  Receipt,
  ArrowUpRight,
  ShieldCheck,
  Clock,
  Archive,
  Layers,
} from "lucide-react";

export function ReportKpis() {
  return (
    <div className="space-y-4">
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 📱 MOBILE 2x2 EXECUTIVE SETTLEMENT GRID (< 1024px)                  */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2.5 lg:hidden">
        {/* Card 1: Unbilled VMI Storage */}
        <div className="rounded-2xl border border-black/5 dark:border-white/10 bg-white/80 dark:bg-zinc-900/80 p-3.5 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="font-label text-[10px] font-bold uppercase tracking-wider text-text-grey">
              Unbilled Storage
            </span>
            <Receipt size={14} className="text-emerald-600" />
          </div>
          <p className="mt-1.5 font-mono text-xl font-black text-emerald-800">
            $34,200
          </p>
          <span className="mt-1 inline-block font-mono text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
            7 invoices ready
          </span>
        </div>

        {/* Card 2: Trading Realized Margin */}
        <div className="rounded-2xl border border-black/5 dark:border-white/10 bg-white/80 dark:bg-zinc-900/80 p-3.5 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="font-label text-[10px] font-bold uppercase tracking-wider text-text-grey">
              Realized Margin
            </span>
            <TrendingUp size={14} className="text-brand-navy" />
          </div>
          <p className="mt-1.5 font-mono text-xl font-black text-brand-navy">
            18.4%
          </p>
          <span className="mt-1 inline-block font-mono text-[10px] font-bold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
            Target: 20.0%
          </span>
        </div>

        {/* Card 3: Total Consignor Occupancy */}
        <div className="rounded-2xl border border-black/5 dark:border-white/10 bg-white/80 dark:bg-zinc-900/80 p-3.5 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="font-label text-[10px] font-bold uppercase tracking-wider text-text-grey">
              Consignor Space
            </span>
            <Warehouse size={14} className="text-blue-600" />
          </div>
          <p className="mt-1.5 font-mono text-xl font-black text-slate-900">
            795 m³
          </p>
          <span className="mt-1 inline-block font-mono text-[10px] font-bold text-blue-800 bg-blue-50 px-1.5 py-0.5 rounded">
            Across 3 Clients
          </span>
        </div>

        {/* Card 4: Reports Archive */}
        <div className="rounded-2xl border border-black/5 dark:border-white/10 bg-white/80 dark:bg-zinc-900/80 p-3.5 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="font-label text-[10px] font-bold uppercase tracking-wider text-text-grey">
              Report Archive
            </span>
            <Archive size={14} className="text-purple-600" />
          </div>
          <p className="mt-1.5 font-mono text-xl font-black text-slate-900">
            142 files
          </p>
          <span className="mt-1 inline-block font-mono text-[10px] font-bold text-purple-800 bg-purple-50 px-1.5 py-0.5 rounded">
            1.2 GB stored
          </span>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 🖥️ DESKTOP BENTO ROW (>= 1024px)                                    */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="hidden lg:grid grid-cols-4 gap-4">
        {/* ── CARD 1: Total Inventory Valuation Report Summary ──────────────── */}
        <div className="relative overflow-hidden rounded-2xl border border-black/5 dark:border-white/10 bg-white/80 dark:bg-zinc-900/80 p-5 shadow-sm backdrop-blur-md transition-all hover:shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-label text-[11px] font-bold uppercase tracking-wider text-text-grey">
                  Total Inventory Valuation
                </p>
                <div className="mt-1.5 flex items-baseline gap-2">
                  <h2 className="font-mono text-2xl sm:text-3xl font-black text-brand-navy tracking-tight">
                    $2,480,500
                  </h2>
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 font-mono text-xs font-bold text-emerald-700 border border-emerald-200/60">
                    <TrendingUp size={12} />
                    +4.2% MTD
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
                VMI Consignment: $1.6M
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1 font-mono text-xs font-bold text-blue-900 border border-blue-200/60">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500"></span>
                Owned Trading: $880K
              </span>
            </div>
          </div>
        </div>

        {/* ── CARD 2: Floor Execution & Queue Summary ───────────────────────── */}
        <div className="relative overflow-hidden rounded-2xl border border-black/5 dark:border-white/10 bg-white/80 dark:bg-zinc-900/80 p-5 shadow-sm backdrop-blur-md transition-all hover:shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <p className="font-label text-[11px] font-bold uppercase tracking-wider text-text-grey">
                Floor Execution &amp; Queues
              </p>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-700">
                20 Total Tasks
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {/* Inbound WRRs */}
              <Link
                href="/receiving"
                className="group flex items-center justify-between rounded-xl bg-slate-50/90 hover:bg-blue-50/80 px-3 py-2 text-xs font-medium text-slate-800 hover:text-brand-navy transition-colors border border-slate-200/60"
              >
                <div className="flex items-center gap-2">
                  <PackageCheck size={15} className="text-blue-600 group-hover:scale-110 transition-transform shrink-0" />
                  <span>Pending Inbound WRRs</span>
                </div>
                <span className="font-mono font-bold text-brand-navy bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-2xs">
                  12 pending receipt
                </span>
              </Link>

              {/* Active Pick Run Sheets */}
              <Link
                href="/outgoing"
                className="group flex items-center justify-between rounded-xl bg-slate-50/90 hover:bg-blue-50/80 px-3 py-2 text-xs font-medium text-slate-800 hover:text-brand-navy transition-colors border border-slate-200/60"
              >
                <div className="flex items-center gap-2">
                  <ClipboardList size={15} className="text-indigo-600 group-hover:scale-110 transition-transform shrink-0" />
                  <span>Active Pick Run Sheets</span>
                </div>
                <span className="font-mono font-bold text-indigo-900 bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-2xs">
                  8 dispatched lists
                </span>
              </Link>
            </div>
          </div>
        </div>

        {/* ── CARD 3: Inventory Reorder & Risk Summary ──────────────────────── */}
        <div className="relative overflow-hidden rounded-2xl border border-black/5 dark:border-white/10 bg-white/80 dark:bg-zinc-900/80 p-5 shadow-sm backdrop-blur-md transition-all hover:shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <p className="font-label text-[11px] font-bold uppercase tracking-wider text-text-grey">
                Inventory Reorder &amp; Risk
              </p>
              <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                <AlertTriangle size={11} />
                7 Flagged Items
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {/* Low Stock Safety Threshold */}
              <Link
                href="/inventory"
                className="group flex items-center justify-between rounded-xl bg-amber-50/80 border border-amber-200/70 px-3 py-2 text-xs hover:bg-amber-100/90 transition-colors"
              >
                <div className="flex items-center gap-2 text-amber-950 font-medium">
                  <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                  <span>Stock Below Safety Level</span>
                </div>
                <span className="font-mono font-bold text-amber-900 bg-white px-2 py-0.5 rounded-md border border-amber-200 shadow-2xs">
                  5 SKUs
                </span>
              </Link>

              {/* Quarantined Lots */}
              <div className="flex items-center justify-between rounded-xl bg-rose-50/80 border border-rose-200/70 px-3 py-2 text-xs">
                <div className="flex items-center gap-2 text-rose-950 font-medium">
                  <Lock size={14} className="text-rose-600 shrink-0" />
                  <span>Quarantined / Held Lots</span>
                </div>
                <span className="font-mono font-bold text-rose-900 bg-white px-2 py-0.5 rounded-md border border-rose-200 shadow-2xs">
                  2 lots held
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── CARD 4: Settlement & Billing Summary ──────────────────────────── */}
        <div className="relative overflow-hidden rounded-2xl border border-black/5 dark:border-white/10 bg-white/80 dark:bg-zinc-900/80 p-5 shadow-sm backdrop-blur-md transition-all hover:shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <p className="font-label text-[11px] font-bold uppercase tracking-wider text-text-grey">
                Settlement &amp; Billing Summary
              </p>
              <span className="font-mono text-[11px] font-bold text-brand-navy bg-slate-100 px-2 py-0.5 rounded-full">
                MTD Position
              </span>
            </div>

            <div className="mt-3 space-y-2.5">
              {/* VMI Storage Base Rate */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                <div className="flex items-center gap-1.5 text-xs text-slate-700">
                  <Warehouse size={13} className="text-slate-400 shrink-0" />
                  <span>VMI Storage Base Rate</span>
                </div>
                <div className="text-right">
                  <span className="font-mono text-xs font-bold text-slate-900">
                    $0.48 / m³ / day
                  </span>
                  <span className="block text-[10px] text-text-grey">
                    Across 3 active consignors
                  </span>
                </div>
              </div>

              {/* Trading Realized Margin */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                <span className="text-xs text-slate-700">Trading Margin (MTD)</span>
                <div className="text-right">
                  <span className="font-mono text-xs font-bold text-brand-navy">
                    18.4%
                  </span>
                  <span className="block text-[10px] text-text-grey">
                    Target: 20.0% SLA
                  </span>
                </div>
              </div>

              {/* Unbilled Receivables */}
              <div className="flex items-center justify-between pt-0.5">
                <div className="flex items-center gap-1.5 text-xs text-slate-700">
                  <Receipt size={13} className="text-slate-400 shrink-0" />
                  <span>Unbilled Receivables</span>
                </div>
                <div className="text-right">
                  <span className="font-mono text-xs font-bold text-emerald-700">
                    $34,200
                  </span>
                  <span className="block text-[10px] text-text-grey">
                    7 invoices ready to issue
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


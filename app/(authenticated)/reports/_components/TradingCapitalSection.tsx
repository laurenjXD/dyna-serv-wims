"use client";

import React, { useState } from "react";
import { TrendingUp, PackageX, DollarSign, Activity } from "lucide-react";
import { WaterfallChart, type WaterfallDatum } from "@/components/analytics/WaterfallChart";
import { ScatterPlot, type ScatterPlotDatum } from "@/components/analytics/ScatterPlot";
import type { GmroiSummary, AgingInventoryBucketRow } from "@/lib/analytics/queries/trading";

export type TradingCapitalSectionProps = {
  gmroi: GmroiSummary;
  agingRows: AgingInventoryBucketRow[];
  starsAndDogs: ScatterPlotDatum[];
};

export function TradingCapitalSection({
  gmroi,
  agingRows,
  starsAndDogs,
}: TradingCapitalSectionProps) {
  const [agingFilter, setAgingFilter] = useState<"all" | "90plus">("all");

  const sampleWaterfallData: WaterfallDatum[] = [
    { label: "Purchase Price", value: 12500, type: "base" },
    { label: "Freight & Customs", value: 1800, type: "addition" },
    { label: "Inbound Handling", value: 650, type: "addition" },
    { label: "Storage Accrual", value: 950, type: "addition" },
    { label: "Total Landed Cost", value: 0, type: "total" },
  ];

  const filteredAging = agingFilter === "90plus"
    ? agingRows.filter((r) => r.qty90PlusDays > 0)
    : agingRows;

  return (
    <div className="space-y-6">
      {/* ── KPI Strip: GMROI & Capital Velocity ─────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
          <div className="flex items-center justify-between">
            <span className="font-label text-xs font-semibold uppercase tracking-wider text-text-grey">
              GMROI Score
            </span>
            <div className="rounded-md bg-emerald-50 p-2 text-status-available">
              <TrendingUp size={20} />
            </div>
          </div>
          <p className="mt-2 font-heading text-2xl font-bold text-on-surface">
            {gmroi.gmroiScore}x
          </p>
          <p className="mt-1 font-body text-xs text-text-grey">
            ₱{gmroi.grossMarginTotal.toLocaleString()} margin on ₱{gmroi.averageInventoryValue.toLocaleString()} avg stock
          </p>
        </div>

        <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
          <div className="flex items-center justify-between">
            <span className="font-label text-xs font-semibold uppercase tracking-wider text-text-grey">
              Inventory Turnover
            </span>
            <div className="rounded-md bg-blue-50 p-2 text-brand-royal-blue">
              <Activity size={20} />
            </div>
          </div>
          <p className="mt-2 font-heading text-2xl font-bold text-on-surface">
            {gmroi.inventoryTurnoverRatio} turns/yr
          </p>
          <p className="mt-1 font-body text-xs text-text-grey">
            Avg replenishment cycle: ~{Math.round(365 / (gmroi.inventoryTurnoverRatio || 1))} days
          </p>
        </div>

        <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
          <div className="flex items-center justify-between">
            <span className="font-label text-xs font-semibold uppercase tracking-wider text-text-grey">
              Owned Stock Value
            </span>
            <div className="rounded-md bg-slate-100 p-2 text-brand-navy">
              <DollarSign size={20} />
            </div>
          </div>
          <p className="mt-2 font-heading text-2xl font-bold text-on-surface font-mono">
            ₱{gmroi.averageInventoryValue.toLocaleString()}
          </p>
          <p className="mt-1 font-body text-xs text-text-grey">
            Trading capital currently deployed in warehouse
          </p>
        </div>

        <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
          <div className="flex items-center justify-between">
            <span className="font-label text-xs font-semibold uppercase tracking-wider text-text-grey">
              Dead Stock Exposure
            </span>
            <div className="rounded-md bg-rose-50 p-2 text-status-held">
              <PackageX size={20} />
            </div>
          </div>
          <p className="mt-2 font-heading text-2xl font-bold text-status-held font-mono">
            ₱{agingRows.reduce((acc, r) => acc + (r.qty90PlusDays > 0 ? (r.totalValue * (r.qty90PlusDays / (r.totalQty || 1))) : 0), 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
          <p className="mt-1 font-body text-xs text-text-grey">
            Capital tied in 90+ day stagnant items
          </p>
        </div>
      </div>

      {/* ── Visualizations: Landed Cost Waterfall & Stars and Dogs Plot ───────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <WaterfallChart
          title="Landed Cost Waterfall (Trading Item Benchmark)"
          yAxisLabel="Cost (₱)"
          data={sampleWaterfallData}
        />
        <ScatterPlot
          title="Product Velocity Matrix: Stars & Dogs"
          data={starsAndDogs}
          medianX={5}
          medianY={25}
        />
      </div>

      {/* ── Dead Stock & Aging Inventory Table ───────────────────────────────── */}
      <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-heading text-headline-md font-semibold text-on-surface">
              Dead Stock & Aging Inventory Report
            </h3>
            <p className="font-body text-xs text-text-grey">
              Owned inventory aging brackets based on confirmed receiving date.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAgingFilter("all")}
              className={`rounded-lg px-3 py-1.5 font-label text-xs font-medium transition-colors ${
                agingFilter === "all"
                  ? "bg-brand-navy text-white"
                  : "bg-slate-100 text-text-grey hover:bg-slate-200"
              }`}
            >
              All Aging Stock
            </button>
            <button
              type="button"
              onClick={() => setAgingFilter("90plus")}
              className={`rounded-lg px-3 py-1.5 font-label text-xs font-medium transition-colors ${
                agingFilter === "90plus"
                  ? "bg-rose-600 text-white"
                  : "bg-slate-100 text-text-grey hover:bg-slate-200"
              }`}
            >
              Critical (90+ Days Only)
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-[#F4F6FB] font-heading text-xs font-bold uppercase tracking-wider text-slate-700">
                <th className="px-4 py-3">Item Code & Name</th>
                <th className="px-4 py-3 text-right">0–30 Days</th>
                <th className="px-4 py-3 text-right">31–60 Days</th>
                <th className="px-4 py-3 text-right text-rose-600">90+ Days (Dead)</th>
                <th className="px-4 py-3 text-right">Total Qty</th>
                <th className="px-4 py-3 text-right">Tied Value (₱)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-body text-sm">
              {filteredAging.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-text-grey italic">
                    No stagnant inventory detected in this bracket.
                  </td>
                </tr>
              ) : (
                filteredAging.map((row) => (
                  <tr key={row.itemId} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-mono text-sm font-bold text-on-surface">{row.itemCode}</p>
                      <p className="text-xs text-text-grey font-medium">{row.itemName}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-text-grey">
                      {row.qty30Days.toLocaleString()}{" "}
                      <span className="text-xs font-normal">{row.uom}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-amber-700">
                      {row.qty60Days.toLocaleString()}{" "}
                      <span className="text-xs font-normal">{row.uom}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm font-bold text-status-held">
                      {row.qty90PlusDays.toLocaleString()}{" "}
                      <span className="text-xs font-normal">{row.uom}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-on-surface">
                      {row.totalQty.toLocaleString()}{" "}
                      <span className="text-xs font-normal">{row.uom}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm font-bold text-brand-navy">
                      ₱{row.totalValue.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

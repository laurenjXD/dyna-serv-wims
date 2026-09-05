"use client";

import React, { useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Percent,
  Layers,
  ShieldCheck,
  ArrowUpRight,
  ChevronRight,
  X,
  PieChart,
} from "lucide-react";
import type { TradingMarginRow, TradingCategoryPerformance } from "./types";
import { TRADING_MARGIN_SEED, TRADING_CATEGORY_SEED } from "./data/reportsSeedData";
import { TablePagination } from "@/components/ui/TablePagination";

export function TradingMarginSection() {
  const marginData: TradingMarginRow[] = TRADING_MARGIN_SEED;
  const categoryData: TradingCategoryPerformance[] = TRADING_CATEGORY_SEED;

  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [categoryPageIndex, setCategoryPageIndex] = useState(0);
  const [categoryPageSize, setCategoryPageSize] = useState(5);

  const totalCategoryCount = categoryData.length;
  const categoryPageCount = Math.ceil(totalCategoryCount / categoryPageSize) || 1;
  const pagedCategoryData = categoryData.slice(
    categoryPageIndex * categoryPageSize,
    (categoryPageIndex + 1) * categoryPageSize
  );

  const currentMonthData = marginData[marginData.length - 1];
  const totalRevenue = categoryData.reduce((acc, c) => acc + c.grossRevenue, 0);
  const totalCogs = categoryData.reduce((acc, c) => acc + c.cogs, 0);
  const totalMargin = categoryData.reduce((acc, c) => acc + c.netMargin, 0);
  const avgMarginPct = ((totalMargin / totalRevenue) * 100).toFixed(1);

  return (
    <div className="space-y-6">
      {/* ── Desktop & Mobile Container ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* ── Left Column: Revenue, COGS & Realized Margin % ComposedChart ───── */}
        <div className="xl:col-span-7 rounded-2xl border border-slate-200/80 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-100 dark:border-zinc-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-heading text-title-md font-bold text-brand-navy dark:text-zinc-100 flex items-center gap-2">
                    <DollarSign size={18} className="text-brand-navy dark:text-blue-400" />
                    Trading Margin Realization &amp; COGS
                  </h3>
                  <span className="rounded-full bg-blue-50 dark:bg-blue-950/60 px-2.5 py-0.5 font-mono text-[10px] font-bold text-brand-navy dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                    20.0% SLA TARGET
                  </span>
                </div>
                <p className="mt-0.5 font-body text-xs text-text-grey">
                  Historical monthly gross revenue vs. COGS with realized profit margin curve.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="bg-slate-50 dark:bg-zinc-800/80 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-700">
                  <span className="text-[11px] font-label text-text-grey">MTD Realized: </span>
                  <span className="font-mono font-black text-xs text-brand-navy dark:text-blue-400 ml-1">
                    {currentMonthData.marginPct}%
                  </span>
                </div>
              </div>
            </div>

            {/* Recharts Composed Chart */}
            <div className="mt-4 h-64 sm:h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={marginData}
                  margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis
                    dataKey="period"
                    tick={{ fontSize: 10, fill: "#64748B", fontWeight: 600 }}
                    axisLine={{ stroke: "#CBD5E1" }}
                    tickLine={false}
                  />
                  {/* Left Y-Axis: Currency */}
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 10, fill: "#64748B" }}
                    axisLine={{ stroke: "#CBD5E1" }}
                    tickLine={false}
                    tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
                  />
                  {/* Right Y-Axis: Margin % */}
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={[0, 30]}
                    tick={{ fontSize: 10, fill: "#64748B" }}
                    axisLine={{ stroke: "#CBD5E1" }}
                    tickLine={false}
                    tickFormatter={(val) => `${val}%`}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload || !payload.length) return null;
                      const dataPoint = payload[0].payload as TradingMarginRow;
                      return (
                        <div className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3 shadow-elevation-2 font-body text-xs">
                          <p className="font-bold text-slate-900 dark:text-zinc-100 border-b border-slate-100 dark:border-zinc-800 pb-1 mb-1.5">{label}</p>
                          <div className="space-y-1 font-mono">
                            <p className="text-blue-600 dark:text-blue-400 flex justify-between gap-4">
                              <span>Gross Revenue:</span>
                              <strong>${dataPoint.grossRevenue.toLocaleString()}</strong>
                            </p>
                            <p className="text-slate-600 dark:text-zinc-400 flex justify-between gap-4">
                              <span>COGS:</span>
                              <strong>${dataPoint.cogs.toLocaleString()}</strong>
                            </p>
                            <p className="text-emerald-700 dark:text-emerald-400 flex justify-between gap-4 font-black">
                              <span>Realized Margin:</span>
                              <strong>{dataPoint.marginPct}%</strong>
                            </p>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    wrapperStyle={{ paddingBottom: 10, fontSize: 10, fontWeight: 600 }}
                  />
                  <ReferenceLine
                    yAxisId="right"
                    y={20.0}
                    stroke="#EF4444"
                    strokeDasharray="4 4"
                    label={{ value: "20% Target", fill: "#EF4444", fontSize: 10, position: "top" }}
                  />
                  <Bar yAxisId="left" dataKey="grossRevenue" name="Revenue ($)" fill="#2563EB" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar yAxisId="left" dataKey="cogs" name="COGS ($)" fill="#94A3B8" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Line yAxisId="right" type="monotone" dataKey="marginPct" name="Margin %" stroke="#10B981" strokeWidth={3} dot={{ r: 4, fill: "#10B981" }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Mobile Drawer Trigger Button (Only on Mobile) */}
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-zinc-800 block xl:hidden">
            <button
              type="button"
              onClick={() => setIsMobileDrawerOpen(true)}
              className="w-full flex items-center justify-between min-h-[48px] rounded-xl bg-slate-50 dark:bg-zinc-800/80 px-4 py-3 font-label text-xs font-bold text-brand-navy dark:text-blue-400 border border-slate-200 dark:border-zinc-700 hover:bg-slate-100 active:scale-98 transition-all"
            >
              <div className="flex items-center gap-2">
                <PieChart size={16} />
                <span>View Category Financial Breakdown ({categoryData.length} Lines)</span>
              </div>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* ── Right Column (Desktop): Side-by-Side Product Category Table ────── */}
        <div className="hidden xl:block xl:col-span-5 rounded-2xl border border-slate-200/80 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md shadow-sm overflow-hidden flex flex-col justify-between">
          <div>
            <div className="border-b border-slate-100 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-800/50 p-4 flex justify-between items-center">
              <div>
                <h4 className="font-heading font-bold text-sm text-brand-navy dark:text-zinc-100">
                  Product Category Performance
                </h4>
                <p className="font-body text-xs text-text-grey">
                  Financial contribution &amp; SLA variance
                </p>
              </div>
              <span className="font-mono text-xs font-bold text-brand-navy dark:text-blue-400 bg-white dark:bg-zinc-800 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-zinc-700 shadow-2xs">
                Blended: {avgMarginPct}%
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs font-body">
                <thead>
                  <tr className="border-b border-slate-200/80 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-800/50 font-label text-[10px] font-bold uppercase tracking-wider text-text-grey">
                    <th className="px-3.5 py-2.5">Category</th>
                    <th className="px-3 py-2.5 text-right">Revenue</th>
                    <th className="px-3 py-2.5 text-right">Margin %</th>
                    <th className="px-3.5 py-2.5 text-center">Delta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                  {pagedCategoryData.map((cat) => {
                    const isAboveSla = cat.deltaVsSlaPct >= 0;
                    return (
                      <tr key={cat.category} className="hover:bg-slate-50/80 dark:hover:bg-zinc-800/50 transition-colors">
                        <td className="px-3.5 py-2.5 font-bold text-slate-900 dark:text-zinc-100">
                          <div className="flex items-center gap-1.5">
                            <Layers size={12} className="text-brand-navy/60 dark:text-blue-400/60 shrink-0" />
                            <span className="truncate max-w-[120px]">{cat.category}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900 dark:text-zinc-200">
                          ${(cat.grossRevenue / 1000).toFixed(0)}k
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-black text-brand-navy dark:text-blue-400">
                          {cat.marginPct}%
                        </td>
                        <td className="px-3.5 py-2.5 text-center">
                          <span
                            className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${
                              isAboveSla
                                ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                                : "bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800"
                            }`}
                          >
                            {isAboveSla ? `+${cat.deltaVsSlaPct}%` : `${cat.deltaVsSlaPct}%`}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Category Table Pagination */}
            <TablePagination
              pageIndex={categoryPageIndex}
              pageSize={categoryPageSize}
              totalCount={totalCategoryCount}
              pageCount={categoryPageCount}
              canPreviousPage={categoryPageIndex > 0}
              canNextPage={categoryPageIndex < categoryPageCount - 1}
              onPageChange={(newPageIndex) => setCategoryPageIndex(newPageIndex)}
              onPageSizeChange={(newPageSize) => {
                setCategoryPageSize(newPageSize);
                setCategoryPageIndex(0);
              }}
              pageSizeOptions={[3, 5, 10]}
            />
          </div>

          <div className="p-3 bg-slate-50/50 dark:bg-zinc-800/30 border-t border-slate-100 dark:border-zinc-800 text-[11px] text-text-grey flex justify-between items-center">
            <span>Total Units Sold MTD:</span>
            <span className="font-mono font-bold text-slate-900 dark:text-zinc-100">
              {categoryData.reduce((acc, c) => acc + c.unitsSold, 0).toLocaleString()} Units
            </span>
          </div>
        </div>
      </div>

      {/* ── Mobile Animated Bottom Sheet Drawer for Category Breakdown ──────── */}
      {isMobileDrawerOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-xs xl:hidden animate-in fade-in">
          <div
            className="w-full max-h-[85vh] rounded-t-3xl border-t border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-5 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200"
          >
            {/* Grabber & Header */}
            <div className="mx-auto h-1.5 w-12 rounded-full bg-slate-300 dark:bg-zinc-700 mb-3" />
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-3">
              <div>
                <h3 className="font-heading text-base font-bold text-brand-navy dark:text-zinc-100 flex items-center gap-2">
                  <PieChart size={18} className="text-brand-navy dark:text-blue-400" />
                  Product Category Margin Breakdown
                </h3>
                <p className="font-body text-xs text-text-grey">
                  Financial contribution &amp; SLA compliance ({totalCategoryCount} categories)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileDrawerOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 active:scale-95 transition-all"
                aria-label="Close drawer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content List */}
            <div className="overflow-y-auto py-4 space-y-3">
              {pagedCategoryData.map((cat) => {
                const isAboveSla = cat.deltaVsSlaPct >= 0;
                return (
                  <div
                    key={cat.category}
                    className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-800/50 p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-heading font-bold text-sm text-slate-900 dark:text-zinc-100">
                        {cat.category}
                      </span>
                      <span
                        className={`inline-flex items-center gap-0.5 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold ${
                          isAboveSla
                            ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                            : "bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800"
                        }`}
                      >
                        {isAboveSla ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                        {isAboveSla ? `+${cat.deltaVsSlaPct}% vs 20% SLA` : `${cat.deltaVsSlaPct}% vs 20% SLA`}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 dark:border-zinc-700/60 font-body text-xs">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-text-grey">Gross Sales:</span>
                        <p className="font-mono font-bold text-slate-900 dark:text-zinc-100">${cat.grossRevenue.toLocaleString()}</p>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-text-grey">COGS Cost:</span>
                        <p className="font-mono text-slate-600 dark:text-zinc-400">${cat.cogs.toLocaleString()}</p>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-text-grey">Net Profit:</span>
                        <p className="font-mono font-black text-emerald-700 dark:text-emerald-400">${cat.netMargin.toLocaleString()}</p>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-text-grey">Realized Margin:</span>
                        <p className="font-mono font-black text-brand-navy dark:text-blue-400 text-sm">{cat.marginPct}%</p>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Mobile Drawer Pagination */}
              <TablePagination
                pageIndex={categoryPageIndex}
                pageSize={categoryPageSize}
                totalCount={totalCategoryCount}
                pageCount={categoryPageCount}
                canPreviousPage={categoryPageIndex > 0}
                canNextPage={categoryPageIndex < categoryPageCount - 1}
                onPageChange={(newPageIndex) => setCategoryPageIndex(newPageIndex)}
                onPageSizeChange={(newPageSize) => {
                  setCategoryPageSize(newPageSize);
                  setCategoryPageIndex(0);
                }}
                pageSizeOptions={[3, 5, 10]}
              />
            </div>

            {/* Bottom Action */}
            <div className="pt-3 border-t border-slate-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setIsMobileDrawerOpen(false)}
                className="w-full flex items-center justify-center min-h-[48px] rounded-xl bg-brand-navy text-white font-label text-sm font-bold shadow-md active:scale-98 transition-all"
              >
                Close Breakdown
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

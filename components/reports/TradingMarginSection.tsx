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
  Percent,
  Layers,
  ChevronRight,
  X,
  PieChart,
} from "lucide-react";
import type { TradingMarginRow, TradingCategoryPerformance } from "./types";
import { TablePagination } from "@/components/ui/TablePagination";

interface TradingMarginSectionProps {
  initialData?: {
    marginHistory: TradingMarginRow[];
    categoryBreakdown: TradingCategoryPerformance[];
  };
}

export function TradingMarginSection({ initialData }: TradingMarginSectionProps) {
  const defaultMarginData: TradingMarginRow[] = [
    { period: "Mar 2026", grossRevenue: 420000, cogs: 340200, marginPct: 19.0, targetMarginPct: 20.0 },
    { period: "Apr 2026", grossRevenue: 460000, cogs: 368000, marginPct: 20.0, targetMarginPct: 20.0 },
    { period: "May 2026", grossRevenue: 510000, cogs: 418200, marginPct: 18.0, targetMarginPct: 20.0 },
    { period: "Jun 2026", grossRevenue: 540000, cogs: 432000, marginPct: 20.0, targetMarginPct: 20.0 },
    { period: "Jul 2026", grossRevenue: 590000, cogs: 483800, marginPct: 18.0, targetMarginPct: 20.0 },
    { period: "Aug 2026 (MTD)", grossRevenue: 640000, cogs: 522240, marginPct: 18.4, targetMarginPct: 20.0 },
  ];

  const defaultCategoryData: TradingCategoryPerformance[] = [
    { category: "Bearings & Transmission", unitsSold: 3450, grossRevenue: 245000, cogs: 196000, netMargin: 49000, marginPct: 20.0, deltaVsSlaPct: 0.0 },
    { category: "Automation & PLC Controllers", unitsSold: 820, grossRevenue: 185000, cogs: 144300, netMargin: 40700, marginPct: 22.0, deltaVsSlaPct: 2.0 },
    { category: "Pneumatics & Actuators", unitsSold: 1240, grossRevenue: 98000, cogs: 82320, netMargin: 15680, marginPct: 16.0, deltaVsSlaPct: -4.0 },
    { category: "Electrical Switchgear", unitsSold: 670, grossRevenue: 72000, cogs: 60480, netMargin: 11520, marginPct: 16.0, deltaVsSlaPct: -4.0 },
    { category: "Industrial Fasteners & Hardware", unitsSold: 14200, grossRevenue: 40000, cogs: 31200, netMargin: 8800, marginPct: 22.0, deltaVsSlaPct: 2.0 },
  ];

  const marginData: TradingMarginRow[] = initialData?.marginHistory || defaultMarginData;
  const categoryData: TradingCategoryPerformance[] = initialData?.categoryBreakdown || defaultCategoryData;

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
  const totalMargin = categoryData.reduce((acc, c) => acc + c.netMargin, 0);
  const avgMarginPct = totalRevenue > 0 ? ((totalMargin / totalRevenue) * 100).toFixed(1) : "18.4";

  return (
    <div className="space-y-6">
      {/* ── Desktop & Mobile Container ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* ── Left Column: Revenue, COGS & Realized Margin % ComposedChart ───── */}
        <div className="xl:col-span-7 rounded-2xl border border-slate-200/80 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-100 dark:border-zinc-800 pb-4">
              <div>
                <h3 className="font-heading text-title-md font-bold text-brand-navy dark:text-zinc-100 flex items-center gap-2">
                  <DollarSign size={18} className="text-brand-navy dark:text-blue-400" />
                  Trading Revenue, COGS &amp; Realized Margin
                </h3>
                <p className="mt-0.5 font-body text-xs text-text-grey">
                  Gross revenue vs. cost of goods sold with realized margin % trajectory.
                </p>
              </div>

              {/* Current Month Highlight Pill */}
              <div className="flex items-center gap-2 bg-slate-50 dark:bg-zinc-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-mono">
                <span className="text-text-grey">MTD Realized:</span>
                <span className="font-bold text-brand-navy dark:text-blue-400">
                  {currentMonthData?.marginPct}%
                </span>
                <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                  Target: 20%
                </span>
              </div>
            </div>

            {/* Chart Area */}
            <div className="mt-4 h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={marginData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis
                    dataKey="period"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#64748B", fontSize: 11, fontWeight: 600 }}
                  />
                  <YAxis
                    yAxisId="left"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#64748B", fontSize: 10, fontFamily: "monospace" }}
                    tickFormatter={(v) => `$${v / 1000}k`}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={[10, 30]}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#002060", fontSize: 10, fontFamily: "monospace" }}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-elevation-2 font-body text-xs">
                            <p className="font-bold text-brand-navy mb-1.5 border-b border-slate-100 pb-1">
                              {label} Financial Realization
                            </p>
                            <div className="space-y-1">
                              <div className="flex justify-between gap-4">
                                <span className="text-slate-600">Gross Revenue:</span>
                                <span className="font-mono font-bold text-slate-900">
                                  ${Number(payload[0]?.value).toLocaleString()}
                                </span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-slate-600">COGS:</span>
                                <span className="font-mono font-bold text-slate-700">
                                  ${Number(payload[1]?.value).toLocaleString()}
                                </span>
                              </div>
                              <div className="flex justify-between gap-4 pt-1 border-t border-slate-100">
                                <span className="text-brand-navy font-bold">Realized Margin:</span>
                                <span className="font-mono font-black text-brand-navy">
                                  {payload[2]?.value}%
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                    iconType="circle"
                  />
                  <ReferenceLine
                    yAxisId="right"
                    y={20}
                    stroke="#F59E0B"
                    strokeDasharray="4 4"
                    label={{ value: "20% Target Margin", fill: "#D97706", fontSize: 10, position: "insideTopRight" }}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="grossRevenue"
                    name="Gross Revenue"
                    fill="#002060"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="cogs"
                    name="COGS"
                    fill="#94A3B8"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="marginPct"
                    name="Realized Margin %"
                    stroke="#2563EB"
                    strokeWidth={3}
                    dot={{ fill: "#2563EB", r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Quick Summary Strip */}
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-zinc-800 flex flex-wrap items-center justify-between text-xs font-label">
            <div className="flex items-center gap-4">
              <span className="text-text-grey">Avg 6-Mo Margin: <strong className="text-slate-900 font-mono">{avgMarginPct}%</strong></span>
              <span className="text-text-grey">Target SLA: <strong className="text-emerald-700 font-mono">20.0%</strong></span>
            </div>
            <button
              type="button"
              onClick={() => setIsMobileDrawerOpen(true)}
              className="xl:hidden inline-flex items-center gap-1 font-bold text-brand-navy hover:underline text-xs"
            >
              <PieChart size={13} />
              <span>Category Breakdown ({categoryData.length})</span>
            </button>
          </div>
        </div>

        {/* ── Right Column: Trading Product Line Margin Breakdown Table ──────── */}
        <div className="xl:col-span-5 rounded-2xl border border-slate-200/80 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-zinc-800 pb-3">
              <div>
                <h3 className="font-heading text-title-md font-bold text-brand-navy dark:text-zinc-100 flex items-center gap-2">
                  <Layers size={17} className="text-brand-navy dark:text-blue-400" />
                  Product Line Margin Realization
                </h3>
                <p className="mt-0.5 font-body text-xs text-text-grey">
                  MTD Category volume &amp; realized margin %
                </p>
              </div>
            </div>

            {/* Desktop / Large Table */}
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 font-label text-[10px] font-bold uppercase tracking-wider text-text-grey">
                    <th className="px-2.5 py-2">Category</th>
                    <th className="px-2.5 py-2 text-right">Revenue</th>
                    <th className="px-2.5 py-2 text-right">Margin %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-body text-xs">
                  {pagedCategoryData.map((cat) => (
                    <tr key={cat.category} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-2.5 py-2.5">
                        <span className="font-bold text-slate-900 block truncate max-w-[140px] text-[11px]" title={cat.category}>
                          {cat.category}
                        </span>
                        <span className="font-mono text-[10px] text-text-grey">{cat.unitsSold.toLocaleString()} units sold</span>
                      </td>
                      <td className="px-2.5 py-2.5 font-mono text-right text-slate-800 text-xs">
                        ${cat.grossRevenue.toLocaleString()}
                      </td>
                      <td className="px-2.5 py-2.5 text-right font-mono font-bold text-xs">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${
                            cat.marginPct >= 20
                              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                              : "bg-amber-50 text-amber-800 border border-amber-200"
                          }`}
                        >
                          {cat.marginPct}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <TablePagination
            currentPage={categoryPageIndex + 1}
            totalPages={categoryPageCount}
            pageSize={categoryPageSize}
            totalItems={totalCategoryCount}
            onPageChange={(page) => setCategoryPageIndex(page - 1)}
            onPageSizeChange={(newSize) => {
              setCategoryPageSize(newSize);
              setCategoryPageIndex(0);
            }}
            pageSizeOptions={[5, 10]}
            className="border-t border-slate-100 pt-2"
          />
        </div>
      </div>
    </div>
  );
}

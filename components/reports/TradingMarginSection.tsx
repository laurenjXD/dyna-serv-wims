"use client";

import React from "react";
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
} from "lucide-react";
import type { TradingMarginRow, TradingCategoryPerformance } from "./types";
import { TRADING_MARGIN_SEED, TRADING_CATEGORY_SEED } from "./data/reportsSeedData";

export function TradingMarginSection() {
  const marginData: TradingMarginRow[] = TRADING_MARGIN_SEED;
  const categoryData: TradingCategoryPerformance[] = TRADING_CATEGORY_SEED;

  const currentMonthData = marginData[marginData.length - 1];
  const totalRevenue = categoryData.reduce((acc, c) => acc + c.grossRevenue, 0);
  const totalCogs = categoryData.reduce((acc, c) => acc + c.cogs, 0);
  const totalMargin = categoryData.reduce((acc, c) => acc + c.netMargin, 0);
  const avgMarginPct = ((totalMargin / totalRevenue) * 100).toFixed(1);

  return (
    <div className="space-y-6">
      {/* ── 1. Composed Chart: Revenue, COGS & Realized Margin % ─────────── */}
      <div className="rounded-2xl border border-slate-200/80 bg-surface-white p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-heading text-title-md font-bold text-brand-navy flex items-center gap-2">
                <DollarSign size={18} className="text-brand-navy" />
                Trading Revenue, COGS &amp; Margin Realization
              </h3>
              <span className="rounded-full bg-blue-50 px-2.5 py-0.5 font-mono text-[10px] font-bold text-brand-navy border border-blue-200">
                20.0% SLA TARGET
              </span>
            </div>
            <p className="mt-0.5 font-body text-xs text-text-grey">
              Historical monthly gross sales vs. acquisition costs with realized profit margin percentage.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
              <span className="text-[11px] font-label text-text-grey">MTD Realized Margin: </span>
              <span className="font-mono font-black text-xs text-brand-navy ml-1">
                {currentMonthData.marginPct}%
              </span>
            </div>
          </div>
        </div>

        {/* Recharts Composed Chart */}
        <div className="mt-4 h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={marginData}
              margin={{ top: 10, right: 20, left: 10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis
                dataKey="period"
                tick={{ fontSize: 11, fill: "#64748B", fontWeight: 600 }}
                axisLine={{ stroke: "#CBD5E1" }}
                tickLine={false}
              />
              {/* Left Y-Axis: Currency */}
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11, fill: "#64748B", fontFamily: "var(--font-glacial)" }}
                axisLine={{ stroke: "#CBD5E1" }}
                tickLine={false}
                tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
              />
              {/* Right Y-Axis: Margin % */}
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[0, 30]}
                tick={{ fontSize: 11, fill: "#64748B", fontFamily: "var(--font-glacial)" }}
                axisLine={{ stroke: "#CBD5E1" }}
                tickLine={false}
                tickFormatter={(val) => `${val}%`}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload || !payload.length) return null;
                  const dataPoint = payload[0].payload as TradingMarginRow;
                  return (
                    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-elevation-2 font-body text-xs">
                      <p className="font-bold text-slate-900 border-b border-slate-100 pb-1 mb-1.5">{label}</p>
                      <div className="space-y-1 font-mono">
                        <p className="text-blue-600 flex justify-between gap-4">
                          <span>Gross Revenue:</span>
                          <strong>${dataPoint.grossRevenue.toLocaleString()}</strong>
                        </p>
                        <p className="text-slate-600 flex justify-between gap-4">
                          <span>COGS:</span>
                          <strong>${dataPoint.cogs.toLocaleString()}</strong>
                        </p>
                        <p className="text-emerald-700 flex justify-between gap-4 font-black">
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
                wrapperStyle={{ paddingBottom: 10, fontSize: 11, fontWeight: 600 }}
              />
              <ReferenceLine
                yAxisId="right"
                y={20.0}
                stroke="#EF4444"
                strokeDasharray="4 4"
                label={{ value: "20% SLA Target", fill: "#EF4444", fontSize: 10, position: "top" }}
              />
              <Bar yAxisId="left" dataKey="grossRevenue" name="Gross Revenue ($)" fill="#2563EB" radius={[4, 4, 0, 0]} maxBarSize={32} />
              <Bar yAxisId="left" dataKey="cogs" name="COGS ($)" fill="#94A3B8" radius={[4, 4, 0, 0]} maxBarSize={32} />
              <Line yAxisId="right" type="monotone" dataKey="marginPct" name="Realized Margin %" stroke="#10B981" strokeWidth={3} dot={{ r: 4, fill: "#10B981" }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── 2. Trading Product Line Margin Performance Table ─────────────── */}
      <div className="rounded-2xl border border-slate-200/80 bg-surface-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/70 p-4 flex flex-col sm:flex-row justify-between sm:items-center gap-2">
          <div>
            <h4 className="font-heading font-bold text-sm text-brand-navy">
              Product Category Financial Contribution &amp; Margin SLA Delta
            </h4>
            <p className="font-body text-xs text-text-grey">
              Line-item breakdown comparing category profitability against the company 20.0% net margin benchmark.
            </p>
          </div>
          <span className="font-mono text-xs font-bold text-brand-navy bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
            Blended Margin: {avgMarginPct}%
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs font-body">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/70 font-label text-[11px] font-bold uppercase tracking-wider text-text-grey">
                <th className="px-4 py-3">Product Category</th>
                <th className="px-4 py-3 text-right">Units Sold</th>
                <th className="px-4 py-3 text-right">Gross Revenue</th>
                <th className="px-4 py-3 text-right">COGS</th>
                <th className="px-4 py-3 text-right">Net Margin ($)</th>
                <th className="px-4 py-3 text-right">Margin %</th>
                <th className="px-4 py-3 text-center">Delta vs 20% SLA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-body">
              {categoryData.map((cat) => {
                const isAboveSla = cat.deltaVsSlaPct >= 0;
                return (
                  <tr key={cat.category} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3 font-bold text-slate-900 flex items-center gap-2">
                      <Layers size={13} className="text-brand-navy/60 shrink-0" />
                      <span>{cat.category}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-700">
                      {cat.unitsSold.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                      ${cat.grossRevenue.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-600">
                      ${cat.cogs.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-black text-emerald-700">
                      ${cat.netMargin.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-brand-navy">
                      {cat.marginPct}%
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${
                          isAboveSla
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-rose-50 text-rose-700 border border-rose-200"
                        }`}
                      >
                        {isAboveSla ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                        {isAboveSla ? `+${cat.deltaVsSlaPct}%` : `${cat.deltaVsSlaPct}%`}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

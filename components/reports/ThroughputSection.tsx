"use client";

import React, { useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  ArrowDownLeft,
  ArrowUpRight,
  Warehouse,
  PieChart as PieChartIcon,
  SlidersHorizontal,
} from "lucide-react";
import type { IntervalType, FlowSegment, MovementThroughputDatum } from "./types";
import {
  THROUGHPUT_DAILY_SEED,
  THROUGHPUT_WEEKLY_SEED,
  THROUGHPUT_MONTHLY_SEED,
  LOCATION_OCCUPANCY_SEED,
} from "./data/reportsSeedData";

export function ThroughputSection() {
  const [interval, setInterval] = useState<IntervalType>("daily");
  const [flow, setFlow] = useState<FlowSegment>("all");

  const chartData: MovementThroughputDatum[] =
    interval === "daily"
      ? THROUGHPUT_DAILY_SEED
      : interval === "weekly"
      ? THROUGHPUT_WEEKLY_SEED
      : THROUGHPUT_MONTHLY_SEED;

  const totalInbound = chartData.reduce((sum, d) => sum + d.inboundQty, 0);
  const totalOutbound = chartData.reduce((sum, d) => sum + d.outboundQty, 0);
  const netDelta = totalInbound - totalOutbound;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── 1. Movement Volume & Flow Throughput (2 Cols) ─────────────────── */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-200/80 bg-surface-white p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-heading text-title-md font-bold text-brand-navy flex items-center gap-2">
                  <Warehouse size={18} className="text-brand-navy" />
                  Movement Volume &amp; Flow Throughput
                </h3>
                <span className="rounded-full bg-blue-50 px-2 py-0.5 font-mono text-[10px] font-bold text-brand-navy border border-blue-200">
                  INBOUND VS OUTBOUND
                </span>
              </div>
              <p className="mt-0.5 font-body text-xs text-text-grey">
                Direct comparison of Receiving WRR dock inflows against outgoing withdrawal dispatches.
              </p>
            </div>

            {/* Interval and Flow Filter Controls */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Interval Switcher */}
              <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 font-label text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setInterval("daily")}
                  className={`rounded-lg px-2.5 py-1 transition-all ${
                    interval === "daily" ? "bg-white text-brand-navy font-bold shadow-2xs" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Daily
                </button>
                <button
                  type="button"
                  onClick={() => setInterval("weekly")}
                  className={`rounded-lg px-2.5 py-1 transition-all ${
                    interval === "weekly" ? "bg-white text-brand-navy font-bold shadow-2xs" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Weekly
                </button>
                <button
                  type="button"
                  onClick={() => setInterval("monthly")}
                  className={`rounded-lg px-2.5 py-1 transition-all ${
                    interval === "monthly" ? "bg-white text-brand-navy font-bold shadow-2xs" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Monthly
                </button>
              </div>

              {/* Flow Segment Pills */}
              <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 font-label text-xs font-semibold">
                {(["all", "vmi", "trading", "supplies"] as FlowSegment[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFlow(f)}
                    className={`rounded-lg px-2 py-1 uppercase text-[10px] font-bold transition-all ${
                      flow === f ? "bg-brand-navy text-white shadow-2xs" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {f === "all" ? "All" : f}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Integrated Stat Header Strip */}
          <div className="mt-3.5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 flex items-center justify-between">
              <div>
                <p className="font-label text-[10px] font-bold uppercase tracking-wider text-blue-900">
                  Total Received (In)
                </p>
                <p className="font-mono text-base font-black text-brand-navy">
                  +{totalInbound.toLocaleString()} Units
                </p>
              </div>
              <div className="h-8 w-8 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center">
                <ArrowDownLeft size={16} />
              </div>
            </div>

            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 flex items-center justify-between">
              <div>
                <p className="font-label text-[10px] font-bold uppercase tracking-wider text-indigo-900">
                  Total Dispatched (Out)
                </p>
                <p className="font-mono text-base font-black text-indigo-950">
                  -{totalOutbound.toLocaleString()} Units
                </p>
              </div>
              <div className="h-8 w-8 rounded-lg bg-indigo-100 text-indigo-800 flex items-center justify-center">
                <ArrowUpRight size={16} />
              </div>
            </div>

            <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 flex items-center justify-between">
              <div>
                <p className="font-label text-[10px] font-bold uppercase tracking-wider text-emerald-900">
                  Net Volume Delta
                </p>
                <p className="font-mono text-base font-black text-emerald-900">
                  {netDelta >= 0 ? `+${netDelta.toLocaleString()}` : netDelta.toLocaleString()} Units
                </p>
              </div>
              <span className="font-mono text-[10px] font-bold text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-200">
                {netDelta >= 0 ? "Accumulating" : "Depleting"}
              </span>
            </div>
          </div>

          {/* Recharts Grouped Bar Chart */}
          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#64748B", fontWeight: 600 }}
                  axisLine={{ stroke: "#CBD5E1" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#64748B", fontFamily: "var(--font-glacial)" }}
                  axisLine={{ stroke: "#CBD5E1" }}
                  tickLine={false}
                  tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload || !payload.length) return null;
                    const d = payload[0].payload as MovementThroughputDatum;
                    return (
                      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-elevation-2 font-body text-xs">
                        <p className="font-bold text-slate-900 border-b border-slate-100 pb-1 mb-1.5">{label}</p>
                        <div className="space-y-1 font-mono">
                          <p className="text-blue-600 flex justify-between gap-4">
                            <span>Inbound Receipts:</span>
                            <strong>+{d.inboundQty.toLocaleString()}</strong>
                          </p>
                          <p className="text-indigo-900 flex justify-between gap-4">
                            <span>Outbound Dispatches:</span>
                            <strong>-{d.outboundQty.toLocaleString()}</strong>
                          </p>
                          <p className="text-emerald-700 flex justify-between gap-4 font-black">
                            <span>Net Flow Delta:</span>
                            <strong>{d.inboundQty - d.outboundQty >= 0 ? `+${d.inboundQty - d.outboundQty}` : d.inboundQty - d.outboundQty}</strong>
                          </p>
                        </div>
                      </div>
                    );
                  }}
                />
                <Legend verticalAlign="top" align="right" wrapperStyle={{ paddingBottom: 10, fontSize: 11, fontWeight: 600 }} />
                <Bar dataKey="inboundQty" name="Inbound Receiving (In)" fill="#2563EB" radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="outboundQty" name="Outbound Dispatch (Out)" fill="#0F172A" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── 2. Location Occupancy & Capacity Utilization (1 Col Donut) ───── */}
        <div className="lg:col-span-1 rounded-2xl border border-slate-200/80 bg-surface-white p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-heading text-sm font-bold text-brand-navy flex items-center gap-1.5">
                  <PieChartIcon size={16} className="text-brand-navy" />
                  Physical Footprint Utilization
                </h3>
                <p className="mt-0.5 font-body text-[11px] text-text-grey">
                  Warehouse capacity distribution across 2,000 m³ total volume.
                </p>
              </div>
            </div>

            {/* Donut Chart */}
            <div className="relative h-44 w-full mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={LOCATION_OCCUPANCY_SEED}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="percentage"
                  >
                    {LOCATION_OCCUPANCY_SEED.map((entry) => (
                      <Cell key={entry.zone} fill={entry.color} stroke="#FFFFFF" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const entry = payload[0].payload;
                      return (
                        <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-elevation-2 font-body text-xs">
                          <p className="font-bold text-slate-900">{entry.zone}</p>
                          <p className="font-mono text-brand-navy font-black">
                            {entry.percentage}% ({entry.cbm} m³)
                          </p>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Center Stat */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                <p className="font-mono text-xl font-black text-brand-navy leading-none">82%</p>
                <p className="font-label text-[10px] text-text-grey font-bold uppercase mt-0.5">Total Util</p>
              </div>
            </div>

            {/* Legend Breakdown */}
            <div className="space-y-1.5 mt-2 pt-2 border-t border-slate-100">
              {LOCATION_OCCUPANCY_SEED.map((item) => (
                <div key={item.zone} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="font-medium text-slate-700">{item.zone}</span>
                  </div>
                  <span className="font-mono font-bold text-slate-900">
                    {item.percentage}% <span className="text-text-grey text-[11px]">({item.cbm}m³)</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

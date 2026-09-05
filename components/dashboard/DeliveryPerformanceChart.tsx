"use client";

import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";
import { Clock, CheckCheck, ShieldAlert, Sparkles, Target } from "lucide-react";
import {
  DELIVERY_PERFORMANCE_DATA,
  DELIVERY_MINI_METRICS,
} from "./data/seedData";

export function DeliveryPerformanceChart() {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-surface-white p-5 shadow-sm">
      {/* Header with Title & Mini-metrics */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-title-md font-bold text-brand-navy">
              Total Delivery Performance &amp; OTIF
            </h2>
            <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-700 border border-emerald-200/80">
              98.2% OTIF (Current)
            </span>
          </div>
          <p className="mt-0.5 font-body text-xs text-text-grey">
            On-Time In-Full tracking with 95.0% contractual benchmark SLA line
          </p>
        </div>

        {/* Mini-Metrics Badges in Card Header */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Average Lead Time */}
          <div className="flex items-center gap-1.5 rounded-xl bg-slate-50 border border-slate-200/70 px-2.5 py-1 text-xs">
            <Clock size={12} className="text-slate-400" />
            <span className="text-text-grey font-medium">Lead Time:</span>
            <span className="font-mono font-bold text-slate-800">
              {DELIVERY_MINI_METRICS.avgLeadTimeHours}h (&lt;24h)
            </span>
          </div>

          {/* First Attempt Delivery Rate */}
          <div className="flex items-center gap-1.5 rounded-xl bg-emerald-50 border border-emerald-200/70 px-2.5 py-1 text-xs">
            <CheckCheck size={12} className="text-emerald-600" />
            <span className="text-emerald-800 font-medium">1st Attempt:</span>
            <span className="font-mono font-bold text-emerald-900">
              {DELIVERY_MINI_METRICS.firstAttemptDeliveryRatePct}%
            </span>
          </div>

          {/* Freight Damage Claims */}
          <div className="flex items-center gap-1.5 rounded-xl bg-slate-50 border border-slate-200/70 px-2.5 py-1 text-xs">
            <ShieldAlert size={12} className="text-slate-400" />
            <span className="text-text-grey font-medium">Damage Claims:</span>
            <span className="font-mono font-bold text-emerald-700">
              {DELIVERY_MINI_METRICS.freightDamageClaimsPct}% (&lt;0.5%)
            </span>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs font-label font-semibold">
        <div className="flex items-center gap-1.5 text-brand-navy">
          <span className="h-2 w-4 rounded-full bg-brand-navy"></span>
          <span>OTIF Rate</span>
        </div>
        <div className="flex items-center gap-1.5 text-blue-600">
          <span className="h-2 w-4 rounded-full bg-[#2563EB]"></span>
          <span>On-Time Delivery (OTD)</span>
        </div>
        <div className="flex items-center gap-1.5 text-teal-600">
          <span className="h-2 w-4 rounded-full bg-[#0D9488]"></span>
          <span>In-Full Rate</span>
        </div>
        <div className="flex items-center gap-1.5 text-emerald-600">
          <span className="h-0.5 w-4 border-t-2 border-dashed border-emerald-500"></span>
          <span>SLA Target (95.0%)</span>
        </div>
      </div>

      {/* Recharts Multi-Line Chart */}
      <div className="mt-4 h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={DELIVERY_PERFORMANCE_DATA} margin={{ top: 15, right: 15, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#64748B", fontSize: 11, fontWeight: 600 }}
            />
            <YAxis
              domain={[90, 100]}
              ticks={[90, 92, 94, 96, 98, 100]}
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#64748B", fontSize: 11, fontFamily: "monospace" }}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-elevation-2 font-body text-xs">
                      <p className="font-bold text-brand-navy mb-1.5 border-b border-slate-100 pb-1">
                        {label} 2026 Delivery Metrics
                      </p>
                      <div className="space-y-1">
                        {payload.map((entry, index) => (
                          <div key={index} className="flex items-center justify-between gap-4">
                            <span className="flex items-center gap-1 text-slate-700">
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }}></span>
                              {entry.name}:
                            </span>
                            <span className="font-mono font-bold text-slate-900">{entry.value}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            {/* 95% SLA Target Line */}
            <ReferenceLine
              y={DELIVERY_MINI_METRICS.slaTargetPct}
              stroke="#10B981"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={{
                value: "SLA Target (95%)",
                fill: "#10B981",
                fontSize: 10,
                fontWeight: 700,
                position: "insideBottomRight",
              }}
            />
            <Line
              type="monotone"
              dataKey="otifRate"
              name="OTIF Rate"
              stroke="#002060"
              strokeWidth={3}
              dot={{ fill: "#002060", r: 3 }}
              activeDot={{ r: 5, fill: "#002060" }}
            />
            <Line
              type="monotone"
              dataKey="otdRate"
              name="On-Time Delivery"
              stroke="#2563EB"
              strokeWidth={2}
              dot={{ fill: "#2563EB", r: 2.5 }}
              activeDot={{ r: 4, fill: "#2563EB" }}
            />
            <Line
              type="monotone"
              dataKey="inFullRate"
              name="In-Full Rate"
              stroke="#0D9488"
              strokeWidth={2}
              dot={{ fill: "#0D9488", r: 2.5 }}
              activeDot={{ r: 4, fill: "#0D9488" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

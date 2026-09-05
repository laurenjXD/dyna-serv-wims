"use client";

import React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import {
  Truck,
  Clock,
  ShieldCheck,
} from "lucide-react";
import type { DeliverySlaDatum } from "./types";

interface DeliveryPerformanceReportProps {
  initialData?: DeliverySlaDatum[];
}

export function DeliveryPerformanceReport({ initialData }: DeliveryPerformanceReportProps) {
  const defaultSlaData: DeliverySlaDatum[] = [
    { period: "Mar 2026", otifRate: 96.4, otdRate: 97.5, fillRate: 98.9, targetOtif: 95.0 },
    { period: "Apr 2026", otifRate: 95.8, otdRate: 97.2, fillRate: 98.6, targetOtif: 95.0 },
    { period: "May 2026", otifRate: 97.1, otdRate: 98.4, fillRate: 99.0, targetOtif: 95.0 },
    { period: "Jun 2026", otifRate: 96.8, otdRate: 98.0, fillRate: 98.8, targetOtif: 95.0 },
    { period: "Jul 2026", otifRate: 97.9, otdRate: 98.9, fillRate: 99.3, targetOtif: 95.0 },
    { period: "Aug 2026 (MTD)", otifRate: 98.2, otdRate: 99.1, fillRate: 99.5, targetOtif: 95.0 },
  ];

  const data: DeliverySlaDatum[] = initialData && initialData.length > 0 ? initialData : defaultSlaData;
  const latest = data[data.length - 1];

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-surface-white p-5 shadow-sm">
      {/* ── Header & KPI Highlights ─────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-heading text-title-md font-bold text-brand-navy flex items-center gap-2">
              <Truck size={18} className="text-brand-navy" />
              Delivery SLA &amp; OTIF Fulfillment Report
            </h3>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 font-mono text-[10px] font-bold text-emerald-800 border border-emerald-200">
              LOGISTICS CONFORMANCE
            </span>
          </div>
          <p className="mt-0.5 font-body text-xs text-text-grey">
            On-Time In-Full (OTIF) fulfillment rates, carrier on-time performance, and order line fill precision.
          </p>
        </div>

        {/* Header Highlights Strip */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
            <Clock size={13} className="text-slate-400" />
            <span className="text-[11px] font-label text-text-grey">Dock-to-Delivery:</span>
            <span className="font-mono font-bold text-xs text-slate-900">&lt; 24h</span>
          </div>

          <div className="flex items-center gap-2 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
            <ShieldCheck size={13} className="text-emerald-700" />
            <span className="text-[11px] font-label text-emerald-800">First-Attempt Delivery:</span>
            <span className="font-mono font-black text-xs text-emerald-900">97.8%</span>
          </div>

          <div className="flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-200">
            <span className="text-[11px] font-label text-brand-navy">Current OTIF:</span>
            <span className="font-mono font-black text-xs text-brand-navy">{latest?.otifRate}%</span>
          </div>
        </div>
      </div>

      {/* ── Multi-Line SLA Chart ────────────────────────────────────────── */}
      <div className="mt-4 h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
            <XAxis
              dataKey="period"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#64748B", fontSize: 11, fontWeight: 600 }}
            />
            <YAxis
              domain={[90, 100]}
              ticks={[90, 92, 94, 96, 98, 100]}
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#64748B", fontSize: 10, fontFamily: "monospace" }}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-elevation-2 font-body text-xs">
                      <p className="font-bold text-brand-navy mb-1.5 border-b border-slate-100 pb-1">
                        {label} Fulfillment Performance
                      </p>
                      <div className="space-y-1 font-mono">
                        {payload.map((entry, idx) => (
                          <div key={idx} className="flex justify-between gap-4">
                            <span className="text-slate-600 font-sans">{entry.name}:</span>
                            <span className="font-bold text-slate-900">{entry.value}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            <ReferenceLine
              y={95}
              stroke="#10B981"
              strokeDasharray="4 4"
              label={{ value: "95.0% Contractual SLA Target", fill: "#059669", fontSize: 10, position: "insideBottomRight" }}
            />
            <Line
              type="monotone"
              dataKey="otifRate"
              name="OTIF Realized Rate"
              stroke="#002060"
              strokeWidth={3}
              dot={{ fill: "#002060", r: 3 }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="otdRate"
              name="On-Time Delivery (OTD)"
              stroke="#2563EB"
              strokeWidth={2}
              dot={{ fill: "#2563EB", r: 2 }}
            />
            <Line
              type="monotone"
              dataKey="fillRate"
              name="Order Line Fill Rate"
              stroke="#0D9488"
              strokeWidth={2}
              dot={{ fill: "#0D9488", r: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

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
  CheckCircle2,
  Clock,
  ShieldCheck,
  Target,
} from "lucide-react";
import type { DeliverySlaDatum } from "./types";
import { DELIVERY_SLA_SEED } from "./data/reportsSeedData";

export function DeliveryPerformanceReport() {
  const data: DeliverySlaDatum[] = DELIVERY_SLA_SEED;
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
            <Target size={13} className="text-blue-700" />
            <span className="text-[11px] font-label text-blue-800">Current OTIF:</span>
            <span className="font-mono font-black text-xs text-blue-900">{latest.otifRate}%</span>
          </div>
        </div>
      </div>

      {/* ── Recharts Line Chart ─────────────────────────────────────────── */}
      <div className="mt-4 h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 15, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
            <XAxis
              dataKey="period"
              tick={{ fontSize: 11, fill: "#64748B", fontWeight: 600 }}
              axisLine={{ stroke: "#CBD5E1" }}
              tickLine={false}
            />
            <YAxis
              domain={[90, 100]}
              tick={{ fontSize: 11, fill: "#64748B", fontFamily: "var(--font-glacial)" }}
              axisLine={{ stroke: "#CBD5E1" }}
              tickLine={false}
              tickFormatter={(val) => `${val}%`}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload || !payload.length) return null;
                const d = payload[0].payload as DeliverySlaDatum;
                return (
                  <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-elevation-2 font-body text-xs">
                    <p className="font-bold text-slate-900 border-b border-slate-100 pb-1 mb-1.5">{label}</p>
                    <div className="space-y-1 font-mono">
                      <p className="text-blue-600 flex justify-between gap-4">
                        <span>OTIF Rate:</span>
                        <strong>{d.otifRate}%</strong>
                      </p>
                      <p className="text-emerald-700 flex justify-between gap-4">
                        <span>On-Time Delivery (OTD):</span>
                        <strong>{d.otdRate}%</strong>
                      </p>
                      <p className="text-purple-700 flex justify-between gap-4">
                        <span>Order Fill Rate:</span>
                        <strong>{d.fillRate}%</strong>
                      </p>
                    </div>
                  </div>
                );
              }}
            />
            <Legend verticalAlign="top" align="right" wrapperStyle={{ paddingBottom: 10, fontSize: 11, fontWeight: 600 }} />
            <ReferenceLine
              y={95.0}
              stroke="#EF4444"
              strokeDasharray="4 4"
              label={{ value: "95% OTIF Target", fill: "#EF4444", fontSize: 10, position: "top" }}
            />
            <Line type="monotone" dataKey="otifRate" name="OTIF Rate (%)" stroke="#2563EB" strokeWidth={3} dot={{ r: 4, fill: "#2563EB" }} />
            <Line type="monotone" dataKey="otdRate" name="On-Time Delivery (%)" stroke="#10B981" strokeWidth={2} strokeDasharray="3 3" dot={{ r: 3, fill: "#10B981" }} />
            <Line type="monotone" dataKey="fillRate" name="Order Fill Rate (%)" stroke="#7C3AED" strokeWidth={2} dot={{ r: 3, fill: "#7C3AED" }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

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
} from "recharts";
import { Clock, CheckCheck, ShieldAlert } from "lucide-react";
import type { DeliveryPerformanceDatum, DeliveryPerformanceMiniMetrics } from "./types";

interface DeliveryPerformanceChartProps {
  initialData?: {
    chartData: DeliveryPerformanceDatum[];
    miniMetrics: DeliveryPerformanceMiniMetrics;
  };
}

export function DeliveryPerformanceChart({ initialData }: DeliveryPerformanceChartProps) {
  const defaultChartData: DeliveryPerformanceDatum[] = [];

  const defaultMiniMetrics: DeliveryPerformanceMiniMetrics = {
    avgLeadTimeHours: 0,
    firstAttemptDeliveryRatePct: 0,
    freightDamageClaimsPct: 0,
    slaTargetPct: 95.0,
  };

  const chartData = initialData?.chartData || defaultChartData;
  const miniMetrics = initialData?.miniMetrics || defaultMiniMetrics;
  const currentOtif = chartData.length > 0 ? chartData[chartData.length - 1].otifRate : 0;

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      {/* Clean Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-3.5">
        <div>
          <h2 className="font-heading text-title-md font-bold text-brand-navy">
            Delivery Performance &amp; OTIF
          </h2>
          <p className="mt-0.5 font-body text-body-xs text-text-grey">
            On-Time In-Full fulfillment rate benchmarked against {miniMetrics.slaTargetPct}% SLA target
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-mono-md font-bold text-emerald-700">
            {currentOtif}% OTIF
          </span>
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
          <span>SLA Target ({miniMetrics.slaTargetPct}%)</span>
        </div>
      </div>

      {/* Recharts Multi-Line Chart */}
      <div className="mt-4 h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 15, right: 15, left: -20, bottom: 0 }}>
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
                    <div className="rounded-xl border border-border bg-surface p-3 shadow-elevation-2 font-body text-body-xs">
                      <p className="font-bold text-brand-navy mb-1.5 border-b border-border pb-1">
                        {label} Delivery Metrics
                      </p>
                      <div className="space-y-1">
                        {payload.map((entry, index) => (
                          <div key={index} className="flex items-center justify-between gap-4">
                            <span className="flex items-center gap-1 text-on-surface">
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: entry.color }}
                              ></span>
                              {entry.name}:
                            </span>
                            <span className="font-mono font-bold text-on-surface">{entry.value}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            {/* SLA Target Line */}
            <ReferenceLine
              y={miniMetrics.slaTargetPct}
              stroke="#10B981"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={{
                value: `SLA (${miniMetrics.slaTargetPct}%)`,
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

      {/* Clean Structured Metric Footer */}
      <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3 border-t border-border pt-3">
        <div className="flex items-center gap-2 rounded-lg bg-surface-light-grey/50 px-3 py-2">
          <Clock size={14} className="text-text-grey" />
          <div className="font-body text-body-xs">
            <span className="text-text-grey">Avg Lead Time: </span>
            <strong className="font-mono text-on-surface">{miniMetrics.avgLeadTimeHours}h</strong>
            <span className="text-text-grey text-[11px]"> (&lt;24h)</span>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg bg-surface-light-grey/50 px-3 py-2">
          <CheckCheck size={14} className="text-emerald-600" />
          <div className="font-body text-body-xs">
            <span className="text-text-grey">First Attempt: </span>
            <strong className="font-mono text-emerald-800">{miniMetrics.firstAttemptDeliveryRatePct}%</strong>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg bg-surface-light-grey/50 px-3 py-2">
          <ShieldAlert size={14} className="text-text-grey" />
          <div className="font-body text-body-xs">
            <span className="text-text-grey">Damage Claims: </span>
            <strong className="font-mono text-on-surface">{miniMetrics.freightDamageClaimsPct}%</strong>
            <span className="text-text-grey text-[11px]"> (&lt;0.5%)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

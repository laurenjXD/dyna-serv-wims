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
} from "recharts";
import {
  Warehouse,
} from "lucide-react";
import type { IntervalType, FlowSegment, MovementThroughputDatum, LocationOccupancyDatum } from "./types";

interface ThroughputSectionProps {
  initialData?: MovementThroughputDatum[];
}

export function ThroughputSection({ initialData }: ThroughputSectionProps) {
  const [interval, setInterval] = useState<IntervalType>("daily");
  const [flow, setFlow] = useState<FlowSegment>("all");

  const dailyFallback: MovementThroughputDatum[] = [
    { label: "Aug 01", inboundQty: 420, outboundQty: 380, vmiQty: 480, tradingQty: 240, suppliesQty: 80 },
    { label: "Aug 05", inboundQty: 580, outboundQty: 510, vmiQty: 620, tradingQty: 340, suppliesQty: 130 },
    { label: "Aug 10", inboundQty: 610, outboundQty: 590, vmiQty: 710, tradingQty: 380, suppliesQty: 110 },
    { label: "Aug 15", inboundQty: 490, outboundQty: 530, vmiQty: 580, tradingQty: 310, suppliesQty: 130 },
    { label: "Aug 20", inboundQty: 640, outboundQty: 620, vmiQty: 760, tradingQty: 390, suppliesQty: 110 },
    { label: "Aug 25", inboundQty: 530, outboundQty: 570, vmiQty: 640, tradingQty: 350, suppliesQty: 110 },
    { label: "Aug 31", inboundQty: 590, outboundQty: 580, vmiQty: 700, tradingQty: 360, suppliesQty: 110 },
  ];

  const weeklyFallback: MovementThroughputDatum[] = [
    { label: "W31 (Aug 01-07)", inboundQty: 2940, outboundQty: 2660, vmiQty: 3360, tradingQty: 1680, suppliesQty: 560 },
    { label: "W32 (Aug 08-14)", inboundQty: 4060, outboundQty: 3570, vmiQty: 4340, tradingQty: 2380, suppliesQty: 910 },
    { label: "W33 (Aug 15-21)", inboundQty: 4270, outboundQty: 4130, vmiQty: 4970, tradingQty: 2660, suppliesQty: 770 },
    { label: "W34 (Aug 22-28)", inboundQty: 3430, outboundQty: 3710, vmiQty: 4060, tradingQty: 2170, suppliesQty: 910 },
    { label: "W35 (Aug 29-31)", inboundQty: 4480, outboundQty: 4340, vmiQty: 5320, tradingQty: 2730, suppliesQty: 770 },
  ];

  const monthlyFallback: MovementThroughputDatum[] = [
    { label: "Jan 2026", inboundQty: 11800, outboundQty: 10640, vmiQty: 13440, tradingQty: 6720, suppliesQty: 2280 },
    { label: "Feb 2026", inboundQty: 12900, outboundQty: 11500, vmiQty: 14600, tradingQty: 7300, suppliesQty: 2500 },
    { label: "Mar 2026", inboundQty: 14300, outboundQty: 13400, vmiQty: 16200, tradingQty: 8100, suppliesQty: 3400 },
    { label: "Apr 2026", inboundQty: 13700, outboundQty: 14500, vmiQty: 15500, tradingQty: 7800, suppliesQty: 4900 },
    { label: "May 2026", inboundQty: 15100, outboundQty: 14300, vmiQty: 17100, tradingQty: 8500, suppliesQty: 3800 },
    { label: "Jun 2026", inboundQty: 16200, outboundQty: 15400, vmiQty: 18400, tradingQty: 9200, suppliesQty: 4000 },
    { label: "Jul 2026", inboundQty: 14800, outboundQty: 16000, vmiQty: 16800, tradingQty: 8400, suppliesQty: 5600 },
    { label: "Aug 2026", inboundQty: 16500, outboundQty: 16200, vmiQty: 18700, tradingQty: 9400, suppliesQty: 4600 },
  ];

  const chartData: MovementThroughputDatum[] =
    interval === "daily"
      ? (initialData || dailyFallback)
      : interval === "weekly"
      ? weeklyFallback
      : monthlyFallback;

  const totalInbound = chartData.reduce((sum, d) => sum + d.inboundQty, 0);
  const totalOutbound = chartData.reduce((sum, d) => sum + d.outboundQty, 0);
  const netDelta = totalInbound - totalOutbound;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6">
        {/* ── Movement Volume & Flow Throughput ─────────────────── */}
        <div className="rounded-2xl border border-slate-200/80 bg-surface-white p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-heading text-title-md font-bold text-brand-navy flex items-center gap-2">
                  <Warehouse size={18} className="text-brand-navy" />
                  Movement Volume &amp; Flow Throughput
                </h3>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-mono text-[10px] font-bold text-slate-700">
                  REAL-TIME LEDGER
                </span>
              </div>
              <p className="mt-0.5 font-body text-xs text-text-grey">
                Inbound intake vs. outbound withdrawal quantities with flow type distribution.
              </p>
            </div>

            {/* Granularity Switcher */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl font-label text-xs font-semibold">
              <button
                type="button"
                onClick={() => setInterval("daily")}
                className={`rounded-lg px-2.5 py-1 transition-all ${
                  interval === "daily"
                    ? "bg-white text-brand-navy font-bold shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Daily
              </button>
              <button
                type="button"
                onClick={() => setInterval("weekly")}
                className={`rounded-lg px-2.5 py-1 transition-all ${
                  interval === "weekly"
                    ? "bg-white text-brand-navy font-bold shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Weekly
              </button>
              <button
                type="button"
                onClick={() => setInterval("monthly")}
                className={`rounded-lg px-2.5 py-1 transition-all ${
                  interval === "monthly"
                    ? "bg-white text-brand-navy font-bold shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Monthly
              </button>
            </div>
          </div>

          {/* Quick Metrics Strip */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 font-label font-semibold text-slate-800">
                <span className="h-3 w-3 rounded-xs bg-[#002060]"></span>
                <span>Inbound Receiving: <strong className="font-mono">{totalInbound.toLocaleString()}</strong></span>
              </div>
              <div className="flex items-center gap-1.5 font-label font-semibold text-slate-800">
                <span className="h-3 w-3 rounded-xs bg-[#2563EB]"></span>
                <span>Outbound Dispatch: <strong className="font-mono">{totalOutbound.toLocaleString()}</strong></span>
              </div>
            </div>

            <div className="font-mono text-[11px] text-text-grey">
              Net Flux:{" "}
              <strong className={netDelta >= 0 ? "text-emerald-700" : "text-amber-700"}>
                {netDelta >= 0 ? `+${netDelta.toLocaleString()}` : netDelta.toLocaleString()} units
              </strong>
            </div>
          </div>

          {/* BarChart Component */}
          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#64748B", fontSize: 11, fontWeight: 600 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#64748B", fontSize: 10, fontFamily: "monospace" }}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-elevation-2 font-body text-xs">
                          <p className="font-bold text-brand-navy mb-1.5 border-b border-slate-100 pb-1">
                            {label} Throughput
                          </p>
                          <div className="space-y-1">
                            <div className="flex justify-between gap-4">
                              <span className="text-slate-600">Inbound Receipts:</span>
                              <span className="font-mono font-bold text-brand-navy">
                                {Number(payload[0]?.value).toLocaleString()}
                              </span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-slate-600">Outbound Dispatches:</span>
                              <span className="font-mono font-bold text-blue-600">
                                {Number(payload[1]?.value).toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Bar dataKey="inboundQty" name="Inbound Receiving" fill="#002060" radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="outboundQty" name="Outbound Dispatch" fill="#2563EB" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

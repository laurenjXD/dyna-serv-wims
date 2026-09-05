"use client";

import React, { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { ArrowDownLeft, ArrowUpRight, Filter } from "lucide-react";
import type { FlowTypeFilter } from "./types";
import { MONTHLY_FLOW_DATA } from "./data/seedData";

export function FlowMovementChart() {
  const [activeFlow, setActiveFlow] = useState<FlowTypeFilter>("all");

  const data = MONTHLY_FLOW_DATA[activeFlow] ?? MONTHLY_FLOW_DATA.all;

  const flowTabs: Array<{ key: FlowTypeFilter; label: string }> = [
    { key: "all", label: "All Flows" },
    { key: "vmi", label: "VMI" },
    { key: "trading", label: "Trading" },
    { key: "supplies", label: "Supplies" },
  ];

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-surface-white p-5 shadow-sm">
      {/* Header with Title & Flow Type Filter Tabs */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-title-md font-bold text-brand-navy">
              Monthly Flow Movement
            </h2>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-700">
              Jan – Aug 2026
            </span>
          </div>
          <p className="mt-0.5 font-body text-xs text-text-grey">
            Inbound Receiving vs. Outbound Dispatch volumes (0 – 600 unit scale)
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 font-label text-xs font-semibold">
          {flowTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveFlow(tab.key)}
              className={`rounded-lg px-2.5 py-1 transition-all ${
                activeFlow === tab.key
                  ? "bg-white text-brand-navy font-bold shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Legend & Summary indicators */}
      <div className="mt-3 flex items-center justify-between text-xs">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 font-label font-semibold text-slate-800">
            <span className="h-3 w-3 rounded-xs bg-[#002060]"></span>
            <span>Inbound Receiving</span>
          </div>
          <div className="flex items-center gap-1.5 font-label font-semibold text-slate-800">
            <span className="h-3 w-3 rounded-xs bg-[#2563EB]"></span>
            <span>Outbound Dispatch</span>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-text-grey font-mono text-[11px]">
          <span>Peak: 590 Units (Aug)</span>
        </div>
      </div>

      {/* Recharts Grouped Bar Chart */}
      <div className="mt-4 h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#64748B", fontSize: 11, fontWeight: 600 }}
            />
            <YAxis
              domain={[0, 600]}
              ticks={[0, 150, 300, 450, 600]}
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#64748B", fontSize: 11, fontFamily: "monospace" }}
            />
            <Tooltip
              cursor={{ fill: "rgba(241, 245, 249, 0.6)" }}
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  const inboundVal = Number(payload[0]?.value ?? 0);
                  const outboundVal = Number(payload[1]?.value ?? 0);
                  const netFlux = inboundVal - outboundVal;

                  return (
                    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-elevation-2 font-body text-xs">
                      <p className="font-bold text-brand-navy mb-1.5 border-b border-slate-100 pb-1">
                        {label} 2026 Movement
                      </p>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-4">
                          <span className="flex items-center gap-1 text-slate-700">
                            <span className="h-2 w-2 rounded-full bg-[#002060]"></span>
                            Inbound Receiving:
                          </span>
                          <span className="font-mono font-bold text-slate-900">{inboundVal} units</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="flex items-center gap-1 text-slate-700">
                            <span className="h-2 w-2 rounded-full bg-[#2563EB]"></span>
                            Outbound Dispatch:
                          </span>
                          <span className="font-mono font-bold text-slate-900">{outboundVal} units</span>
                        </div>
                        <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-100 font-semibold">
                          <span className="text-text-grey">Net Flux:</span>
                          <span className={`font-mono ${netFlux >= 0 ? "text-emerald-700" : "text-amber-700"}`}>
                            {netFlux >= 0 ? `+${netFlux}` : netFlux} units
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar dataKey="inbound" name="Inbound Receiving" fill="#002060" radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Bar dataKey="outbound" name="Outbound Dispatch" fill="#2563EB" radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

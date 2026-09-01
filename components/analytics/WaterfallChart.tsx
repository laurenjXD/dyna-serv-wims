"use client";

import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  ReferenceLine,
  CartesianGrid,
} from "recharts";

export type WaterfallDatum = {
  label: string;
  value: number;
  type: "base" | "addition" | "subtraction" | "total";
  tooltipNote?: string;
};

export type WaterfallChartProps = {
  data: WaterfallDatum[];
  title?: string;
  yAxisLabel?: string;
  currency?: string;
  height?: number;
};

export function WaterfallChart({
  data,
  title,
  yAxisLabel,
  currency = "₱",
  height = 320,
}: WaterfallChartProps) {
  // Compute floating waterfall bar levels (start, end, delta)
  let runningTotal = 0;
  const processedData = data.map((item) => {
    let start = 0;
    let barValue = item.value;

    if (item.type === "base") {
      start = 0;
      barValue = item.value;
      runningTotal = item.value;
    } else if (item.type === "addition") {
      start = runningTotal;
      barValue = item.value;
      runningTotal += item.value;
    } else if (item.type === "subtraction") {
      start = runningTotal - item.value;
      barValue = item.value;
      runningTotal -= item.value;
    } else if (item.type === "total") {
      start = 0;
      barValue = runningTotal;
    }

    return {
      label: item.label,
      rawVal: item.value,
      type: item.type,
      startOffset: start,
      barHeight: Math.abs(barValue),
      displayTotal: runningTotal,
      tooltipNote: item.tooltipNote,
    };
  });

  const getColor = (type: WaterfallDatum["type"]) => {
    switch (type) {
      case "base":
        return "#002060"; // Dyna-Serv Brand Navy
      case "addition":
        return "#2E4094"; // Dyna-Serv Brand Royal Blue
      case "subtraction":
        return "#EF4444"; // Status Held / Red
      case "total":
        return "#10B981"; // Status Available / Emerald
      default:
        return "#64748B"; // Slate
    }
  };

  return (
    <div className="w-full rounded-xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1">
      {title && (
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-heading text-headline-md font-semibold text-on-surface">
            {title}
          </h3>
          <div className="flex items-center gap-4 text-xs font-medium text-text-grey">
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-brand-navy" /> Base Cost
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-brand-royal-blue" /> Incurred
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-status-available" /> Landed Total
            </span>
          </div>
        </div>
      )}

      <div style={{ width: "100%", height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={processedData} margin={{ top: 20, right: 20, left: 0, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
            <XAxis
              dataKey="label"
              tick={{ fill: "#64748B", fontSize: 12, fontFamily: "Epilogue, sans-serif" }}
              axisLine={{ stroke: "#CBD5E1" }}
            />
            <YAxis
              tick={{ fill: "#64748B", fontSize: 12, fontFamily: "Roboto Mono, monospace" }}
              axisLine={{ stroke: "#CBD5E1" }}
              tickFormatter={(v) => `${currency}${v.toLocaleString()}`}
              label={
                yAxisLabel
                  ? {
                      value: yAxisLabel,
                      angle: -90,
                      position: "insideLeft",
                      fill: "#64748B",
                      fontSize: 12,
                    }
                  : undefined
              }
            />
            <Tooltip
              formatter={(value, name, item) => {
                const p = item.payload;
                return [
                  `${currency}${p.rawVal.toLocaleString()} (Total: ${currency}${p.displayTotal.toLocaleString()})`,
                  p.label,
                ];
              }}
              contentStyle={{
                backgroundColor: "#FFFFFF",
                borderRadius: "8px",
                border: "1px solid #E2E8F0",
                boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                fontFamily: "Outfit, sans-serif",
                fontSize: "13px",
              }}
            />
            <ReferenceLine y={0} stroke="#94A3B8" />
            {/* Transparent placeholder bar to lift the floating bar */}
            <Bar dataKey="startOffset" stackId="stack" fill="transparent" isAnimationActive={false} />
            {/* Visible waterfall bar */}
            <Bar dataKey="barHeight" stackId="stack" radius={[4, 4, 0, 0]}>
              {processedData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getColor(entry.type)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

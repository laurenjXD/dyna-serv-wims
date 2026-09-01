"use client";

import React from "react";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

export type ScatterPlotDatum = {
  id: string;
  name: string;
  code: string;
  xTurnover: number; // Turnover Velocity
  yGrossMarginPct: number; // Gross Margin %
  volume: number; // For bubble size
  category?: string;
};

export type ScatterPlotProps = {
  data: ScatterPlotDatum[];
  title?: string;
  xLabel?: string;
  yLabel?: string;
  medianX?: number;
  medianY?: number;
  height?: number;
};

export function ScatterPlot({
  data,
  title = "Product Matrix: Stars & Dogs",
  xLabel = "Turnover Velocity (Turns / Year)",
  yLabel = "Gross Margin (%)",
  medianX = 5,
  medianY = 25,
  height = 360,
}: ScatterPlotProps) {
  return (
    <div className="w-full rounded-xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-heading text-headline-md font-semibold text-on-surface">
            {title}
          </h3>
          <p className="font-body text-xs text-text-grey">
            Quadrants: Top-Right = <span className="font-semibold text-status-available">Stars</span> (High Margin, High Velocity), Top-Left = <span className="font-semibold text-brand-royal-blue">Question Marks</span>, Bottom-Right = <span className="font-semibold text-amber-600">Cash Cows</span>, Bottom-Left = <span className="font-semibold text-status-held">Dogs</span>.
          </p>
        </div>
      </div>

      <div style={{ width: "100%", height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
            <XAxis
              type="number"
              dataKey="xTurnover"
              name="Turnover Rate"
              tick={{ fill: "#64748B", fontSize: 12, fontFamily: "Roboto Mono, monospace" }}
              unit="x"
              label={{
                value: xLabel,
                position: "insideBottom",
                offset: -10,
                fill: "#64748B",
                fontSize: 12,
                fontFamily: "Epilogue, sans-serif",
              }}
            />
            <YAxis
              type="number"
              dataKey="yGrossMarginPct"
              name="Gross Margin"
              tick={{ fill: "#64748B", fontSize: 12, fontFamily: "Roboto Mono, monospace" }}
              unit="%"
              label={{
                value: yLabel,
                angle: -90,
                position: "insideLeft",
                fill: "#64748B",
                fontSize: 12,
                fontFamily: "Epilogue, sans-serif",
              }}
            />
            <ZAxis type="number" dataKey="volume" range={[60, 400]} name="Volume" />
            
            {/* Quadrant Dividers */}
            <ReferenceLine x={medianX} stroke="#94A3B8" strokeDasharray="4 4" />
            <ReferenceLine y={medianY} stroke="#94A3B8" strokeDasharray="4 4" />

            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const d = payload[0].payload as ScatterPlotDatum;
                  return (
                    <div className="rounded-lg border border-outline-variant/50 bg-white p-3 shadow-md font-sans text-xs">
                      <p className="font-bold text-on-surface font-mono">{d.code}</p>
                      <p className="text-text-grey">{d.name}</p>
                      <div className="mt-2 space-y-1 border-t border-slate-100 pt-1.5 font-mono">
                        <p className="text-brand-navy">Turnover: <span className="font-semibold">{d.xTurnover}x</span></p>
                        <p className="text-brand-navy">Margin: <span className="font-semibold">{d.yGrossMarginPct}%</span></p>
                        <p className="text-text-grey">Volume: {d.volume.toLocaleString()} units</p>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />

            <Scatter
              name="Items"
              data={data}
              fill="#2E4094"
              shape="circle"
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

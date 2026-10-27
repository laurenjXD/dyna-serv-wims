"use client";

import React from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { LocationOccupancyDatum } from "./types";

interface LocationOccupancyChartProps {
  initialData?: LocationOccupancyDatum[];
}

export function LocationOccupancyChart({ initialData }: LocationOccupancyChartProps) {
  const defaultOccupancy: LocationOccupancyDatum[] = [];

  const data = initialData && initialData.length > 0 ? initialData : defaultOccupancy;
  const totalCbmUsed = data.reduce((sum, d) => sum + d.cbmUsed, 0);
  const totalCbmCapacity = data.reduce((sum, d) => sum + (d.cbmTotal || 0), 0);
  const overallPct = totalCbmCapacity > 0 ? Math.round((totalCbmUsed / totalCbmCapacity) * 100) : 0;

  return (
    <div className="h-full rounded-2xl border border-slate-200/80 bg-surface-white p-5 shadow-sm flex flex-col justify-between">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 className="font-heading text-title-md font-bold text-brand-navy">
              Warehouse Occupancy
            </h2>
            <p className="mt-0.5 font-body text-xs text-text-grey">
              Storage allocation by warehouse zone
            </p>
          </div>
          <span className="rounded-md bg-blue-50 px-2 py-0.5 font-mono text-[10px] font-bold text-brand-navy border border-blue-200/80">
            {totalCbmUsed.toLocaleString()} / {totalCbmCapacity.toLocaleString()} m³
          </span>
        </div>

        {/* Donut Chart with Center Metric */}
        <div className="relative mt-2 min-h-44 w-full flex-1">
          {data.length === 0 ? (
            <div className="flex h-full min-h-44 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 text-center font-body text-sm text-text-grey">
              No live location capacity data is available.
            </div>
          ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={70}
                paddingAngle={3}
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} stroke="#FFFFFF" strokeWidth={2} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0].payload;
                    return (
                      <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-elevation-2 font-body text-xs">
                        <p className="font-bold text-slate-900 mb-1">{d.name}</p>
                        <div className="space-y-0.5">
                          <p className="text-brand-navy font-bold">{d.value}% of capacity</p>
                          <p className="text-text-grey">{d.cbmUsed} m³ allocated</p>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          )}

            {/* Center Metric */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="font-mono text-xl font-black text-brand-navy leading-none">
              {overallPct}%
            </span>
            <span className="text-[10px] font-label font-bold uppercase tracking-wider text-text-grey mt-0.5">
              UTILIZED
            </span>
          </div>
        </div>
      </div>

    </div>
  );
}

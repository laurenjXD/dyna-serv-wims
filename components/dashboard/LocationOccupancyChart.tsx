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
  const defaultOccupancy: LocationOccupancyDatum[] = [
    { name: "Zone A (Pallet Racks)", value: 78, color: "#002B49", cbmUsed: 780, cbmTotal: 1000 },
    { name: "Zone B (Mezzanine Bins)", value: 64, color: "#00A8B5", cbmUsed: 320, cbmTotal: 500 },
    { name: "Zone C (Cold Chain)", value: 42, color: "#2563EB", cbmUsed: 126, cbmTotal: 300 },
    { name: "Zone D (Staging Floor)", value: 85, color: "#F59E0B", cbmUsed: 340, cbmTotal: 400 },
  ];

  const data = initialData && initialData.length > 0 ? initialData : defaultOccupancy;
  const totalCbmUsed = data.reduce((sum, d) => sum + d.cbmUsed, 0);
  const totalCbmCapacity = data.reduce((sum, d) => sum + (d.cbmTotal || 500), 0);
  const overallPct = totalCbmCapacity > 0 ? Math.round((totalCbmUsed / totalCbmCapacity) * 100) : 76;

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-surface-white p-5 shadow-sm flex flex-col justify-between">
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
        <div className="relative mt-2 h-44 w-full">
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

      {/* Breakdown Legend Grid */}
      <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
        {data.map((zone) => (
          <div
            key={zone.name}
            className="flex items-center justify-between rounded-lg bg-slate-50/80 px-2.5 py-1.5 border border-slate-200/60"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: zone.color }}></span>
              <span className="font-medium text-slate-800 truncate text-[11px]">{zone.name}</span>
            </div>
            <span className="font-mono font-bold text-brand-navy text-[11px] shrink-0">
              {zone.value}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

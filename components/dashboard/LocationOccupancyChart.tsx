"use client";

import React from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Warehouse, Layers, Maximize2 } from "lucide-react";
import { LOCATION_OCCUPANCY_DATA } from "./data/seedData";

export function LocationOccupancyChart() {
  const totalOccupancy = LOCATION_OCCUPANCY_DATA.reduce((sum, d) => sum + d.value, 0);
  const totalCbmUsed = LOCATION_OCCUPANCY_DATA.reduce((sum, d) => sum + d.cbmUsed, 0);

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
            {totalCbmUsed.toLocaleString()} / 5,000 m³
          </span>
        </div>

        {/* Donut Chart with Center Metric */}
        <div className="relative mt-2 h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={LOCATION_OCCUPANCY_DATA}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={70}
                paddingAngle={3}
                dataKey="value"
              >
                {LOCATION_OCCUPANCY_DATA.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} stroke="#FFFFFF" strokeWidth={2} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-elevation-2 font-body text-xs">
                        <p className="font-bold text-slate-900 mb-1">{data.name}</p>
                        <div className="space-y-0.5">
                          <p className="text-brand-navy font-bold">{data.value}% of capacity</p>
                          <p className="text-text-grey">{data.cbmUsed} m³ allocated</p>
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
              82.4%
            </span>
            <span className="text-[10px] font-label font-bold uppercase tracking-wider text-text-grey mt-0.5">
              UTILIZED
            </span>
          </div>
        </div>
      </div>

      {/* Breakdown Legend Grid */}
      <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
        {LOCATION_OCCUPANCY_DATA.map((zone) => (
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

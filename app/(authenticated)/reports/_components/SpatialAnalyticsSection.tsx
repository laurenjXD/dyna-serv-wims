"use client";

import React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  AreaChart,
  Area,
} from "recharts";
import { Warehouse, Gauge, Layers, TrendingUp } from "lucide-react";
import { WarehouseHeatmap } from "@/components/analytics/WarehouseHeatmap";
import type {
  TdcDatum,
  SpaceUtilizationForecast,
} from "@/lib/analytics/queries/spatial";
import type { HeatmapCell } from "@/components/analytics/WarehouseHeatmap";

export type SpatialAnalyticsSectionProps = {
  tdcData: TdcDatum[];
  pickingDensity: { rows: string[]; columns: string[]; matrix: HeatmapCell[] };
  profitabilityHeatmap: { rows: string[]; columns: string[]; matrix: HeatmapCell[] };
  spaceForecast: SpaceUtilizationForecast;
};

export function SpatialAnalyticsSection({
  tdcData,
  pickingDensity,
  profitabilityHeatmap,
  spaceForecast,
}: SpatialAnalyticsSectionProps) {
  return (
    <div className="space-y-6">
      {/* ── KPI Summary Strip ─────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
          <div className="flex items-center justify-between">
            <span className="font-label text-xs font-semibold uppercase tracking-wider text-text-grey">
              Warehouse Capacity
            </span>
            <div className="rounded-md bg-blue-50 p-2 text-brand-royal-blue">
              <Warehouse size={20} />
            </div>
          </div>
          <p className="mt-2 font-heading text-2xl font-bold text-on-surface">
            {spaceForecast.utilizationPct}%
          </p>
          <p className="mt-1 font-body text-xs text-text-grey">
            {spaceForecast.currentCbmUsed.toLocaleString()} / {spaceForecast.totalCapacityCbm.toLocaleString()} CBM occupied
          </p>
        </div>

        <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
          <div className="flex items-center justify-between">
            <span className="font-label text-xs font-semibold uppercase tracking-wider text-text-grey">
              100% Full Forecast
            </span>
            <div className="rounded-md bg-amber-50 p-2 text-amber-600">
              <Gauge size={20} />
            </div>
          </div>
          <p className="mt-2 font-heading text-2xl font-bold text-amber-600">
            ~{spaceForecast.projectedDaysToFull} Days
          </p>
          <p className="mt-1 font-body text-xs text-text-grey">
            Net growth rate: +{spaceForecast.growthRateCbmPerDay} CBM/day
          </p>
        </div>

        <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
          <div className="flex items-center justify-between">
            <span className="font-label text-xs font-semibold uppercase tracking-wider text-text-grey">
              Avg TDC per Unit
            </span>
            <div className="rounded-md bg-emerald-50 p-2 text-status-available">
              <TrendingUp size={20} />
            </div>
          </div>
          <p className="mt-2 font-heading text-2xl font-bold text-status-available font-mono">
            ₱{tdcData[tdcData.length - 1]?.costPerUnit.toFixed(2) ?? "11.10"}
          </p>
          <p className="mt-1 font-body text-xs text-text-grey">
            Total Distribution Cost per dispatched unit
          </p>
        </div>

        <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
          <div className="flex items-center justify-between">
            <span className="font-label text-xs font-semibold uppercase tracking-wider text-text-grey">
              Active Storage Aisles
            </span>
            <div className="rounded-md bg-slate-100 p-2 text-brand-navy">
              <Layers size={20} />
            </div>
          </div>
          <p className="mt-2 font-heading text-2xl font-bold text-on-surface">
            {pickingDensity.rows.length} Aisles
          </p>
          <p className="mt-1 font-body text-xs text-text-grey">
            {pickingDensity.rows.length * pickingDensity.columns.length} Racks mapped
          </p>
        </div>
      </div>

      {/* ── 2D Spatial Heatmaps (Picking Density & Storage Cost per CBM) ──────── */}
      <div className="grid gap-6 xl:grid-cols-2">
        <WarehouseHeatmap
          title="Floor Picking Density Heatmap (2D Matrix)"
          subtitle="Aisle × Bay grid tracking pick frequency over trailing 30 days"
          rows={pickingDensity.rows}
          columns={pickingDensity.columns}
          matrix={pickingDensity.matrix}
          mode="density"
          unit="picks"
        />

        <WarehouseHeatmap
          title="Storage Profitability / Cost per CBM (Heatmap)"
          subtitle="2D matrix (Green = Fast moving profitable, Red = Stagnant dead space)"
          rows={profitabilityHeatmap.rows}
          columns={profitabilityHeatmap.columns}
          matrix={profitabilityHeatmap.matrix}
          mode="profitability"
          unit="pts"
        />
      </div>

      {/* ── Visualizations: Total Distribution Cost (TDC) & Capacity Forecast ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Total Distribution Cost (TDC) Line Graph */}
        <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1">
          <div className="mb-4">
            <h3 className="font-heading text-headline-md font-semibold text-on-surface">
              Total Distribution Cost (TDC) Trend
            </h3>
            <p className="font-body text-xs text-text-grey">
              Operational handling and logistics cost efficiency per unit and CBM shipped.
            </p>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={tdcData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="month" tick={{ fill: "#64748B", fontSize: 12 }} />
                <YAxis yAxisId="left" tick={{ fill: "#64748B", fontSize: 12 }} unit="₱" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#FFFFFF",
                    borderRadius: "8px",
                    border: "1px solid #E2E8F0",
                    fontFamily: "Outfit, sans-serif",
                  }}
                />
                <Legend wrapperStyle={{ paddingTop: "10px", fontSize: "12px" }} />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="costPerUnit"
                  name="TDC / Unit (₱)"
                  stroke="#2E4094"
                  strokeWidth={3}
                  dot={{ fill: "#2E4094", r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Space Utilization Forecasting Chart */}
        <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1">
          <div className="mb-4">
            <h3 className="font-heading text-headline-md font-semibold text-on-surface">
              Space Utilization &amp; Capacity Forecast
            </h3>
            <p className="font-body text-xs text-text-grey">
              Predictive growth trajectory toward 100% warehouse CBM capacity threshold.
            </p>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={spaceForecast.forecastPoints} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="date" tick={{ fill: "#64748B", fontSize: 12 }} />
                <YAxis tick={{ fill: "#64748B", fontSize: 12 }} unit=" m³" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#FFFFFF",
                    borderRadius: "8px",
                    border: "1px solid #E2E8F0",
                    fontFamily: "Outfit, sans-serif",
                  }}
                />
                <Legend wrapperStyle={{ paddingTop: "10px", fontSize: "12px" }} />
                <Area
                  type="monotone"
                  dataKey="occupiedCbm"
                  name="Occupied Space (CBM)"
                  stroke="#002060"
                  fill="#93C5FD"
                  fillOpacity={0.4}
                />
                <Line
                  type="monotone"
                  dataKey="capacityCbm"
                  name="Max Warehouse Capacity (CBM)"
                  stroke="#EF4444"
                  strokeDasharray="4 4"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useState, useMemo } from "react";
import {
  Calendar,
  Layers,
  ChevronDown,
  Info,
  SlidersHorizontal,
  Flame,
  Clock,
  AlertOctagon,
} from "lucide-react";
import type { HeatmapCellDatum, HeatmapMetricView, BinAuditRecord } from "./types";
import { generateHeatmapGrid } from "./data/seedData";
import { DayAuditDrawer } from "./DayAuditDrawer";

const BIN_ROWS = ["A1-01", "A1-02", "A1-03", "A1-04", "A1-05", "A1-06"];
const MONTHS = [
  { name: "Aug 2026", key: "Aug", year: 2026 },
  { name: "Jul 2026", key: "Jul", year: 2026 },
  { name: "Jun 2026", key: "Jun", year: 2026 },
];

export function MonthlyHeatmap() {
  const [selectedMonth, setSelectedMonth] = useState("Aug 2026");
  const [metricView, setMetricView] = useState<HeatmapMetricView>("pickActivity");
  const [selectedAuditRecord, setSelectedAuditRecord] = useState<BinAuditRecord | null>(null);
  const [showMonthMenu, setShowMonthMenu] = useState(false);
  const [mobileSelectedBin, setMobileSelectedBin] = useState("A1-01");

  const activeMonthConfig = MONTHS.find((m) => m.name === selectedMonth) ?? MONTHS[0];

  const gridData = useMemo(() => {
    return generateHeatmapGrid(activeMonthConfig.key, activeMonthConfig.year);
  }, [activeMonthConfig]);

  // Group cells by bin row
  const rowMap = useMemo(() => {
    const map: Record<string, HeatmapCellDatum[]> = {};
    BIN_ROWS.forEach((r) => {
      map[r] = [];
    });
    gridData.forEach((cell) => {
      if (map[cell.binRow]) {
        map[cell.binRow].push(cell);
      }
    });
    return map;
  }, [gridData]);

  // Color interpolators based on active view
  const getCellColor = (cell: HeatmapCellDatum) => {
    if (metricView === "pickActivity") {
      const val = cell.pickActivityCount;
      if (val === 0) return "bg-slate-100 text-slate-400";
      if (val < 10) return "bg-emerald-100 text-emerald-800 hover:bg-emerald-200";
      if (val < 25) return "bg-emerald-300 text-emerald-950 hover:bg-emerald-400";
      if (val < 40) return "bg-emerald-500 text-white hover:bg-emerald-600";
      return "bg-emerald-700 text-white hover:bg-emerald-800";
    }

    if (metricView === "inventoryAging") {
      const val = cell.inventoryAgingDays;
      if (val < 10) return "bg-slate-100 text-slate-700 hover:bg-slate-200";
      if (val < 20) return "bg-amber-100 text-amber-800 hover:bg-amber-200";
      if (val < 30) return "bg-amber-300 text-amber-950 hover:bg-amber-400";
      if (val < 40) return "bg-amber-500 text-white hover:bg-amber-600";
      return "bg-amber-600 text-white hover:bg-amber-700";
    }

    // Variance Rate
    const val = cell.varianceRatePct;
    if (val < 0.8) return "bg-slate-100 text-slate-600 hover:bg-slate-200";
    if (val < 1.8) return "bg-rose-100 text-rose-800 hover:bg-rose-200";
    if (val < 2.8) return "bg-rose-300 text-rose-950 hover:bg-rose-400";
    if (val < 3.5) return "bg-rose-500 text-white hover:bg-rose-600";
    return "bg-rose-700 text-white hover:bg-rose-800";
  };

  const getMetricDisplayValue = (cell: HeatmapCellDatum) => {
    switch (metricView) {
      case "pickActivity":
        return `${cell.pickActivityCount}`;
      case "inventoryAging":
        return `${cell.inventoryAgingDays}d`;
      case "varianceRate":
        return `${cell.varianceRatePct}%`;
    }
  };

  return (
    <div className="mb-6 rounded-2xl border border-slate-200/80 bg-surface-white p-5 shadow-sm">
      {/* Header & Controls */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-title-md font-bold text-brand-navy">
              Monthly Location Activity &amp; Rack Heatmap
            </h2>
            <span className="rounded-md bg-blue-50 px-2 py-0.5 font-mono text-[10px] font-bold text-brand-navy border border-blue-200/80">
              Racks A1-01 to A1-06
            </span>
          </div>
          <p className="mt-0.5 font-body text-xs text-text-grey">
            Cell-level shift telemetry across 31 days. Click any cell to inspect shift logs and SKUs.
          </p>
        </div>

        {/* View Switcher Tabs & Month Picker */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Metric View Switcher */}
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 font-label text-xs font-semibold">
            <button
              type="button"
              onClick={() => setMetricView("pickActivity")}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-all ${
                metricView === "pickActivity"
                  ? "bg-white text-emerald-800 font-bold shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Flame size={13} className={metricView === "pickActivity" ? "text-emerald-600" : "text-slate-400"} />
              <span>Pick Activity</span>
            </button>

            <button
              type="button"
              onClick={() => setMetricView("inventoryAging")}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-all ${
                metricView === "inventoryAging"
                  ? "bg-white text-amber-800 font-bold shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Clock size={13} className={metricView === "inventoryAging" ? "text-amber-600" : "text-slate-400"} />
              <span>Inventory Aging</span>
            </button>

            <button
              type="button"
              onClick={() => setMetricView("varianceRate")}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-all ${
                metricView === "varianceRate"
                  ? "bg-white text-rose-800 font-bold shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <AlertOctagon size={13} className={metricView === "varianceRate" ? "text-rose-600" : "text-slate-400"} />
              <span>Variance Rate</span>
            </button>
          </div>

          {/* Month Selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMonthMenu(!showMonthMenu)}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 font-label text-xs font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-navy shadow-2xs"
            >
              <Calendar size={13} className="text-brand-navy/70" />
              <span>{selectedMonth}</span>
              <ChevronDown size={13} className="text-slate-400" />
            </button>

            {showMonthMenu && (
              <div className="absolute right-0 z-30 mt-1 w-36 rounded-xl border border-slate-200 bg-white p-1 shadow-elevation-3 animate-in fade-in">
                {MONTHS.map((m) => (
                  <button
                    key={m.name}
                    type="button"
                    onClick={() => {
                      setSelectedMonth(m.name);
                      setShowMonthMenu(false);
                    }}
                    className={`flex w-full items-center rounded-lg px-2.5 py-1.5 text-left font-label text-xs ${
                      selectedMonth === m.name ? "bg-blue-50 text-brand-navy font-bold" : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 📱 MOBILE 31-DAY BIN CALENDAR VIEW (< 1024px)                       */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="mt-4 block lg:hidden space-y-3">
        {/* Bin Row Selector Dropdown */}
        <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
          <span className="font-label text-xs font-bold text-slate-700">Select Rack Row:</span>
          <select
            value={mobileSelectedBin}
            onChange={(e) => setMobileSelectedBin(e.target.value)}
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 font-mono text-xs font-bold text-brand-navy shadow-xs focus:ring-2 focus:ring-brand-navy"
          >
            {BIN_ROWS.map((row) => (
              <option key={row} value={row}>
                Rack Row {row}
              </option>
            ))}
          </select>
        </div>

        {/* 31-Day Visual Calendar Grid (Large Glove-Friendly Tiles) */}
        <div className="grid grid-cols-7 gap-1.5 pt-1">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <div key={i} className="text-center font-label text-[10px] font-bold text-text-grey uppercase">
              {d}
            </div>
          ))}
          {(rowMap[mobileSelectedBin] || []).map((cell) => {
            const colorClass = getCellColor(cell);
            return (
              <button
                key={`${cell.binRow}-${cell.day}`}
                type="button"
                onClick={() => {
                  const recordWithCurrentMetric = {
                    ...cell.auditRecord,
                    metricType: metricView,
                    metricFormatted:
                      metricView === "pickActivity"
                        ? `${cell.pickActivityCount} picks/hr`
                        : metricView === "inventoryAging"
                        ? `${cell.inventoryAgingDays} days dwell`
                        : `${cell.varianceRatePct}% variance`,
                  };
                  setSelectedAuditRecord(recordWithCurrentMetric);
                }}
                className={`flex min-h-[48px] flex-col items-center justify-center rounded-xl p-1 font-mono text-xs font-bold shadow-2xs active:scale-95 transition-transform ${colorClass}`}
              >
                <span className="text-[10px] opacity-75 leading-none">D{cell.day}</span>
                <span className="text-xs font-black mt-0.5 leading-none">{getMetricDisplayValue(cell)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 🖥️ DESKTOP CONTINUOUS 31-DAY MATRIX (>= 1024px)                     */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="mt-4 hidden lg:block overflow-x-auto pb-2">
        <div className="min-w-[900px]">
          {/* Day Numbers Header Row (1 to 31) */}
          <div className="flex items-center gap-1 mb-1.5">
            <div className="w-16 shrink-0 font-label text-[11px] font-bold text-text-grey uppercase tracking-wider text-right pr-2">
              Rack Row
            </div>
            <div
              className="flex-1 gap-1"
              style={{ display: "grid", gridTemplateColumns: "repeat(31, minmax(22px, 1fr))" }}
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
                const isWeekend = (day + 5) % 7 === 0 || (day + 5) % 7 === 6;
                return (
                  <div
                    key={day}
                    className={`text-center font-mono text-[10px] font-bold rounded-xs py-0.5 ${
                      isWeekend ? "bg-slate-200/70 text-slate-700 font-black" : "text-text-grey"
                    }`}
                    title={isWeekend ? `Day ${day} (Weekend)` : `Day ${day}`}
                  >
                    {day}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bin Rows (A1-01 to A1-06) */}
          <div className="space-y-1.5">
            {BIN_ROWS.map((row) => (
              <div key={row} className="flex items-center gap-1">
                {/* Y-Axis Label */}
                <div className="w-16 shrink-0 font-mono text-xs font-bold text-slate-800 text-right pr-2">
                  {row}
                </div>

                {/* 31 Day Cells */}
                <div
                  className="flex-1 gap-1"
                  style={{ display: "grid", gridTemplateColumns: "repeat(31, minmax(22px, 1fr))" }}
                >
                  {(rowMap[row] || []).map((cell) => {
                    const colorClass = getCellColor(cell);
                    return (
                      <button
                        key={`${cell.binRow}-${cell.day}`}
                        type="button"
                        onClick={() => {
                          const recordWithCurrentMetric = {
                            ...cell.auditRecord,
                            metricType: metricView,
                            metricFormatted:
                              metricView === "pickActivity"
                                ? `${cell.pickActivityCount} picks/hr`
                                : metricView === "inventoryAging"
                                ? `${cell.inventoryAgingDays} days dwell`
                                : `${cell.varianceRatePct}% variance`,
                          };
                          setSelectedAuditRecord(recordWithCurrentMetric);
                        }}
                        className={`group relative h-8 rounded-md flex items-center justify-center font-mono text-[10px] font-bold transition-all transform hover:scale-115 hover:z-20 cursor-pointer shadow-2xs ${colorClass}`}
                        title={`Bin ${cell.binRow} | Day ${cell.day} | ${getMetricDisplayValue(cell)}`}
                      >
                        <span>{getMetricDisplayValue(cell)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Heatmap Legend & Interactive Note */}
      <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-label font-bold text-text-grey text-[11px] uppercase tracking-wider">
            {metricView === "pickActivity" ? "Scan Intensity:" : metricView === "inventoryAging" ? "Dwell Aging:" : "Variance Severity:"}
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-text-grey font-medium">Low</span>
            <div className="flex items-center gap-1">
              <span className={`h-3 w-5 rounded-xs ${metricView === "pickActivity" ? "bg-emerald-100" : metricView === "inventoryAging" ? "bg-amber-100" : "bg-rose-100"}`}></span>
              <span className={`h-3 w-5 rounded-xs ${metricView === "pickActivity" ? "bg-emerald-300" : metricView === "inventoryAging" ? "bg-amber-300" : "bg-rose-300"}`}></span>
              <span className={`h-3 w-5 rounded-xs ${metricView === "pickActivity" ? "bg-emerald-500" : metricView === "inventoryAging" ? "bg-amber-500" : "bg-rose-500"}`}></span>
              <span className={`h-3 w-5 rounded-xs ${metricView === "pickActivity" ? "bg-emerald-700" : metricView === "inventoryAging" ? "bg-amber-700" : "bg-rose-700"}`}></span>
            </div>
            <span className="text-[10px] text-text-grey font-medium">High</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-text-grey text-[11px] font-medium">
          <Info size={13} className="text-slate-400" />
          <span>Click any cell to open the real-time shift audit inspector</span>
        </div>
      </div>

      {/* Slide-over Audit Drawer */}
      <DayAuditDrawer
        record={selectedAuditRecord}
        metricView={metricView}
        onClose={() => setSelectedAuditRecord(null)}
      />
    </div>
  );
}

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
import { DayAuditDrawer } from "./DayAuditDrawer";

interface MonthlyHeatmapProps {
  initialGrid?: HeatmapCellDatum[][];
}

const DEFAULT_BIN_ROWS = ["A1-01", "A1-02", "A1-03", "A1-04", "A1-05", "A1-06"];
const MONTHS = [
  { name: "Aug 2026", key: "Aug", year: 2026 },
  { name: "Jul 2026", key: "Jul", year: 2026 },
  { name: "Jun 2026", key: "Jun", year: 2026 },
];

export function MonthlyHeatmap({ initialGrid }: MonthlyHeatmapProps) {
  const [selectedMonth, setSelectedMonth] = useState("Aug 2026");
  const [metricView, setMetricView] = useState<HeatmapMetricView>("pickActivity");
  const [selectedAuditRecord, setSelectedAuditRecord] = useState<BinAuditRecord | null>(null);
  const [showMonthMenu, setShowMonthMenu] = useState(false);
  const [mobileSelectedBin, setMobileSelectedBin] = useState("A1-01");

  // Generate fallback grid if no server data
  const fallbackGrid = useMemo(() => {
    const grid: HeatmapCellDatum[][] = [];
    const days = 31;
    for (let r = 0; r < DEFAULT_BIN_ROWS.length; r++) {
      const row: HeatmapCellDatum[] = [];
      const binName = DEFAULT_BIN_ROWS[r];
      for (let day = 1; day <= days; day++) {
        const isWeekend = (day % 7 === 1 || day % 7 === 2);
        const basePick = isWeekend ? Math.floor(Math.random() * 4) : 10 + Math.floor(Math.random() * 35);
        row.push({
          binRow: binName,
          day,
          isWeekend,
          pickActivityCount: basePick,
          inventoryAgingDays: 5 + Math.floor(Math.random() * 45),
          varianceRatePct: Math.random() < 0.1 ? Number((Math.random() * 4.5).toFixed(1)) : 0,
          auditRecord: {
            binId: binName,
            date: `2026-08-${String(day).padStart(2, "0")}`,
            dayNumber: day,
            monthName: "August",
            year: 2026,
            metricType: "pickActivity",
            metricValue: basePick,
            metricFormatted: `${basePick} Picks`,
            status: basePick > 35 ? "critical" : basePick > 20 ? "warning" : basePick > 0 ? "normal" : "idle",
            activities: [
              {
                sku: "SKU-DSGC-8841",
                itemName: "Industrial High-Torque Servo Drive 400W",
                action: "PICK",
                qty: Math.max(1, Math.floor(basePick / 3)),
                uom: "piece",
                lotNumber: `LOT-2026-08${String(day).padStart(2, "0")}-01`,
                timestamp: `2026-08-${String(day).padStart(2, "0")} 09:14:22`,
                operatorBadge: "OP-4819 (M. Santos)",
              },
            ],
          },
        });
      }
      grid.push(row);
    }
    return grid;
  }, []);

  const gridData = initialGrid && initialGrid.length > 0 ? initialGrid : fallbackGrid;
  const binRowNames = gridData.map((r) => (r[0] ? r[0].binRow : "BIN"));

  // Group cells by bin row
  const rowMap = useMemo(() => {
    const map: Record<string, HeatmapCellDatum[]> = {};
    gridData.forEach((row) => {
      if (row.length > 0) {
        map[row[0].binRow] = row;
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
      if (val < 15) return "bg-blue-100 text-blue-800 hover:bg-blue-200";
      if (val < 30) return "bg-blue-300 text-blue-950 hover:bg-blue-400";
      if (val < 45) return "bg-amber-300 text-amber-950 hover:bg-amber-400";
      return "bg-rose-500 text-white hover:bg-rose-600";
    }

    // varianceRate
    const val = cell.varianceRatePct;
    if (val === 0) return "bg-slate-100 text-slate-500 hover:bg-slate-200";
    if (val < 2.0) return "bg-amber-200 text-amber-950 hover:bg-amber-300";
    return "bg-rose-500 text-white hover:bg-rose-600 animate-pulse";
  };

  const getCellDisplayVal = (cell: HeatmapCellDatum) => {
    if (metricView === "pickActivity") return cell.pickActivityCount || "";
    if (metricView === "inventoryAging") return `${cell.inventoryAgingDays}d`;
    return cell.varianceRatePct > 0 ? `${cell.varianceRatePct}%` : "—";
  };

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-surface-white p-5 shadow-sm space-y-4">
      {/* ── Top Header & Global Toolbar ────────────────────────────────────── */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-title-md font-bold text-brand-navy flex items-center gap-2">
              <Flame size={19} className="text-amber-500" />
              <span>Location Intelligence &amp; Bin Activity Heatmap</span>
            </h2>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-700">
              31-Day Activity Matrix
            </span>
          </div>
          <p className="mt-0.5 font-body text-xs text-text-grey">
            Color intensity maps pick volume velocity, dwell time aging, and stock variance audits
          </p>
        </div>

        {/* View Switches & Month Selector */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Metric View Segmented Control */}
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 font-label text-xs font-semibold">
            <button
              type="button"
              onClick={() => setMetricView("pickActivity")}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition-all ${
                metricView === "pickActivity"
                  ? "bg-white text-brand-navy font-bold shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Flame size={12} className={metricView === "pickActivity" ? "text-amber-500" : ""} />
              <span>Picks Velocity</span>
            </button>

            <button
              type="button"
              onClick={() => setMetricView("inventoryAging")}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition-all ${
                metricView === "inventoryAging"
                  ? "bg-white text-brand-navy font-bold shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Clock size={12} className={metricView === "inventoryAging" ? "text-blue-500" : ""} />
              <span>Aging Dwell</span>
            </button>

            <button
              type="button"
              onClick={() => setMetricView("varianceRate")}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition-all ${
                metricView === "varianceRate"
                  ? "bg-white text-brand-navy font-bold shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <AlertOctagon size={12} className={metricView === "varianceRate" ? "text-rose-500" : ""} />
              <span>Variance Audit</span>
            </button>
          </div>

          {/* Month Selector Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMonthMenu(!showMonthMenu)}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs font-bold text-slate-800 shadow-2xs hover:bg-slate-50"
            >
              <Calendar size={13} className="text-slate-500" />
              <span>{selectedMonth}</span>
              <ChevronDown size={13} className="text-slate-400" />
            </button>

            {showMonthMenu && (
              <div className="absolute right-0 top-full mt-1.5 z-30 w-36 rounded-xl border border-slate-200 bg-white p-1.5 shadow-elevation-3 font-mono text-xs">
                {MONTHS.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => {
                      setSelectedMonth(m.name);
                      setShowMonthMenu(false);
                    }}
                    className={`w-full rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                      selectedMonth === m.name
                        ? "bg-blue-50 font-bold text-brand-navy"
                        : "hover:bg-slate-100 text-slate-700"
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

      {/* ── 🖥️ DESKTOP 31-DAY HEATMAP MATRIX (>= 1024px) ──────────────────── */}
      <div className="hidden lg:block overflow-x-auto pb-2">
        <div className="min-w-[900px]">
          {/* Day Numbers Column Header (1 - 31) */}
          <div className="flex items-center gap-1 mb-1.5 pl-20">
            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
              const isWeekend = day % 7 === 1 || day % 7 === 2;
              return (
                <div
                  key={day}
                  className={`flex-1 text-center font-mono text-[10px] font-bold ${
                    isWeekend ? "text-slate-400" : "text-slate-700"
                  }`}
                >
                  {day}
                </div>
              );
            })}
          </div>

          {/* Heatmap Bin Rows */}
          <div className="space-y-1.5">
            {binRowNames.map((binRow) => {
              const cells = rowMap[binRow] ?? [];
              return (
                <div key={binRow} className="flex items-center gap-1">
                  {/* Bin Row Label (Sticky Left) */}
                  <div className="w-20 shrink-0 font-mono text-xs font-black text-brand-navy bg-slate-50 py-1.5 px-2 rounded-lg border border-slate-200/70 truncate">
                    {binRow}
                  </div>

                  {/* 31 Day Cells */}
                  <div className="flex-1 flex items-center gap-1">
                    {cells.map((cell) => {
                      const colorClass = getCellColor(cell);
                      const displayVal = getCellDisplayVal(cell);
                      return (
                        <button
                          key={cell.day}
                          type="button"
                          onClick={() => setSelectedAuditRecord(cell.auditRecord)}
                          title={`${cell.binRow} · Day ${cell.day}: ${cell.pickActivityCount} picks, ${cell.inventoryAgingDays}d aging, ${cell.varianceRatePct}% var`}
                          className={`flex-1 h-8 min-w-[24px] rounded-md font-mono text-[10px] font-bold flex items-center justify-center transition-transform hover:scale-110 active:scale-95 shadow-2xs cursor-pointer ${colorClass}`}
                        >
                          <span className="truncate">{displayVal}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── 📱 MOBILE SCROLLABLE BIN HEATMAP (< 1024px) ────────────────────── */}
      <div className="block lg:hidden space-y-3">
        {/* Bin Selector Pills for Mobile */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {binRowNames.map((bin) => (
            <button
              key={bin}
              type="button"
              onClick={() => setMobileSelectedBin(bin)}
              className={`rounded-xl px-3 py-1.5 font-mono text-xs font-bold shrink-0 transition-all ${
                mobileSelectedBin === bin
                  ? "bg-brand-navy text-white shadow-2xs"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {bin}
            </button>
          ))}
        </div>

        {/* 7-column Calendar Grid for selected mobile bin */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-xs font-black text-brand-navy">
              Bin {mobileSelectedBin} (August 2026)
            </span>
            <span className="text-[11px] text-text-grey font-medium">
              Tap day for audit log
            </span>
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {(rowMap[mobileSelectedBin] ?? []).map((cell) => {
              const colorClass = getCellColor(cell);
              const displayVal = getCellDisplayVal(cell);
              return (
                <button
                  key={cell.day}
                  type="button"
                  onClick={() => setSelectedAuditRecord(cell.auditRecord)}
                  className={`flex flex-col items-center justify-between p-1.5 min-h-[48px] rounded-xl font-mono shadow-2xs active:scale-95 transition-transform ${colorClass}`}
                >
                  <span className="text-[10px] opacity-75 font-semibold">
                    {cell.day}
                  </span>
                  <span className="text-xs font-black truncate">
                    {displayVal}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Dynamic Legend Bar ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs text-text-grey font-label">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-700">Intensity Legend:</span>
          {metricView === "pickActivity" && (
            <div className="flex items-center gap-1.5 font-mono text-[11px]">
              <span className="h-3 w-3 rounded bg-slate-100 border border-slate-200"></span>
              <span>0</span>
              <span className="h-3 w-3 rounded bg-emerald-100"></span>
              <span>&lt;10</span>
              <span className="h-3 w-3 rounded bg-emerald-300"></span>
              <span>10-25</span>
              <span className="h-3 w-3 rounded bg-emerald-500"></span>
              <span>25-40</span>
              <span className="h-3 w-3 rounded bg-emerald-700"></span>
              <span>40+</span>
            </div>
          )}

          {metricView === "inventoryAging" && (
            <div className="flex items-center gap-1.5 font-mono text-[11px]">
              <span className="h-3 w-3 rounded bg-blue-100"></span>
              <span>&lt;15d</span>
              <span className="h-3 w-3 rounded bg-blue-300"></span>
              <span>15-30d</span>
              <span className="h-3 w-3 rounded bg-amber-300"></span>
              <span>30-45d</span>
              <span className="h-3 w-3 rounded bg-rose-500"></span>
              <span>45d+</span>
            </div>
          )}

          {metricView === "varianceRate" && (
            <div className="flex items-center gap-1.5 font-mono text-[11px]">
              <span className="h-3 w-3 rounded bg-slate-100"></span>
              <span>0% (Matched)</span>
              <span className="h-3 w-3 rounded bg-amber-200"></span>
              <span>&lt;2% Variance</span>
              <span className="h-3 w-3 rounded bg-rose-500"></span>
              <span>2%+ Discrepancy</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 text-[11px] text-slate-500">
          <Info size={13} />
          <span>Click any day to open full immutable audit trail drawer</span>
        </div>
      </div>

      {/* ── Immutable Day Audit Drawer ────────────────────────────────────── */}
      <DayAuditDrawer
        record={selectedAuditRecord}
        metricView={metricView}
        onClose={() => setSelectedAuditRecord(null)}
      />
    </div>
  );
}

"use client";

import React, { useState } from "react";

export type HeatmapCell = {
  row: string; // e.g. "Aisle A"
  col: string; // e.g. "Bay 01"
  value: number; // Density count or CBM profit/cost index
  label?: string;
  meta?: string;
  status?: "fast" | "normal" | "slow" | "dead";
};

export type WarehouseHeatmapProps = {
  title: string;
  subtitle?: string;
  rows: string[];
  columns: string[];
  matrix: HeatmapCell[];
  mode?: "density" | "profitability";
  unit?: string;
  valueFormatter?: (val: number) => string;
};

export function WarehouseHeatmap({
  title,
  subtitle,
  rows,
  columns,
  matrix,
  mode = "density",
  unit = "picks",
  valueFormatter = (v) => `${v.toLocaleString()}`,
}: WarehouseHeatmapProps) {
  const [hoveredCell, setHoveredCell] = useState<HeatmapCell | null>(null);

  // Compute min/max to normalize colors
  const values = matrix.map((c) => c.value);
  const maxVal = Math.max(...values, 1);
  const minVal = Math.min(...values, 0);

  const getCellData = (row: string, col: string): HeatmapCell => {
    const found = matrix.find((m) => m.row === row && m.col === col);
    return found || { row, col, value: 0 };
  };

  // Color generator based on mode
  const getCellColor = (val: number) => {
    if (val === 0) return "bg-slate-100 text-slate-400";
    const ratio = Math.min(1, Math.max(0, (val - minVal) / (maxVal - minVal || 1)));

    if (mode === "profitability") {
      // High value = green/fast, Low value = red/dead
      if (ratio > 0.75) return "bg-emerald-600 text-white";
      if (ratio > 0.5) return "bg-emerald-400 text-emerald-950";
      if (ratio > 0.25) return "bg-amber-300 text-amber-950";
      return "bg-rose-500 text-white";
    }

    // Density mode: Navy blue gradient
    if (ratio > 0.75) return "bg-brand-navy text-white font-bold";
    if (ratio > 0.5) return "bg-brand-royal-blue text-white";
    if (ratio > 0.25) return "bg-blue-300 text-blue-950";
    return "bg-blue-100 text-blue-900";
  };

  return (
    <div className="w-full rounded-xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-heading text-headline-md font-semibold text-on-surface">
            {title}
          </h3>
          {subtitle && (
            <p className="font-body text-xs text-text-grey">{subtitle}</p>
          )}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-xs font-medium text-text-grey">
          <span>Low ({minVal})</span>
          <div className="flex h-3 w-28 overflow-hidden rounded">
            {mode === "profitability" ? (
              <>
                <div className="flex-1 bg-rose-500" />
                <div className="flex-1 bg-amber-300" />
                <div className="flex-1 bg-emerald-400" />
                <div className="flex-1 bg-emerald-600" />
              </>
            ) : (
              <>
                <div className="flex-1 bg-blue-100" />
                <div className="flex-1 bg-blue-300" />
                <div className="flex-1 bg-brand-royal-blue" />
                <div className="flex-1 bg-brand-navy" />
              </>
            )}
          </div>
          <span>High ({maxVal})</span>
        </div>
      </div>

      {/* 2D Grid Table */}
      <div className="relative overflow-x-auto">
        <table className="w-full border-collapse text-center">
          <thead>
            <tr>
              <th className="p-2 text-left font-label text-xs font-semibold text-text-grey">
                Location
              </th>
              {columns.map((col) => (
                <th
                  key={col}
                  className="p-2 font-mono text-xs font-medium text-text-grey"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row} className="border-t border-slate-100">
                <td className="p-2 text-left font-label text-xs font-semibold text-on-surface whitespace-nowrap">
                  {row}
                </td>
                {columns.map((col) => {
                  const cell = getCellData(row, col);
                  return (
                    <td key={`${row}-${col}`} className="p-1">
                      <button
                        type="button"
                        onMouseEnter={() => setHoveredCell(cell)}
                        onMouseLeave={() => setHoveredCell(null)}
                        className={`h-9 w-full min-w-12 rounded flex items-center justify-center font-mono text-xs transition-all hover:ring-2 hover:ring-brand-navy ${getCellColor(
                          cell.value
                        )}`}
                      >
                        {cell.value > 0 ? valueFormatter(cell.value) : "—"}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cell Hover Summary Footer */}
      <div className="mt-3 flex min-h-6 items-center justify-between border-t border-slate-100 pt-2 text-xs">
        {hoveredCell ? (
          <p className="font-mono text-brand-navy font-semibold">
            {hoveredCell.row} &gt; {hoveredCell.col}:{" "}
            <span className="text-on-surface font-normal">
              {valueFormatter(hoveredCell.value)} {unit} {hoveredCell.meta ? `(${hoveredCell.meta})` : ""}
            </span>
          </p>
        ) : (
          <p className="text-text-grey italic">Hover over any warehouse rack cell to view details</p>
        )}
      </div>
    </div>
  );
}

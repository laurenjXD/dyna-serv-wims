"use client";

// 2026-08-19 redesign: was a GitHub-contribution-style 364-day strip (tiny
// 12px cells, horizontal scroll, no weekday alignment or in-cell date
// numbers) — reported as too compact/dated. Redesigned as a proper
// calendar-aligned grid: 12 weeks (not 364 days), weekday-column-aligned
// (Sun-Sat), larger rounded cells with the day-of-month number shown
// in-cell, no horizontal scroll needed. Same props/data contract as
// before — callers (HomeDashboardHeatmapSection, reports' HeatmapSection)
// are unaffected beyond their title string.

import { useState } from "react";
import type { FlowType } from "./types";
import { heatmapLegend, heatmapLevel } from "./utils";

type HeatmapDatum = { date: string; count: number };
type DayCell = { date: string; count: number; dayOfMonth: number } | null;

const filters: { value: FlowType; label: string }[] = [
  { value: "all", label: "All" }, { value: "vmi", label: "VMI" },
  { value: "trading", label: "Trading" }, { value: "supplies", label: "Supplies" },
];
const levelClasses = ["bg-slate-100", "bg-brand-navy/15", "bg-brand-navy/35", "bg-brand-navy/60", "bg-brand-navy/85"];
const levelTextClasses = ["text-text-grey", "text-on-surface", "text-on-surface", "text-surface-white", "text-surface-white"];
const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKS_SHOWN = 12;

function buildWeeks(values: Map<string, number>): DayCell[][] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const totalDays = WEEKS_SHOWN * 7;
  const start = new Date(today);
  start.setDate(start.getDate() - (totalDays - 1));
  // Pad so the grid's first column is always Sunday, matching the weekday
  // header row, regardless of which weekday `start` actually falls on.
  const leadingPad = start.getDay();

  const cells: DayCell[] = Array.from({ length: leadingPad }, () => null);
  for (let i = 0; i < totalDays; i++) {
    const date = new Date(start);
    date.setDate(date.getDate() + i);
    const key = date.toISOString().slice(0, 10);
    cells.push({ date: key, count: values.get(key) ?? 0, dayOfMonth: date.getDate() });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: DayCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function ActivityHeatmap({ data, flowFilter, onFilterChange, title }: {
  data: HeatmapDatum[]; flowFilter: FlowType; onFilterChange: (filter: FlowType) => void; title: string;
}) {
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const values = new Map(data.map((item) => [item.date, item.count]));
  const weeks = buildWeeks(values);

  return <section className="rounded-xl bg-surface-white p-6 shadow-elevation-1">
    <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Heatmap flow filter">
      {filters.map((filter) => <button key={filter.value} type="button" role="tab" aria-selected={flowFilter === filter.value}
        onClick={() => onFilterChange(filter.value)} className={`rounded-full px-4 py-2 font-label text-label font-semibold ${flowFilter === filter.value ? "bg-primary text-surface-white" : "bg-surface-light-grey text-on-surface"}`}>
        {filter.label}
      </button>)}
    </div>
    <div role="grid" aria-label={title} className="grid grid-cols-7 gap-2">
      {WEEKDAY_LABELS.map((label, index) => (
        <div key={`weekday-${index}`} role="columnheader" aria-hidden="true"
          className="pb-1 text-center font-label text-label font-semibold text-text-grey">
          {label}
        </div>
      ))}
      {weeks.map((week, weekIndex) =>
        week.map((item, dayIndex) => {
          if (!item) {
            return <div key={`empty-${weekIndex}-${dayIndex}`} aria-hidden="true" />;
          }
          const level = heatmapLevel(item.count);
          return (
            <button key={item.date} type="button" role="gridcell" tabIndex={0}
              aria-label={`${item.date}: ${item.count} transactions`}
              onFocus={() => setActiveDate(item.date)} onBlur={() => setActiveDate(null)}
              onClick={() => setActiveDate((current) => (current === item.date ? null : item.date))}
              className={`relative flex aspect-square min-h-10 w-full items-center justify-center rounded-lg font-mono text-mono-sm font-semibold ${levelClasses[level]} ${levelTextClasses[level]} transition-transform duration-150 hover:scale-105 focus:z-10 focus:outline-none focus:ring-2 focus:ring-brand-navy`}>
              {item.dayOfMonth}
              {activeDate === item.date && <span role="status"
                className="absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-on-surface px-2 py-1 font-body text-body-sm text-surface-white shadow-elevation-2">
                <span className="font-mono">{item.count}</span> transactions on {item.date}
              </span>}
            </button>
          );
        }),
      )}
    </div>
    <div className="mt-4 flex flex-wrap items-center gap-3" aria-label="Transaction volume legend">
      {heatmapLegend.map((entry) => <span key={entry.label} className="flex items-center gap-1 font-label text-label text-text-grey"><span className={`h-3 w-3 rounded-sm ${entry.className}`} aria-hidden="true" />{entry.label}</span>)}
    </div>
  </section>;
}

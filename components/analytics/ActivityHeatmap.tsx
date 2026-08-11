"use client";

import { useState } from "react";
import type { FlowType } from "./types";
import { heatmapLegend, heatmapLevel } from "./utils";

type HeatmapDatum = { date: string; count: number };
const filters: { value: FlowType; label: string }[] = [
  { value: "all", label: "All" }, { value: "vmi", label: "VMI" },
  { value: "trading", label: "Trading" }, { value: "supplies", label: "Supplies" },
];
const levelClasses = ["bg-slate-100", "bg-primary/15", "bg-primary/35", "bg-primary/60", "bg-primary/85"];

export function ActivityHeatmap({ data, flowFilter, onFilterChange, title }: {
  data: HeatmapDatum[]; flowFilter: FlowType; onFilterChange: (filter: FlowType) => void; title: string;
}) {
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const values = new Map(data.map((item) => [item.date, item.count]));
  const visible = Array.from({ length: 364 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (363 - index));
    const key = date.toISOString().slice(0, 10);
    return { date: key, count: values.get(key) ?? 0 };
  });
  return <section className="rounded bg-white p-6 shadow-elevation-1">
    <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Heatmap flow filter">
      {filters.map((filter) => <button key={filter.value} type="button" role="tab" aria-selected={flowFilter === filter.value}
        onClick={() => onFilterChange(filter.value)} className={`rounded px-4 py-2 font-label text-label font-semibold ${flowFilter === filter.value ? "bg-action-blue text-white" : "bg-surface-dim text-on-surface"}`}>
        {filter.label}
      </button>)}
    </div>
    <div role="grid" aria-label={title} className="grid grid-flow-col grid-rows-7 auto-cols-[minmax(12px,1fr)] gap-0.5 overflow-x-auto pb-3">
      {visible.map((item) => <button key={item.date} type="button" role="gridcell" tabIndex={0} aria-label={`${item.date}: ${item.count} transactions`}
        onFocus={() => setActiveDate(item.date)} onBlur={() => setActiveDate(null)} onClick={() => setActiveDate(item.date)}
        className={`relative aspect-square min-h-3 min-w-3 rounded-sm ${levelClasses[heatmapLevel(item.count)]} focus:z-10 focus:outline-none focus:ring-2 focus:ring-primary`}>
        {activeDate === item.date && <span role="status" className="absolute bottom-full left-0 z-20 mb-2 whitespace-nowrap rounded bg-on-surface px-2 py-1 font-body text-body-sm text-white shadow-elevation-2">
          <span className="font-mono">{item.count}</span> transactions on {item.date}
        </span>}
      </button>)}
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-3" aria-label="Transaction volume legend">
      {heatmapLegend.map((entry) => <span key={entry.label} className="flex items-center gap-1 font-label text-label text-on-surface-variant"><span className={`h-3 w-3 rounded-sm ${entry.className}`} aria-hidden="true" />{entry.label}</span>)}
    </div>
  </section>;
}

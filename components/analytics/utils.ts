import type { StatusToken, Trend } from "./types";

export function trendLabel(trend: Trend): string {
  return `${trend.direction} ${trend.pct}% from prior period`;
}

export function trendSymbol(direction: Trend["direction"]): string {
  return direction === "up" ? "↑" : direction === "down" ? "↓" : "→";
}

export function trendClass(direction: Trend["direction"]): string {
  return direction === "up"
    ? "text-status-available"
    : direction === "down"
      ? "text-status-held"
      : "text-status-neutral";
}

export function statusClass(status: StatusToken): string {
  return {
    available: "bg-status-available/15 text-status-available",
    pending: "bg-status-pending/20 text-on-surface",
    held: "bg-status-held/15 text-status-held",
    neutral: "bg-status-neutral/15 text-status-neutral",
    expired: "bg-brand-royal-blue/15 text-brand-royal-blue",
  }[status];
}

export function heatmapLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count <= 10) return 1;
  if (count <= 50) return 2;
  if (count <= 100) return 3;
  return 4;
}

export const heatmapLegend = [
  { label: "0", className: "bg-slate-100" },
  { label: "1–10", className: "bg-brand-navy/15" },
  { label: "11–50", className: "bg-brand-navy/35" },
  { label: "51–100", className: "bg-brand-navy/60" },
  { label: ">100", className: "bg-brand-navy/85" },
] as const;

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

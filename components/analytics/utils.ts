import type { StatusToken, Trend } from "./types";

export function trendLabel(trend: Trend): string {
  return `${trend.direction} ${trend.pct}% from prior period`;
}

export function trendSymbol(direction: Trend["direction"]): string {
  return direction === "up" ? "↑" : direction === "down" ? "↓" : "→";
}

export function trendClass(direction: Trend["direction"]): string {
  return direction === "up"
    ? "text-status-success"
    : direction === "down"
      ? "text-status-error"
      : "text-status-neutral";
}

export function statusClass(status: StatusToken): string {
  return {
    available: "bg-status-success/15 text-status-success",
    pending: "bg-status-warning/20 text-on-surface",
    held: "bg-status-error/15 text-status-error",
    neutral: "bg-status-neutral/15 text-status-neutral",
    expired: "bg-secondary/15 text-secondary",
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
  { label: "1–10", className: "bg-primary/15" },
  { label: "11–50", className: "bg-primary/35" },
  { label: "51–100", className: "bg-primary/60" },
  { label: ">100", className: "bg-primary/85" },
] as const;

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

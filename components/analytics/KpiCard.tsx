import Link from "next/link";
import type { ReactNode } from "react";
import type { StatusToken, Trend } from "./types";
import { trendClass, trendLabel, trendSymbol } from "./utils";

// brand-design-system.md §1.1a: brand/structural colors (brand-royal-blue
// included) are never text color. DonutChart.tsx's `stroke-brand-royal-blue/50`
// for "expired" is a legitimate chart-mark use of that same token (§12's
// exception) and stays as-is — this is specifically about the KPI figure's
// *text* color, which has no such exception. "expired" is treated as
// held-equivalent severity here, matching inventory/page.tsx's existing
// STATUS_CLASSES mapping (expired -> status-held).
const valueClass: Record<StatusToken, string> = {
  available: "text-status-available",
  pending: "text-status-pending",
  held: "text-status-held",
  neutral: "text-status-neutral",
  expired: "text-status-held",
};

export type KpiCardProps = {
  label: string;
  value: number | string;
  trend: Trend;
  icon: ReactNode;
  statusColor?: StatusToken;
  linkTo?: string;
};

export function KpiCard({ label, value, trend, icon, statusColor, linkTo }: KpiCardProps) {
  const ariaLabel = `${label}: ${value}, ${trendLabel(trend)}`;
  const content = (
    <div
      aria-label={ariaLabel}
      className="group rounded bg-surface-white p-6 shadow-elevation-1 transition-transform duration-150 hover:scale-[1.02] focus-within:ring-2 focus-within:ring-brand-navy"
    >
      <div className="mb-4 flex items-center text-brand-navy" aria-hidden="true">{icon}</div>
      <div className={`font-heading text-data-display font-semibold ${statusColor ? valueClass[statusColor] : "text-on-surface"}`}>
        {value}
      </div>
      <div className="mt-2 font-label text-label font-semibold uppercase tracking-[0.05em] text-text-grey">{label}</div>
      <div className={`mt-4 flex items-center gap-2 font-label text-body-sm font-semibold ${trendClass(trend.direction)}`}>
        <span aria-hidden="true" className="text-body-lg">{trendSymbol(trend.direction)}</span>
        <span>{trend.pct}% {trend.direction === "flat" ? "no change" : trend.direction === "up" ? "increase" : "decrease"}</span>
      </div>
    </div>
  );
  return linkTo ? <Link href={linkTo} className="block focus:outline-none">{content}</Link> : content;
}

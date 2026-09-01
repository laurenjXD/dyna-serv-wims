import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import type { Trend } from "./types";
import { trendClass, trendLabel, trendSymbol } from "./utils";

export type KpiTileAccent = "royal-blue" | "available" | "pending" | "navy" | "red" | "neutral";

const accentClass: Record<KpiTileAccent, string> = {
  "royal-blue": "bg-blue-50 text-brand-royal-blue border border-blue-100",
  available: "bg-emerald-50 text-status-available border border-emerald-100",
  pending: "bg-amber-50 text-amber-600 border border-amber-100",
  navy: "bg-slate-100 text-brand-navy border border-slate-200",
  red: "bg-rose-50 text-brand-red border border-rose-100",
  neutral: "bg-slate-100 text-slate-600 border border-slate-200",
};

export type KpiTileProps = {
  label: string;
  value: number | string;
  trend?: Trend;
  icon: ReactNode;
  accent: KpiTileAccent;
  linkTo?: string;
};

export function KpiTile({ label, value, trend, icon, accent, linkTo }: KpiTileProps) {
  const ariaLabel = trend ? `${label}: ${value}, ${trendLabel(trend)}` : `${label}: ${value}`;
  const tileClass =
    "flex items-center gap-3.5 rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1 transition-all duration-150 hover:scale-[1.02] hover:shadow-md";

  const inner = (
    <Fragment>
      <div
        aria-hidden="true"
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${accentClass[accent]}`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-heading text-2xl font-bold text-on-surface leading-none">{value}</div>
        <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-text-grey leading-tight">
          {label}
        </div>
        {trend && (
          <div className={`mt-1 flex items-center gap-1 font-label text-xs font-semibold ${trendClass(trend.direction)}`}>
            <span aria-hidden="true">{trendSymbol(trend.direction)}</span>
            <span>{trend.pct}%</span>
          </div>
        )}
      </div>
    </Fragment>
  );

  return linkTo ? (
    <Link
      href={linkTo}
      aria-label={ariaLabel}
      className={`${tileClass} focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy`}
    >
      {inner}
    </Link>
  ) : (
    <div aria-label={ariaLabel} className={tileClass}>
      {inner}
    </div>
  );
}

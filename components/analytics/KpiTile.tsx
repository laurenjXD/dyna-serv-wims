import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import type { Trend } from "./types";
import { trendClass, trendLabel, trendSymbol } from "./utils";

// Colorful bento-style KPI tile — 2026-08-17 dashboard restyle. Distinct
// from KpiCard (components/analytics/KpiCard.tsx, still used unchanged on
// /reports): this is the office dashboard's own variant, not a replacement,
// per the phased-rollout decision (dashboard first, other office pages
// later, floor pages never get this treatment) — see
// specs/00-steering/revision-log.md's dashboard-restyle entry.
//
// The colored icon badge is a background/icon accent only — the KPI figure
// itself always stays text-on-surface, never colored text, per the existing
// KpiCard.tsx rule (brand/status colors are never text color for a number).

export type KpiTileAccent = "royal-blue" | "available" | "pending" | "navy" | "red" | "neutral";

const accentClass: Record<KpiTileAccent, string> = {
  "royal-blue": "bg-brand-royal-blue/15 text-brand-royal-blue",
  available: "bg-status-available/15 text-status-available",
  pending: "bg-status-pending/15 text-status-pending",
  navy: "bg-accent-indigo-600/15 text-accent-indigo-600",
  red: "bg-brand-red/15 text-brand-red",
  neutral: "bg-status-neutral/15 text-status-neutral",
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
  // Tile chrome (border/shadow/hover) is shared; the focus ring is applied
  // directly to whichever element is actually focusable (the <a> when
  // linkTo is set, the wrapping <div> otherwise) — NOT via focus-within on
  // an ancestor-of-the-focused-element, which never fires (:focus-within
  // only matches when the focused node is itself or a DESCENDANT).
  const tileClass =
    "flex items-center gap-4 rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1 transition-transform duration-150 hover:scale-[1.02]";
  // Icon badge + text block are the flex container's direct children in
  // BOTH cases (Fragment adds no wrapping element), so centering/gap layout
  // is identical whether the outer element is the <a> or the plain <div>.
  const inner = (
    <Fragment>
      <div
        aria-hidden="true"
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${accentClass[accent]}`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="font-heading text-headline-md font-semibold text-on-surface">{value}</div>
        <div className="mt-0.5 truncate font-label text-label font-semibold uppercase tracking-[0.05em] text-text-grey">
          {label}
        </div>
        {trend && (
          <div className={`mt-1 flex items-center gap-1 font-label text-body-sm font-semibold ${trendClass(trend.direction)}`}>
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

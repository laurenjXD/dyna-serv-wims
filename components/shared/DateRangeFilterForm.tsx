"use client";

// Reusable date-range filter for read-only list/ledger pages (2026-08-19).
// Plain GET form pushing ?range=&from=&to= — no client-side data fetching,
// the Server Component page re-renders with the new searchParams, same
// pattern as this app's existing search/filter forms (e.g. enrollment's
// search box). Shared by Outgoing Ledger, Incoming/Receiving Ledger, and
// Master Inventory.

import { useState } from "react";
import { DATE_RANGE_PRESETS, type DateRangePreset } from "@/lib/shell/date-range-filter";

export function DateRangeFilterForm({
  action,
  currentRange,
  currentFrom,
  currentTo,
}: {
  action: string;
  currentRange?: string;
  currentFrom?: string;
  currentTo?: string;
}) {
  const [preset, setPreset] = useState<DateRangePreset>(
    (currentRange as DateRangePreset) ?? "all-time",
  );

  return (
    <form action={action} method="get" className="flex flex-wrap items-end gap-3">
      <div>
        <label htmlFor="range" className="block font-label text-label text-on-surface">
          Date Range
        </label>
        <select
          id="range"
          name="range"
          value={preset}
          onChange={(e) => setPreset(e.target.value as DateRangePreset)}
          className="mt-1 h-11 rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
        >
          {DATE_RANGE_PRESETS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {preset === "custom" && (
        <>
          <div>
            <label htmlFor="from" className="block font-label text-label text-on-surface">
              From
            </label>
            <input
              id="from"
              name="from"
              type="date"
              defaultValue={currentFrom}
              required
              className="mt-1 h-11 rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
            />
          </div>
          <div>
            <label htmlFor="to" className="block font-label text-label text-on-surface">
              To
            </label>
            <input
              id="to"
              name="to"
              type="date"
              defaultValue={currentTo}
              required
              className="mt-1 h-11 rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
            />
          </div>
        </>
      )}

      <button
        type="submit"
        className="flex h-11 items-center justify-center rounded bg-primary px-5 font-label text-label text-surface-white hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-brand-navy"
      >
        Apply
      </button>
      {preset !== "all-time" && (
        <a
          href={action}
          className="flex h-11 items-center justify-center rounded border border-outline-variant/30 px-4 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
        >
          Clear
        </a>
      )}
    </form>
  );
}

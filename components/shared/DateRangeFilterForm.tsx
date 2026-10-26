"use client";

// Reusable date-range filter for read-only list/ledger pages (2026-08-19).
// Plain GET form pushing ?range=&from=&to= — no client-side data fetching,
// the Server Component page re-renders with the new searchParams, same
// pattern as this app's existing search/filter forms (e.g. enrollment's
// search box). Shared by Outgoing Ledger, Incoming/Receiving Ledger, and
// Master Inventory.

import { useState } from "react";
import { DATE_RANGE_PRESETS, type DateRangePreset } from "@/lib/shell/date-range-filter";
import { Button, FilterDateInput, FilterSelect } from "@/components/ui";

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
    <form action={action} method="get" className="flex flex-wrap items-center gap-3">
      <FilterSelect
        id="range"
        name="range"
        label="Range"
        value={preset}
        onChange={(value) => setPreset(value as DateRangePreset)}
        options={DATE_RANGE_PRESETS.map(({ value, label }) => ({ value, label }))}
      />

      {preset === "custom" && (
        <>
          <FilterDateInput id="from" name="from" label="From" defaultValue={currentFrom} required />
          <FilterDateInput id="to" name="to" label="To" defaultValue={currentTo} required />
        </>
      )}

      <Button type="submit" size="lg">Apply</Button>
      {preset !== "all-time" && (
        <a
          href={action}
          className="inline-flex h-12 items-center justify-center rounded-xl border border-border bg-surface px-5 font-label text-label font-bold text-text-primary transition-colors hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Clear
        </a>
      )}
    </form>
  );
}

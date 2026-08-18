// Shared date-range filter parsing for read-only list/ledger pages
// (2026-08-19 — user request: "the filtering on each page with read only
// should have a date range or like filter monthly"). Pure parsing logic,
// reused by Outgoing Ledger, Incoming/Receiving Ledger, and Master
// Inventory — each page's own Server Component calls this with its
// searchParams and passes the resulting range into its list query.
//
// No range specified -> null (all time, the existing default behavior on
// every page this is added to, so adding this filter is additive, never a
// silent behavior change for an existing bookmarked/shared URL).

export type DateRangePreset =
  | "all-time"
  | "this-month"
  | "last-30-days"
  | "last-90-days"
  | "custom";

export const DATE_RANGE_PRESETS: Array<{ value: DateRangePreset; label: string }> = [
  { value: "all-time", label: "All time" },
  { value: "this-month", label: "This month" },
  { value: "last-30-days", label: "Last 30 days" },
  { value: "last-90-days", label: "Last 90 days" },
  { value: "custom", label: "Custom range" },
];

export type DateRange = { startDate: Date; endDate: Date };

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Parses a read-only page's date-range filter search params into a
 * DateRange, or null for "all time" (no filter — the default when no
 * params are present at all, preserving every existing page's current
 * unfiltered behavior).
 *
 * `now` is injectable for deterministic testing — defaults to `new Date()`.
 */
export function parseDateRangeParams(
  params: { range?: string; from?: string; to?: string },
  now: Date = new Date(),
): DateRange | null {
  const preset = (params.range as DateRangePreset) ?? "all-time";

  if (preset === "custom") {
    const from = params.from ? new Date(params.from) : null;
    const to = params.to ? new Date(params.to) : null;
    if (!from || !to || isNaN(from.valueOf()) || isNaN(to.valueOf())) {
      return null;
    }
    return { startDate: startOfDay(from), endDate: endOfDay(to) };
  }

  if (preset === "this-month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { startDate: startOfDay(start), endDate: endOfDay(now) };
  }

  if (preset === "last-30-days") {
    const start = new Date(now);
    start.setDate(start.getDate() - 29);
    return { startDate: startOfDay(start), endDate: endOfDay(now) };
  }

  if (preset === "last-90-days") {
    const start = new Date(now);
    start.setDate(start.getDate() - 89);
    return { startDate: startOfDay(start), endDate: endOfDay(now) };
  }

  return null; // "all-time" or an unrecognized value
}

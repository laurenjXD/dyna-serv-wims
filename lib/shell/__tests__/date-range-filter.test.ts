// Unit tests for lib/shell/date-range-filter.ts — shared date-range filter
// parsing for read-only list/ledger pages (2026-08-19 user request: "the
// filtering on each page with read only should have a date range or like
// filter monthly"). Reused by Outgoing Ledger, Incoming/Receiving Ledger,
// and Master Inventory.

import { describe, expect, it } from "vitest";
import { parseDateRangeParams, DATE_RANGE_PRESETS } from "../date-range-filter";

const FIXED_NOW = new Date("2026-08-19T15:30:00.000Z");

describe("parseDateRangeParams — no filter / all time (default, preserves existing unfiltered pages)", () => {
  it("returns null when no params are present at all", () => {
    expect(parseDateRangeParams({}, FIXED_NOW)).toBeNull();
  });

  it("returns null when range is explicitly 'all-time'", () => {
    expect(parseDateRangeParams({ range: "all-time" }, FIXED_NOW)).toBeNull();
  });

  it("returns null for an unrecognized range value, rather than throwing", () => {
    expect(parseDateRangeParams({ range: "not-a-real-preset" }, FIXED_NOW)).toBeNull();
  });
});

describe("parseDateRangeParams — this-month", () => {
  it("returns a range from the 1st of the current month through now", () => {
    const result = parseDateRangeParams({ range: "this-month" }, FIXED_NOW);
    expect(result).not.toBeNull();
    expect(result!.startDate.getDate()).toBe(1);
    expect(result!.startDate.getMonth()).toBe(FIXED_NOW.getMonth());
    expect(result!.endDate.getDate()).toBe(FIXED_NOW.getDate());
  });
});

describe("parseDateRangeParams — last-30-days / last-90-days", () => {
  it("last-30-days spans exactly 30 calendar days inclusive (start-of-day 29-days-ago through end-of-day today)", () => {
    const result = parseDateRangeParams({ range: "last-30-days" }, FIXED_NOW);
    expect(result).not.toBeNull();
    const spanDays = Math.round(
      (result!.endDate.getTime() - result!.startDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    expect(spanDays).toBe(30);
  });

  it("last-90-days spans exactly 90 calendar days inclusive", () => {
    const result = parseDateRangeParams({ range: "last-90-days" }, FIXED_NOW);
    expect(result).not.toBeNull();
    const spanDays = Math.round(
      (result!.endDate.getTime() - result!.startDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    expect(spanDays).toBe(90);
  });
});

describe("parseDateRangeParams — custom range", () => {
  it("returns the exact from/to dates when both are valid", () => {
    const result = parseDateRangeParams(
      { range: "custom", from: "2026-08-01", to: "2026-08-15" },
      FIXED_NOW,
    );
    expect(result).not.toBeNull();
    expect(result!.startDate.getDate()).toBe(1);
    expect(result!.endDate.getDate()).toBe(15);
  });

  it("endDate is end-of-day (23:59:59.999), so the 'to' day is fully inclusive", () => {
    const result = parseDateRangeParams(
      { range: "custom", from: "2026-08-01", to: "2026-08-15" },
      FIXED_NOW,
    );
    expect(result!.endDate.getHours()).toBe(23);
    expect(result!.endDate.getMinutes()).toBe(59);
  });

  it("returns null when 'from' is missing", () => {
    expect(parseDateRangeParams({ range: "custom", to: "2026-08-15" }, FIXED_NOW)).toBeNull();
  });

  it("returns null when 'to' is missing", () => {
    expect(parseDateRangeParams({ range: "custom", from: "2026-08-01" }, FIXED_NOW)).toBeNull();
  });

  it("returns null when a date string is invalid, rather than an Invalid Date range", () => {
    expect(
      parseDateRangeParams({ range: "custom", from: "not-a-date", to: "2026-08-15" }, FIXED_NOW),
    ).toBeNull();
  });
});

describe("DATE_RANGE_PRESETS", () => {
  it("includes exactly the 5 documented preset values, each with a label", () => {
    const values = DATE_RANGE_PRESETS.map((p) => p.value);
    expect(values).toEqual(["all-time", "this-month", "last-30-days", "last-90-days", "custom"]);
    for (const preset of DATE_RANGE_PRESETS) {
      expect(preset.label.length).toBeGreaterThan(0);
    }
  });
});

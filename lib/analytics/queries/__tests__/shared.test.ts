import { describe, expect, it } from "vitest";
import { assertDateRange, toNumber } from "../shared";

describe("analytics query guards", () => {
  it("rejects reversed and invalid date ranges before a query runs", () => {
    expect(() => assertDateRange({ startDate: new Date("2026-02-01"), endDate: new Date("2026-01-01") })).toThrow("date range");
    expect(() => assertDateRange({ startDate: new Date("invalid"), endDate: new Date() })).toThrow("date range");
  });
  it("normalizes PostgreSQL aggregate numeric strings", () => {
    expect(toNumber("42")).toBe(42);
    expect(toNumber(null)).toBe(0);
  });
});

// Regression tests for lib/analytics/queries/outbound.ts.
//
// Incident (2026-08-17): every function in this file interpolated raw JS
// `Date` objects directly into a Drizzle `sql` template. That works when the
// query is compiled through Drizzle's dialect in isolation, but broke in
// production the moment an `administrator` session first exercised
// `getPickListQtyAndCbmTrend` (previously dormant for that role — see
// specs/00-steering/revision-log.md's "Administrator granted full
// operational oversight" entry, which is what newly granted administrator
// `pick_list.read` and exposed this pre-existing bug): the deployed
// Drizzle/postgres.js combination threw
// `TypeError: The "string" argument must be of type string or an instance
// of Buffer or ArrayBuffer. Received an instance of Date` while serializing
// the bound parameter. Every dashboard page load for any role holding
// pick_list.read was one `Promise.all` rejection away from crashing the
// entire authenticated app, since `/` (the dashboard) is the landing page
// after every sign-in.
//
// Fix: every Date range value is converted to an ISO string
// (`range.startDate.toISOString()`) before interpolation, so the bind
// parameter is always an unambiguous string, never a raw Date instance.
//
// These tests compile each function's built SQL through Drizzle's own
// PgDialect (the same compilation step the real `postgres`-backed db uses)
// and assert no bound parameter is ever a raw Date instance — this is
// exactly the shape of value that broke in production, so it's what's
// asserted against directly, rather than re-deriving the driver-internal
// failure.

import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import {
  getPickListVolumeTrend,
  getPickListQtyAndCbmTrend,
  getDispatchRate,
  getTopDispatchedItems,
  getCommitmentDuration,
  getPickListCountByFlow,
} from "../outbound";
import type { AnalyticsExecutor } from "../shared";

const dialect = new PgDialect();

function captureExecutor(): AnalyticsExecutor & { captured: SQL[] } {
  const captured: SQL[] = [];
  return {
    captured,
    async execute<T extends Record<string, unknown>>(query: SQL): Promise<T[]> {
      captured.push(query);
      return [] as T[];
    },
  };
}

function assertNoRawDateParams(query: SQL): void {
  const { params } = dialect.sqlToQuery(query);
  for (const param of params) {
    expect(param).not.toBeInstanceOf(Date);
  }
}

const range = {
  startDate: new Date("2026-08-11T00:00:00.000Z"),
  endDate: new Date("2026-08-17T05:31:14.000Z"),
};

describe("lib/analytics/queries/outbound — no raw Date bind parameters (2026-08-17 production incident)", () => {
  it("getPickListVolumeTrend never binds a raw Date", async () => {
    const executor = captureExecutor();
    await getPickListVolumeTrend(range, "all", "day", executor);
    expect(executor.captured).toHaveLength(1);
    assertNoRawDateParams(executor.captured[0]);
  });

  it("getPickListQtyAndCbmTrend never binds a raw Date (the exact query that crashed production)", async () => {
    const executor = captureExecutor();
    await getPickListQtyAndCbmTrend(range, "all", "day", executor);
    expect(executor.captured).toHaveLength(1);
    assertNoRawDateParams(executor.captured[0]);
  });

  it("getPickListQtyAndCbmTrend's bound start/end params are ISO date strings", async () => {
    const executor = captureExecutor();
    await getPickListQtyAndCbmTrend(range, "all", "day", executor);
    const { params } = dialect.sqlToQuery(executor.captured[0]);
    expect(params).toContain(range.startDate.toISOString());
    expect(params).toContain(range.endDate.toISOString());
  });

  it("getDispatchRate never binds a raw Date", async () => {
    const executor = captureExecutor();
    await getDispatchRate(range, executor);
    assertNoRawDateParams(executor.captured[0]);
  });

  it("getTopDispatchedItems never binds a raw Date", async () => {
    const executor = captureExecutor();
    await getTopDispatchedItems(range, executor);
    assertNoRawDateParams(executor.captured[0]);
  });

  it("getCommitmentDuration never binds a raw Date", async () => {
    const executor = captureExecutor();
    await getCommitmentDuration(range, executor);
    assertNoRawDateParams(executor.captured[0]);
  });

  it("getPickListCountByFlow never binds a raw Date", async () => {
    const executor = captureExecutor();
    await getPickListCountByFlow(range, executor);
    assertNoRawDateParams(executor.captured[0]);
  });
});

// ---------------------------------------------------------------------------
// getPickListCountByFlow — 2026-08-17 dashboard restyle, "Activity by Flow
// Type" bar chart (VMI/Trading/Supplies), replacing the reference design's
// "Sales Ratings by platform" bar chart with this app's real equivalent
// dimension.
// ---------------------------------------------------------------------------

describe("getPickListCountByFlow — per-flow pick list counts for the dashboard bar chart", () => {
  it("queries pick_lists grouped by flow_type within the given range", async () => {
    const executor = captureExecutor();
    await getPickListCountByFlow(range, executor);
    const { sql: compiledSql } = dialect.sqlToQuery(executor.captured[0]);
    expect(compiledSql).toMatch(/GROUP BY\s+flow_type/i);
    expect(compiledSql).toMatch(/pick_lists/i);
  });

  it("returns whatever rows the executor provides, shaped as {flow_type, count}", async () => {
    const rows = [
      { flow_type: "vmi", count: "12" },
      { flow_type: "trading", count: "7" },
      { flow_type: "supplies", count: "3" },
    ];
    const executor: AnalyticsExecutor = {
      async execute() {
        return rows as never;
      },
    };
    const result = await getPickListCountByFlow(range, executor);
    expect(result).toEqual(rows);
  });
});

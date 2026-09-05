import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import {
  getDeliveryConformanceKpi,
  getDeliveryConformanceTrend,
} from "../conformance";
import type { AnalyticsExecutor } from "../shared";

const dialect = new PgDialect();

function captureExecutor(mockReturn: any[] = []): AnalyticsExecutor & { captured: SQL[] } {
  const captured: SQL[] = [];
  return {
    captured,
    async execute<T extends Record<string, unknown>>(query: SQL): Promise<T[]> {
      captured.push(query);
      return mockReturn as T[];
    },
  };
}

function assertNoRawDateParams(query: SQL): void {
  const { params } = dialect.sqlToQuery(query);
  for (const param of params) {
    expect(param).not.toBeInstanceOf(Date);
  }
}

describe("lib/analytics/queries/conformance suite", () => {
  const range = {
    startDate: new Date("2026-08-01T00:00:00.000Z"),
    endDate: new Date("2026-08-31T23:59:59.999Z"),
  };

  it("getDeliveryConformanceKpi computes conformance rates accurately", async () => {
    const mockData = [
      {
        total_dispatched: "100",
        conforming_count: "95",
        pending_pod_count: "5",
      },
    ];
    const exec = captureExecutor(mockData);

    const result = await getDeliveryConformanceKpi(range, "all", exec);

    expect(exec.captured).toHaveLength(1);
    assertNoRawDateParams(exec.captured[0]);
    expect(result.totalDispatched).toBe(100);
    expect(result.conformingCount).toBe(95);
    expect(result.pendingPodCount).toBe(5);
    expect(result.conformanceRate).toBe(95);
  });

  it("getDeliveryConformanceKpi handles 0 dispatched gracefully", async () => {
    const mockData = [
      {
        total_dispatched: "0",
        conforming_count: "0",
        pending_pod_count: "0",
      },
    ];
    const exec = captureExecutor(mockData);

    const result = await getDeliveryConformanceKpi(range, "vmi", exec);

    expect(result.totalDispatched).toBe(0);
    expect(result.conformanceRate).toBe(100);
  });

  it("getDeliveryConformanceTrend groups periods and calculates rate", async () => {
    const mockData = [
      {
        period: "2026-08-01T00:00:00.000Z",
        total_dispatched: "20",
        conforming_count: "18",
      },
      {
        period: "2026-08-02T00:00:00.000Z",
        total_dispatched: "25",
        conforming_count: "25",
      },
    ];
    const exec = captureExecutor(mockData);

    const trend = await getDeliveryConformanceTrend(range, "all", "day", exec);

    expect(exec.captured).toHaveLength(1);
    assertNoRawDateParams(exec.captured[0]);
    expect(trend).toHaveLength(2);
    expect(trend[0].conformanceRate).toBe(90);
    expect(trend[1].conformanceRate).toBe(100);
  });
});

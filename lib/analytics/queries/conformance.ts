// lib/analytics/queries/conformance.ts
//
// Delivery Conformance Analytics Query Helpers.
//
// Calculates On-Time In-Full & Delivery Conformance rate for outbound dispatches,
// evaluating whether dispatches have completed physical handoffs with signed Proof of Delivery (POD/DR).

import { sql } from "drizzle-orm";
import type { AnalyticsExecutor, AnalyticsFlow, DateRange } from "./shared";
import { assertDateRange, defaultAnalyticsExecutor, flowPredicate, toNumber } from "./shared";

export type DeliveryConformanceKpi = {
  totalDispatched: number;
  conformingCount: number;
  pendingPodCount: number;
  conformanceRate: number; // 0 - 100
};

export type DeliveryConformanceTrendDatum = {
  period: string;
  totalDispatched: number;
  conformingCount: number;
  conformanceRate: number;
};

/**
 * Computes aggregate delivery conformance KPI for a given date range and flow.
 */
export async function getDeliveryConformanceKpi(
  range: DateRange,
  flow: AnalyticsFlow = "all",
  executor: AnalyticsExecutor = defaultAnalyticsExecutor,
): Promise<DeliveryConformanceKpi> {
  assertDateRange(range);
  const startDate = range.startDate.toISOString();
  const endDate = range.endDate.toISOString();

  const [row] = await executor.execute<{
    total_dispatched: string | number;
    conforming_count: string | number;
    pending_pod_count: string | number;
  }>(sql`
    SELECT
      COUNT(*) FILTER (WHERE pl.status = 'dispatched') AS total_dispatched,
      COUNT(*) FILTER (
        WHERE pl.status = 'dispatched'
          AND (pl.delivery_receipt_status = 'approved' OR pl.delivery_receipt_path IS NOT NULL)
      ) AS conforming_count,
      COUNT(*) FILTER (
        WHERE pl.status = 'dispatched'
          AND (pl.delivery_receipt_status IS NULL OR pl.delivery_receipt_status != 'approved')
          AND pl.delivery_receipt_path IS NULL
      ) AS pending_pod_count
    FROM pick_lists pl
    WHERE pl.created_at >= ${startDate} AND pl.created_at <= ${endDate}
      AND ${flowPredicate(sql`pl.flow_type`, flow)}
  `);

  const totalDispatched = toNumber(row?.total_dispatched ?? 0);
  const conformingCount = toNumber(row?.conforming_count ?? 0);
  const pendingPodCount = toNumber(row?.pending_pod_count ?? 0);
  const conformanceRate =
    totalDispatched > 0
      ? Math.round((conformingCount / totalDispatched) * 1000) / 10
      : 100;

  return {
    totalDispatched,
    conformingCount,
    pendingPodCount,
    conformanceRate,
  };
}

/**
 * Computes period-by-period trend for delivery conformance line graph.
 */
export async function getDeliveryConformanceTrend(
  range: DateRange,
  flow: AnalyticsFlow = "all",
  period: "day" | "week" | "month" = "day",
  executor: AnalyticsExecutor = defaultAnalyticsExecutor,
): Promise<DeliveryConformanceTrendDatum[]> {
  assertDateRange(range);
  const startDate = range.startDate.toISOString();
  const endDate = range.endDate.toISOString();

  const rows = await executor.execute<{
    period: string | Date;
    total_dispatched: string | number;
    conforming_count: string | number;
  }>(sql`
    SELECT
      date_trunc(${period}, pl.created_at) AS period,
      COUNT(*) FILTER (WHERE pl.status = 'dispatched') AS total_dispatched,
      COUNT(*) FILTER (
        WHERE pl.status = 'dispatched'
          AND (pl.delivery_receipt_status = 'approved' OR pl.delivery_receipt_path IS NOT NULL)
      ) AS conforming_count
    FROM pick_lists pl
    WHERE pl.created_at >= ${startDate} AND pl.created_at <= ${endDate}
      AND ${flowPredicate(sql`pl.flow_type`, flow)}
    GROUP BY 1
    ORDER BY 1 ASC
  `);

  return rows.map((r) => {
    const total = toNumber(r.total_dispatched);
    const conforming = toNumber(r.conforming_count);
    const rate = total > 0 ? Math.round((conforming / total) * 1000) / 10 : 100;

    return {
      period: r.period instanceof Date ? r.period.toISOString() : String(r.period),
      totalDispatched: total,
      conformingCount: conforming,
      conformanceRate: rate,
    };
  });
}

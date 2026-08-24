import { sql } from "drizzle-orm";
import type { AnalyticsExecutor, AnalyticsFlow, DateRange } from "./shared";
import { assertDateRange, defaultAnalyticsExecutor, flowPredicate } from "./shared";

export async function getWrrVolumeTrend(range: DateRange, flow: AnalyticsFlow, period: "day" | "week" | "month", executor: AnalyticsExecutor = defaultAnalyticsExecutor) {
  assertDateRange(range);
  const startDate = range.startDate.toISOString();
  const endDate = range.endDate.toISOString();
  return executor.execute(sql`
    SELECT date_trunc(${period}, wd.created_at) AS period, COUNT(*) AS count
    FROM wrr_documents wd
    WHERE wd.created_at >= ${startDate} AND wd.created_at <= ${endDate}
      AND ${flowPredicate(sql`wd.flow_type`, flow)}
    GROUP BY period ORDER BY period ASC
  `);
}

export async function getReceivingQuality(range: DateRange, executor: AnalyticsExecutor = defaultAnalyticsExecutor) {
  assertDateRange(range);
  const startDate = range.startDate.toISOString();
  const endDate = range.endDate.toISOString();
  const [row] = await executor.execute<{ discrepancy_count: string; total_lines: string; discrepancy_pct: string | null; average_cycle_hours: string | null }>(sql`
    SELECT
      COUNT(*) FILTER (WHERE wi.scanned_qty <> wi.expected_qty) AS discrepancy_count,
      COUNT(wi.id) AS total_lines,
      ROUND(100.0 * COUNT(*) FILTER (WHERE wi.scanned_qty <> wi.expected_qty) / NULLIF(COUNT(wi.id), 0), 2) AS discrepancy_pct,
      AVG(EXTRACT(EPOCH FROM (wd.confirmed_at - wd.created_at)) / 3600) FILTER (WHERE wd.status = 'confirmed') AS average_cycle_hours
    FROM wrr_documents wd LEFT JOIN wrr_items wi ON wi.wrr_id = wd.id
    WHERE wd.created_at >= ${startDate} AND wd.created_at <= ${endDate}
  `);
  return row ?? { discrepancy_count: "0", total_lines: "0", discrepancy_pct: null, average_cycle_hours: null };
}

export async function getInspectionOutcomes(range: DateRange, executor: AnalyticsExecutor = defaultAnalyticsExecutor) {
  assertDateRange(range);
  const startDate = range.startDate.toISOString();
  const endDate = range.endDate.toISOString();
  return executor.execute(sql`
    SELECT conformance_status, non_conformance_reason, COUNT(*) AS count
    FROM wrr_inspection_logs
    WHERE created_at >= ${startDate} AND created_at <= ${endDate}
    GROUP BY conformance_status, non_conformance_reason ORDER BY conformance_status, non_conformance_reason
  `);
}

export async function getTopReceivedItems(range: DateRange, executor: AnalyticsExecutor = defaultAnalyticsExecutor) {
  assertDateRange(range);
  const startDate = range.startDate.toISOString();
  const endDate = range.endDate.toISOString();
  return executor.execute(sql`
    SELECT i.id, i.code, i.name, SUM(wi.scanned_qty) AS total_received, COUNT(*) AS receipt_frequency
    FROM wrr_items wi JOIN wrr_documents wd ON wd.id = wi.wrr_id JOIN items i ON i.id = wi.item_id
    WHERE wd.status = 'confirmed' AND wd.confirmed_at >= ${startDate} AND wd.confirmed_at <= ${endDate}
    GROUP BY i.id, i.code, i.name ORDER BY total_received DESC, receipt_frequency DESC LIMIT 10
  `);
}

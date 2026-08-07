import { sql } from "drizzle-orm";
import type { AnalyticsExecutor, AnalyticsFlow, DateRange } from "./shared";
import { assertDateRange, defaultAnalyticsExecutor, flowPredicate } from "./shared";

export async function getPickListVolumeTrend(range: DateRange, flow: AnalyticsFlow, period: "day" | "week" | "month", executor: AnalyticsExecutor = defaultAnalyticsExecutor) {
  assertDateRange(range);
  return executor.execute(sql`
    SELECT date_trunc(${period}, created_at) AS period, COUNT(*) AS total_count,
      COUNT(*) FILTER (WHERE status = 'dispatched') AS dispatched_count
    FROM pick_lists
    WHERE created_at >= ${range.startDate} AND created_at <= ${range.endDate}
      AND ${flowPredicate(sql`flow_type`, flow)}
    GROUP BY period ORDER BY period ASC
  `);
}

export async function getDispatchRate(range: DateRange, executor: AnalyticsExecutor = defaultAnalyticsExecutor) {
  assertDateRange(range);
  const [row] = await executor.execute<{ dispatched: string; not_dispatched: string }>(sql`
    SELECT COUNT(*) FILTER (WHERE pl.status = 'dispatched') AS dispatched,
      COUNT(*) FILTER (WHERE ic.status IN ('cancelled', 'expired')) AS not_dispatched
    FROM pick_lists pl LEFT JOIN inventory_commitments ic ON ic.pick_list_id = pl.id
    WHERE pl.created_at >= ${range.startDate} AND pl.created_at <= ${range.endDate}
  `);
  return row ?? { dispatched: "0", not_dispatched: "0" };
}

export async function getTopDispatchedItems(range: DateRange, executor: AnalyticsExecutor = defaultAnalyticsExecutor) {
  assertDateRange(range);
  return executor.execute(sql`
    SELECT i.id, i.code, i.name, SUM(pli.qty) AS total_dispatched, COUNT(*) AS dispatch_frequency
    FROM pick_list_items pli JOIN pick_lists pl ON pl.id = pli.pick_list_id JOIN items i ON i.id = pli.item_id
    WHERE pl.status = 'dispatched' AND pl.updated_at >= ${range.startDate} AND pl.updated_at <= ${range.endDate}
    GROUP BY i.id, i.code, i.name ORDER BY total_dispatched DESC, dispatch_frequency DESC LIMIT 10
  `);
}

export async function getCommitmentDuration(range: DateRange, executor: AnalyticsExecutor = defaultAnalyticsExecutor) {
  assertDateRange(range);
  return executor.execute(sql`
    SELECT percentile_cont(0.25) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (pl.updated_at - pl.created_at)) / 3600) AS p25_hours,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (pl.updated_at - pl.created_at)) / 3600) AS median_hours,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (pl.updated_at - pl.created_at)) / 3600) AS p75_hours
    FROM pick_lists pl WHERE pl.status = 'dispatched' AND pl.updated_at >= ${range.startDate} AND pl.updated_at <= ${range.endDate}
  `);
}

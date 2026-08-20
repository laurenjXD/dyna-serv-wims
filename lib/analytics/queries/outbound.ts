import { sql } from "drizzle-orm";
import type { AnalyticsExecutor, AnalyticsFlow, DateRange } from "./shared";
import { assertDateRange, defaultAnalyticsExecutor, flowPredicate } from "./shared";

export async function getPickListVolumeTrend(range: DateRange, flow: AnalyticsFlow, period: "day" | "week" | "month", executor: AnalyticsExecutor = defaultAnalyticsExecutor) {
  assertDateRange(range);
  const startDate = range.startDate.toISOString();
  const endDate = range.endDate.toISOString();
  return executor.execute(sql`
    SELECT date_trunc(${period}, created_at) AS period, COUNT(*) AS total_count,
      COUNT(*) FILTER (WHERE status = 'dispatched') AS dispatched_count
    FROM pick_lists
    WHERE created_at >= ${startDate} AND created_at <= ${endDate}
      AND ${flowPredicate(sql`flow_type`, flow)}
    GROUP BY period ORDER BY period ASC
  `);
}

// Weekly transaction line graph + Monthly outgoing KPI data source for `/`
// (specs/05-ui-shell-and-navigation/requirements.md R11.3/R11.5). Unlike
// getPickListVolumeTrend (which counts pick_lists rows), this returns the
// actual outgoing quantity and CBM dispatched, joining pick_list_items to
// items.volume_cbm — the "sales"/$ series named in R11.3 is deliberately
// excluded (no pricing/billing backend exists yet).
export async function getPickListQtyAndCbmTrend(range: DateRange, flow: AnalyticsFlow, period: "day" | "week" | "month", executor: AnalyticsExecutor = defaultAnalyticsExecutor) {
  assertDateRange(range);
  const startDate = range.startDate.toISOString();
  const endDate = range.endDate.toISOString();
  return executor.execute(sql`
    SELECT date_trunc(${period}, pl.created_at) AS period,
      COALESCE(SUM(pli.qty), 0) AS total_qty,
      COALESCE(SUM(pli.qty * i.volume_cbm), 0) AS total_cbm
    FROM pick_lists pl
    JOIN pick_list_items pli ON pli.pick_list_id = pl.id
    JOIN items i ON i.id = pli.item_id
    WHERE pl.created_at >= ${startDate} AND pl.created_at <= ${endDate}
      AND ${flowPredicate(sql`pl.flow_type`, flow)}
    GROUP BY period ORDER BY period ASC
  `);
}

export async function getDispatchRate(range: DateRange, executor: AnalyticsExecutor = defaultAnalyticsExecutor) {
  assertDateRange(range);
  const startDate = range.startDate.toISOString();
  const endDate = range.endDate.toISOString();
  const [row] = await executor.execute<{ dispatched: string; not_dispatched: string }>(sql`
    SELECT COUNT(*) FILTER (WHERE pl.status = 'dispatched') AS dispatched,
      COUNT(*) FILTER (WHERE ic.status IN ('cancelled', 'expired')) AS not_dispatched
    FROM pick_lists pl LEFT JOIN inventory_commitments ic ON ic.pick_list_id = pl.id
    WHERE pl.created_at >= ${startDate} AND pl.created_at <= ${endDate}
  `);
  return row ?? { dispatched: "0", not_dispatched: "0" };
}

export async function getTopDispatchedItems(range: DateRange, executor: AnalyticsExecutor = defaultAnalyticsExecutor) {
  assertDateRange(range);
  const startDate = range.startDate.toISOString();
  const endDate = range.endDate.toISOString();
  return executor.execute(sql`
    SELECT i.id, i.code, i.name, SUM(pli.qty) AS total_dispatched, COUNT(*) AS dispatch_frequency
    FROM pick_list_items pli JOIN pick_lists pl ON pl.id = pli.pick_list_id JOIN items i ON i.id = pli.item_id
    WHERE pl.status = 'dispatched' AND pl.updated_at >= ${startDate} AND pl.updated_at <= ${endDate}
    GROUP BY i.id, i.code, i.name ORDER BY total_dispatched DESC, dispatch_frequency DESC LIMIT 10
  `);
}

// "Activity by Flow Type" bar chart source for `/` (2026-08-17 dashboard
// restyle) — the real equivalent of a generic "sales by platform" bar chart
// for this app: VMI/Trading/Supplies is the one dimension every pick list
// legitimately partitions by.
export async function getPickListCountByFlow(range: DateRange, executor: AnalyticsExecutor = defaultAnalyticsExecutor) {
  assertDateRange(range);
  const startDate = range.startDate.toISOString();
  const endDate = range.endDate.toISOString();
  return executor.execute<{ flow_type: string; count: string }>(sql`
    SELECT flow_type, COUNT(*) AS count
    FROM pick_lists
    WHERE created_at >= ${startDate} AND created_at <= ${endDate}
    GROUP BY flow_type
  `);
}

export async function getCommitmentDuration(range: DateRange, executor: AnalyticsExecutor = defaultAnalyticsExecutor) {
  assertDateRange(range);
  const startDate = range.startDate.toISOString();
  const endDate = range.endDate.toISOString();
  return executor.execute(sql`
    SELECT percentile_cont(0.25) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (pl.updated_at - pl.created_at)) / 3600) AS p25_hours,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (pl.updated_at - pl.created_at)) / 3600) AS median_hours,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (pl.updated_at - pl.created_at)) / 3600) AS p75_hours
    FROM pick_lists pl WHERE pl.status = 'dispatched' AND pl.updated_at >= ${startDate} AND pl.updated_at <= ${endDate}
  `);
}

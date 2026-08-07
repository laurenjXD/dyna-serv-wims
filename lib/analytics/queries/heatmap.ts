import { sql } from "drizzle-orm";
import type { AnalyticsExecutor, AnalyticsFlow } from "./shared";
import { defaultAnalyticsExecutor, flowPredicate } from "./shared";

export type HeatmapPoint = { date: string; count: number };

// Until the locked daily_transaction_counts migration is available, the canonical ledger fallback is used.
export async function getActivityHeatmap(flow: AnalyticsFlow, executor: AnalyticsExecutor = defaultAnalyticsExecutor): Promise<HeatmapPoint[]> {
  const rows = await executor.execute<{ activity_date: string; count: string | number }>(sql`
    SELECT DATE(created_at)::text AS activity_date, COUNT(*) AS count
    FROM inventory_transactions
    WHERE created_at >= CURRENT_DATE - INTERVAL '364 days'
      AND ${flowPredicate(sql`flow_type`, flow)}
    GROUP BY DATE(created_at) ORDER BY activity_date ASC
  `);
  return rows.map((row) => ({ date: row.activity_date, count: Number(row.count) }));
}

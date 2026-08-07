-- specs/16-reporting-and-analytics/design.md §2.1 / §7.3
--
-- `daily_transaction_counts` — materialized view aggregating
-- `inventory_transactions` by day/flow_type/movement_type, backing the
-- activity heatmap and volume-trend widgets on the analytics dashboard.
-- Refresh cadence (hourly) is owned by spec `04`'s scheduled job
-- infrastructure; this migration only creates the view and the supporting
-- unique index.
--
-- Per design.md §7.3: "The materialized view must support `REFRESH
-- MATERIALIZED VIEW CONCURRENTLY` so stale data is never blocked during
-- refresh. This requires a unique index on `(activity_date, flow_type,
-- movement_type)`." Postgres requires a unique index covering every column
-- of a materialized view for `REFRESH ... CONCURRENTLY` to be usable at
-- all -- without it, the refresh command fails outright rather than just
-- being slower, so the index below is not optional.

CREATE MATERIALIZED VIEW daily_transaction_counts AS
SELECT
  DATE(created_at)    AS activity_date,
  flow_type,
  movement_type,
  COUNT(*)            AS transaction_count
FROM inventory_transactions
GROUP BY DATE(created_at), flow_type, movement_type;
--> statement-breakpoint

CREATE UNIQUE INDEX "daily_transaction_counts_activity_date_flow_type_movement_type_idx"
  ON "daily_transaction_counts" USING btree ("activity_date", "flow_type", "movement_type");

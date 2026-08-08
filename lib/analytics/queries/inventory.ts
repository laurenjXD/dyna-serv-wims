import { sql } from "drizzle-orm";
import type { AnalyticsExecutor } from "./shared";
import { defaultAnalyticsExecutor, type AnalyticsFlow, toNumber } from "./shared";

export type InventoryKpis = { totalLotsInStock: number; totalCommittedQty: number; lowStockItemsCount: number };

export async function getInventoryKpis(executor: AnalyticsExecutor = defaultAnalyticsExecutor): Promise<InventoryKpis> {
  const [row] = await executor.execute<{ total_lots_in_stock: string; total_committed_qty: string | null; low_stock_items_count: string }>(sql`
    WITH low_stock AS (
      SELECT i.id
      FROM items i
      JOIN lots l ON l.item_id = i.id AND l.status = 'available'
      JOIN lot_inventory_totals lit ON lit.lot_id = l.id
      GROUP BY i.id, i.min_reorder_level
      HAVING SUM(lit.qty_available) < i.min_reorder_level
    )
    SELECT
      (SELECT COUNT(*) FROM lots WHERE status = 'available') AS total_lots_in_stock,
      (SELECT COALESCE(SUM(lit.qty_committed), 0) FROM lot_inventory_totals lit JOIN lots l ON l.id = lit.lot_id WHERE l.status = 'available') AS total_committed_qty,
      (SELECT COUNT(*) FROM low_stock) AS low_stock_items_count
  `);
  return { totalLotsInStock: toNumber(row?.total_lots_in_stock ?? 0), totalCommittedQty: toNumber(row?.total_committed_qty ?? 0), lowStockItemsCount: toNumber(row?.low_stock_items_count ?? 0) };
}

export async function getStockLevelSummary(flow: AnalyticsFlow, executor: AnalyticsExecutor = defaultAnalyticsExecutor) {
  return executor.execute(sql`
    SELECT l.id AS lot_id, l.lot_number, l.flow_type, l.status, l.expiry_date, l.owner_party_id,
      i.code AS item_code, i.name AS item_name,
      lit.qty_available, lit.qty_committed, lit.qty_remaining
    FROM lot_inventory_totals lit
    JOIN lots l ON l.id = lit.lot_id
    JOIN items i ON i.id = l.item_id
    WHERE l.status = 'available' AND (${flow === "all" ? sql`TRUE` : sql`l.flow_type = ${flow}::flow_type`})
    ORDER BY l.created_at ASC
  `);
}

export async function getLotStatusDistribution(executor: AnalyticsExecutor = defaultAnalyticsExecutor) {
  return executor.execute(sql`SELECT status, COUNT(*) AS count FROM lots GROUP BY status ORDER BY status`);
}

export async function getLowStockItems(flow: AnalyticsFlow, executor: AnalyticsExecutor = defaultAnalyticsExecutor) {
  return executor.execute(sql`
    SELECT i.id, i.code, i.name, l.flow_type, i.min_reorder_level, SUM(lit.qty_available) AS qty_available
    FROM items i
    JOIN lots l ON l.item_id = i.id AND l.status = 'available'
    JOIN lot_inventory_totals lit ON lit.lot_id = l.id
    WHERE (${flow === "all" ? sql`TRUE` : sql`l.flow_type = ${flow}::flow_type`})
    GROUP BY i.id, i.code, i.name, l.flow_type, i.min_reorder_level
    HAVING SUM(lit.qty_available) < i.min_reorder_level
    ORDER BY qty_available ASC, i.code ASC
  `);
}

export async function getFifoFefoQueueHealth(executor: AnalyticsExecutor = defaultAnalyticsExecutor) {
  return executor.execute(sql`
    SELECT DISTINCT ON (l.item_id, l.flow_type)
      l.item_id, l.flow_type, i.code AS item_code, i.name AS item_name, l.lot_number, l.created_at,
      l.expiry_date, i.is_perishable,
      EXTRACT(DAY FROM NOW() - l.created_at)::integer AS days_in_stock
    FROM lots l
    JOIN items i ON i.id = l.item_id
    JOIN lot_inventory_totals lit ON lit.lot_id = l.id AND lit.qty_available > 0
    WHERE l.status = 'available'
    ORDER BY l.item_id, l.flow_type, CASE WHEN i.is_perishable THEN l.expiry_date END ASC NULLS LAST, l.created_at ASC
  `);
}

export async function getFlowPartitionSummary(executor: AnalyticsExecutor = defaultAnalyticsExecutor) {
  return executor.execute(sql`
    SELECT l.flow_type, COUNT(DISTINCT l.id) AS lot_count, COUNT(DISTINCT l.item_id) AS item_count,
      COALESCE(SUM(lit.qty_available), 0) AS qty_available,
      COALESCE(SUM(lit.qty_remaining * i.volume_cbm), 0) AS occupied_cbm
    FROM lots l
    JOIN items i ON i.id = l.item_id
    JOIN lot_inventory_totals lit ON lit.lot_id = l.id
    WHERE l.status = 'available'
    GROUP BY l.flow_type
    ORDER BY l.flow_type
  `);
}

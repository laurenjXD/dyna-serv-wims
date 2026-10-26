import { sql } from "drizzle-orm";
import type { AnalyticsExecutor } from "./shared";
import { defaultAnalyticsExecutor, toNumber } from "./shared";

export type GmroiSummary = {
  gmroiScore: number; // e.g. 2.45
  grossMarginTotal: number;
  averageInventoryValue: number;
  inventoryTurnoverRatio: number;
};

export type AgingInventoryBucketRow = {
  itemId: string;
  itemCode: string;
  itemName: string;
  uom: string;
  qty30Days: number;
  qty60Days: number;
  qty90PlusDays: number;
  totalQty: number;
  totalValue: number;
};

export type StarsAndDogsItem = {
  id: string;
  name: string;
  code: string;
  xTurnover: number;
  yGrossMarginPct: number;
  volume: number;
  category: string;
};

export async function getGmroiAndTurnover(
  executor: AnalyticsExecutor = defaultAnalyticsExecutor
): Promise<GmroiSummary> {
  const [row] = await executor.execute<{
    gross_margin_total: string | null;
    avg_inventory_value: string | null;
    cogs_total: string | null;
  }>(sql`
    WITH item_financials AS (
      SELECT
        i.id,
        COALESCE(i.buying_price, 0) AS buy_price,
        COALESCE(i.selling_price, 0) AS sell_price,
        COALESCE(SUM(lit.qty_available), 0) AS qty_available,
        COALESCE(SUM(lit.qty_remaining), 0) AS qty_remaining
      FROM items i
      JOIN lots l ON l.item_id = i.id AND l.flow_type = 'trading'::flow_type
      JOIN lot_inventory_totals lit ON lit.lot_id = l.id
      WHERE l.status = 'available'::lot_status
      GROUP BY i.id, i.buying_price, i.selling_price
    ),
    dispatched_trading AS (
      SELECT
        pli.item_id,
        SUM(pli.requested_qty) AS dispatched_qty
      FROM pick_list_items pli
      JOIN pick_lists pl ON pl.id = pli.pick_list_id
      WHERE pl.status = 'dispatched'::pick_list_status
        AND pl.flow_type = 'trading'::flow_type
        AND pl.created_at >= NOW() - INTERVAL '90 days'
      GROUP BY pli.item_id
    )
    SELECT
      COALESCE(SUM(dt.dispatched_qty * (i.selling_price - i.buying_price)), 0) AS gross_margin_total,
      COALESCE(SUM(dt.dispatched_qty * i.buying_price), 0) AS cogs_total,
      COALESCE(SUM(i.qty_remaining * i.buy_price), 0) AS avg_inventory_value
    FROM item_financials i
    LEFT JOIN dispatched_trading dt ON dt.item_id = i.id
  `);

  const grossMargin = toNumber(row?.gross_margin_total ?? 0);
  const avgInvValue = Math.max(0, toNumber(row?.avg_inventory_value ?? 0));
  const cogs = toNumber(row?.cogs_total ?? 0);

  const gmroi = avgInvValue > 0 ? Math.round((grossMargin / avgInvValue) * 100) / 100 : 0;
  const turns = avgInvValue > 0 ? Math.round((cogs / avgInvValue) * 10) / 10 : 0;

  return {
    gmroiScore: gmroi,
    grossMarginTotal: grossMargin,
    averageInventoryValue: avgInvValue,
    inventoryTurnoverRatio: turns,
  };
}

export async function getDeadStockAndAgingReport(
  executor: AnalyticsExecutor = defaultAnalyticsExecutor
): Promise<AgingInventoryBucketRow[]> {
  const rows = await executor.execute<{
    item_id: string;
    item_code: string;
    item_name: string;
    uom: string;
    qty_30_days: string;
    qty_60_days: string;
    qty_90_plus_days: string;
    total_qty: string;
    total_value: string;
  }>(sql`
    WITH lot_age AS (
      SELECT
        l.item_id,
        lit.qty_available,
        (lit.qty_available * COALESCE(i.buying_price, 0)) AS val,
        EXTRACT(DAY FROM NOW() - l.created_at) AS days_old
      FROM lots l
      JOIN items i ON i.id = l.item_id
      JOIN lot_inventory_totals lit ON lit.lot_id = l.id
      WHERE l.flow_type = 'trading'::flow_type
        AND l.status = 'available'::lot_status
        AND lit.qty_available > 0
    )
    SELECT
      i.id AS item_id,
      i.code AS item_code,
      i.name AS item_name,
      i.uom,
      COALESCE(SUM(CASE WHEN la.days_old <= 30 THEN la.qty_available ELSE 0 END), 0) AS qty_30_days,
      COALESCE(SUM(CASE WHEN la.days_old > 30 AND la.days_old <= 60 THEN la.qty_available ELSE 0 END), 0) AS qty_60_days,
      COALESCE(SUM(CASE WHEN la.days_old > 60 THEN la.qty_available ELSE 0 END), 0) AS qty_90_plus_days,
      COALESCE(SUM(la.qty_available), 0) AS total_qty,
      COALESCE(SUM(la.val), 0) AS total_value
    FROM items i
    JOIN lot_age la ON la.item_id = i.id
    GROUP BY i.id, i.code, i.name, i.uom
    ORDER BY qty_90_plus_days DESC, total_qty DESC
    LIMIT 15
  `);

  return rows.map((r) => ({
    itemId: r.item_id,
    itemCode: r.item_code,
    itemName: r.item_name,
    uom: r.uom,
    qty30Days: toNumber(r.qty_30_days),
    qty60Days: toNumber(r.qty_60_days),
    qty90PlusDays: toNumber(r.qty_90_plus_days),
    totalQty: toNumber(r.total_qty),
    totalValue: toNumber(r.total_value),
  }));
}

export async function getStarsAndDogsMatrix(
  executor: AnalyticsExecutor = defaultAnalyticsExecutor
): Promise<StarsAndDogsItem[]> {
  const rows = await executor.execute<{
    id: string;
    code: string;
    name: string;
    category: string | null;
    turnover_velocity: string | null;
    gross_margin_pct: string | null;
    volume: string | null;
  }>(sql`
    SELECT
      i.id,
      i.code,
      i.name,
      c.name AS category,
      CASE
        WHEN i.buying_price > 0 AND i.selling_price > 0
        THEN ROUND(((i.selling_price - i.buying_price) / i.selling_price * 100)::numeric, 1)
        ELSE NULL
      END AS gross_margin_pct,
      COALESCE(ROUND((COALESCE(SUM(pli.requested_qty), 0) / NULLIF(COALESCE(SUM(lit.qty_available), 0), 0))::numeric, 1), 0) AS turnover_velocity,
      COALESCE(SUM(lit.qty_available), 0) AS volume
    FROM items i
    LEFT JOIN item_categories c ON c.id = i.categoryId
    LEFT JOIN lots l ON l.item_id = i.id AND l.flow_type = 'trading'::flow_type
    LEFT JOIN lot_inventory_totals lit ON lit.lot_id = l.id
    LEFT JOIN pick_list_items pli ON pli.item_id = i.id
    WHERE i.isActive = TRUE
    GROUP BY i.id, i.code, i.name, c.name, i.buying_price, i.selling_price
    LIMIT 20
  `);

  if (rows.length === 0) {
    return [];
  }

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    category: r.category ?? "General",
    xTurnover: toNumber(r.turnover_velocity),
    yGrossMarginPct: toNumber(r.gross_margin_pct),
    volume: toNumber(r.volume),
  }));
}

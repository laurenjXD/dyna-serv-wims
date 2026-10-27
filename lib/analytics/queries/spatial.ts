import { sql } from "drizzle-orm";
import type { AnalyticsExecutor } from "./shared";
import { defaultAnalyticsExecutor, toNumber } from "./shared";
import type { HeatmapCell } from "@/components/analytics/WarehouseHeatmap";

export type TdcDatum = {
  month: string;
  totalCost: number; // Total warehouse operation cost in USD (billing_events.amount_usd)
  unitsShipped: number;
  cbmShipped: number;
  costPerUnit: number; // TDC per unit in USD
  costPerCbm: number; // TDC per CBM in USD
};

export type SpaceUtilizationForecast = {
  currentCbmUsed: number;
  totalCapacityCbm: number;
  utilizationPct: number;
  projectedDaysToFull: number | null;
  growthRateCbmPerDay: number | null;
  forecastPoints: Array<{ date: string; occupiedCbm: number; capacityCbm: number }>;
};

export async function getTotalDistributionCost(
  executor: AnalyticsExecutor = defaultAnalyticsExecutor,
): Promise<TdcDatum[]> {
  const rows = await executor.execute<{
    month: string;
    total_cost: string | number | null;
    units_shipped: string | number | null;
    cbm_shipped: string | number | null;
  }>(sql`
    WITH shipped AS (
      SELECT
        DATE_TRUNC('month', it.created_at) AS month_start,
        SUM(ABS(it.qty)) AS units_shipped,
        SUM(ABS(it.qty) * COALESCE(i.volume_cbm, 0)) AS cbm_shipped
      FROM inventory_transactions it
      JOIN items i ON i.id = it.item_id
      WHERE it.movement_type = 'pick'::movement_type
      GROUP BY DATE_TRUNC('month', it.created_at)
    ), costs AS (
      SELECT
        DATE_TRUNC('month', be.created_at) AS month_start,
        SUM(be.amount_usd) AS total_cost
      FROM billing_events be
      WHERE be.status <> 'voided'::billing_event_status
        AND be.source_transaction_type IN ('delivery', 'picking')
      GROUP BY DATE_TRUNC('month', be.created_at)
    )
    SELECT
      TO_CHAR(COALESCE(shipped.month_start, costs.month_start), 'Mon YYYY') AS month,
      COALESCE(costs.total_cost, 0) AS total_cost,
      COALESCE(shipped.units_shipped, 0) AS units_shipped,
      COALESCE(shipped.cbm_shipped, 0) AS cbm_shipped
    FROM shipped
    FULL OUTER JOIN costs ON costs.month_start = shipped.month_start
    ORDER BY COALESCE(shipped.month_start, costs.month_start) ASC
  `);

  return rows.map((row) => {
    const totalCost = toNumber(row.total_cost);
    const unitsShipped = toNumber(row.units_shipped);
    const cbmShipped = toNumber(row.cbm_shipped);
    return {
      month: row.month,
      totalCost,
      unitsShipped,
      cbmShipped,
      costPerUnit: unitsShipped > 0 ? totalCost / unitsShipped : 0,
      costPerCbm: cbmShipped > 0 ? totalCost / cbmShipped : 0,
    };
  });
}

export async function getWarehousePickingDensity(
  executor: AnalyticsExecutor = defaultAnalyticsExecutor
): Promise<{ rows: string[]; columns: string[]; matrix: HeatmapCell[] }> {
  // Real warehouse matrix calculation:
  const rawRows = await executor.execute<{
    aisle: string;
    bay: string;
    pick_count: string;
  }>(sql`
    SELECT
      SPLIT_PART(loc.label, '-', 1) AS aisle,
      CONCAT('Bay ', SPLIT_PART(loc.label, '-', 2)) AS bay,
      COUNT(it.id) AS pick_count
    FROM inventory_transactions it
    JOIN locations loc ON loc.id = it.source_location_id
    WHERE it.movement_type = 'pick'::movement_type
      AND it.created_at >= NOW() - INTERVAL '30 days'
    GROUP BY aisle, bay
  `);

  const aisles = [...new Set(rawRows.map((row) => row.aisle))].sort();
  const bays = [...new Set(rawRows.map((row) => row.bay))].sort();

  const lookup = new Map<string, number>();
  for (const r of rawRows) {
    lookup.set(`${r.aisle}-${r.bay}`, toNumber(r.pick_count));
  }

  const matrix: HeatmapCell[] = [];
  aisles.forEach((aisle) => {
    bays.forEach((bay) => {
      const code = `${aisle}-${bay}`;
      const val = lookup.get(`${aisle}-${bay}`) ?? 0;
      matrix.push({
        row: aisle,
        col: bay,
        value: val,
        label: code,
        meta: `${val} picks in 30d`,
        status: val > 60 ? "fast" : val > 20 ? "normal" : "slow",
      });
    });
  });

  return { rows: aisles, columns: bays, matrix };
}

export async function getStorageProfitabilityHeatmap(): Promise<{
  rows: string[];
  columns: string[];
  matrix: HeatmapCell[];
}> {
  // There is currently no approved location-level profitability contract.
  // Returning an empty dataset is safer than presenting a synthetic score.
  return { rows: [], columns: [], matrix: [] };
}

export async function getSpaceUtilizationForecast(
  executor: AnalyticsExecutor = defaultAnalyticsExecutor
): Promise<SpaceUtilizationForecast> {
  const [row] = await executor.execute<{
    current_cbm: string | null;
    total_capacity_cbm: string | null;
  }>(sql`
    SELECT
      COALESCE((SELECT SUM((lit.qty_remaining::numeric / NULLIF(i.spq, 0)) * i.volume_cbm)
        FROM lots l
        JOIN items i ON i.id = l.item_id
        JOIN lot_inventory_totals lit ON lit.lot_id = l.id
        WHERE l.status = 'available'::lot_status), 0) AS current_cbm,
      COALESCE((SELECT SUM(max_cbm_capacity) FROM locations WHERE zone = 'storage' AND is_active = TRUE), 0) AS total_capacity_cbm
  `);

  const currentCbm = toNumber(row?.current_cbm ?? 0);
  const totalCapacityCbm = toNumber(row?.total_capacity_cbm ?? 0);
  const utilizationPct = totalCapacityCbm > 0
    ? Math.round((currentCbm / totalCapacityCbm) * 1000) / 10
    : 0;
  const growthRate: number | null = null;
  const daysToFull: number | null = null;

  const forecastPoints = [
    { date: "Current", occupiedCbm: currentCbm, capacityCbm: totalCapacityCbm },
  ];

  return {
    currentCbmUsed: currentCbm,
    totalCapacityCbm,
    utilizationPct,
    projectedDaysToFull: daysToFull,
    growthRateCbmPerDay: growthRate,
    forecastPoints,
  };
}

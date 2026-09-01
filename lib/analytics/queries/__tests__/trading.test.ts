import { describe, expect, it } from "vitest";
import {
  getGmroiAndTurnover,
  getDeadStockAndAgingReport,
  getStarsAndDogsMatrix,
} from "../trading";
import type { AnalyticsExecutor } from "../shared";

describe("trading queries", () => {
  it("computes GMROI score and turnover ratio with mock executor", async () => {
    const mockExecutor: AnalyticsExecutor = {
      execute: async <T>() => [
        {
          gross_margin_total: "500000",
          avg_inventory_value: "200000",
          cogs_total: "800000",
        },
      ] as unknown as T[],
    };

    const res = await getGmroiAndTurnover(mockExecutor);
    expect(res.gmroiScore).toBe(2.5); // 500000 / 200000 = 2.5
    expect(res.inventoryTurnoverRatio).toBe(4); // 800000 / 200000 = 4
    expect(res.grossMarginTotal).toBe(500000);
    expect(res.averageInventoryValue).toBe(200000);
  });

  it("extracts dead stock and aging inventory brackets correctly", async () => {
    const mockExecutor: AnalyticsExecutor = {
      execute: async <T>() => [
        {
          item_id: "item-1",
          item_code: "TRD-01",
          item_name: "Hydraulic Pump",
          uom: "pc",
          qty_30_days: "100",
          qty_60_days: "50",
          qty_90_plus_days: "20",
          total_qty: "170",
          total_value: "85000",
        },
      ] as unknown as T[],
    };

    const res = await getDeadStockAndAgingReport(mockExecutor);
    expect(res).toHaveLength(1);
    expect(res[0].itemCode).toBe("TRD-01");
    expect(res[0].qty30Days).toBe(100);
    expect(res[0].qty60Days).toBe(50);
    expect(res[0].qty90PlusDays).toBe(20);
    expect(res[0].totalQty).toBe(170);
    expect(res[0].totalValue).toBe(85000);
  });

  it("maps stars and dogs coordinates correctly", async () => {
    const mockExecutor: AnalyticsExecutor = {
      execute: async <T>() => [
        {
          id: "item-1",
          code: "TRD-VALVE",
          name: "Solenoid Valve",
          category: "Valves",
          gross_margin_pct: "45.0",
          turnover_velocity: "8.2",
          volume: "300",
        },
      ] as unknown as T[],
    };

    const res = await getStarsAndDogsMatrix(mockExecutor);
    expect(res).toHaveLength(1);
    expect(res[0].code).toBe("TRD-VALVE");
    expect(res[0].yGrossMarginPct).toBe(45);
    expect(res[0].xTurnover).toBe(8.2);
    expect(res[0].volume).toBe(300);
  });
});

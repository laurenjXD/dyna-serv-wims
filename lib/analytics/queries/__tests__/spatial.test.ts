import { describe, expect, it } from "vitest";
import {
  getTotalDistributionCost,
  getWarehousePickingDensity,
  getStorageProfitabilityHeatmap,
  getSpaceUtilizationForecast,
} from "../spatial";
import type { AnalyticsExecutor } from "../shared";

describe("spatial queries", () => {
  it("returns TDC time-series data with cost per unit and per cbm", async () => {
    const res = await getTotalDistributionCost();
    expect(res.length).toBeGreaterThan(0);
    expect(res[0]).toHaveProperty("costPerUnit");
    expect(res[0]).toHaveProperty("costPerCbm");
    expect(res[0]).toHaveProperty("month");
  });

  it("builds 2D picking density grid matrix correctly", async () => {
    const mockExecutor: AnalyticsExecutor = {
      execute: async <T>() => [
        {
          aisle: "Aisle A",
          bay: "Bay 01",
          pick_count: "85",
        },
      ] as unknown as T[],
    };

    const res = await getWarehousePickingDensity(mockExecutor);
    expect(res.rows).toContain("Aisle A");
    expect(res.columns).toContain("Bay 01");
    expect(res.matrix.length).toBe(res.rows.length * res.columns.length);

    const cellA1 = res.matrix.find((m) => m.row === "Aisle A" && m.col === "Bay 01");
    expect(cellA1?.value).toBe(85);
  });

  it("computes space utilization forecast correctly", async () => {
    const mockExecutor: AnalyticsExecutor = {
      execute: async <T>() => [
        {
          current_cbm: "600",
        },
      ] as unknown as T[],
    };

    const res = await getSpaceUtilizationForecast(mockExecutor);
    expect(res.currentCbmUsed).toBe(600);
    expect(res.totalCapacityCbm).toBe(1200);
    expect(res.utilizationPct).toBe(50); // 600 / 1200 = 50%
    expect(res.forecastPoints.length).toBeGreaterThan(0);
  });
});

import { describe, it, expect, vi } from "vitest";
import {
  getDashboardKpis,
  getDashboardMonthlyFlow,
  getDashboardLocationOccupancy,
  getDashboardDeliveryPerformance,
  getDashboardHeatmapData,
  getDashboardMasterInventory,
  lookupBarcodeOrQr,
} from "@/lib/db/queries/dashboard";

describe("Dashboard Query Layer", () => {
  it("getDashboardKpis returns structured live KPI telemetry with fallbacks", async () => {
    const kpis = await getDashboardKpis();
    expect(kpis).toBeDefined();
    expect(kpis.valuation).toBeDefined();
    expect(typeof kpis.valuation.total).toBe("number");
    expect(kpis.floorQueues).toBeDefined();
    expect(typeof kpis.floorQueues.pendingReceivingWrrs).toBe("number");
    expect(kpis.stockHealth).toBeDefined();
    expect(typeof kpis.stockHealth.qcPassRatePct).toBe("number");
    expect(kpis.financialSummary).toBeDefined();
    expect(typeof kpis.financialSummary.tradingMarginPct).toBe("number");
  });

  it("getDashboardMonthlyFlow returns monthly grouped flows", async () => {
    const flow = await getDashboardMonthlyFlow();
    expect(flow).toBeDefined();
    expect(Array.isArray(flow.all)).toBe(true);
    expect(flow.all.length).toBeGreaterThan(0);
    expect(flow.all[0]).toHaveProperty("month");
    expect(flow.all[0]).toHaveProperty("inbound");
    expect(flow.all[0]).toHaveProperty("outbound");
  });

  it("getDashboardLocationOccupancy returns zone allocations", async () => {
    const occ = await getDashboardLocationOccupancy();
    expect(Array.isArray(occ)).toBe(true);
    expect(occ.length).toBeGreaterThan(0);
    expect(occ[0]).toHaveProperty("name");
    expect(occ[0]).toHaveProperty("value");
    expect(occ[0]).toHaveProperty("cbmUsed");
  });

  it("getDashboardDeliveryPerformance returns OTIF chart data and mini-metrics", async () => {
    const perf = await getDashboardDeliveryPerformance();
    expect(perf).toBeDefined();
    expect(Array.isArray(perf.chartData)).toBe(true);
    expect(perf.chartData.length).toBeGreaterThan(0);
    expect(perf.miniMetrics).toBeDefined();
    expect(perf.miniMetrics.slaTargetPct).toBe(95.0);
  });

  it("getDashboardHeatmapData returns 31-day activity grid", async () => {
    const heatmap = await getDashboardHeatmapData();
    expect(Array.isArray(heatmap)).toBe(true);
    expect(heatmap.length).toBeGreaterThan(0);
    expect(heatmap[0].length).toBe(31);
    expect(heatmap[0][0]).toHaveProperty("binRow");
    expect(heatmap[0][0]).toHaveProperty("day");
    expect(heatmap[0][0]).toHaveProperty("auditRecord");
  });

  it("getDashboardMasterInventory returns inventory positions and count", async () => {
    const master = await getDashboardMasterInventory({ limit: 10 });
    expect(master).toBeDefined();
    expect(Array.isArray(master.items)).toBe(true);
    expect(typeof master.total).toBe("number");
  });

  it("lookupBarcodeOrQr returns null for blank or unmatched codes", async () => {
    const result = await lookupBarcodeOrQr("NON-EXISTENT-SKU-9999");
    expect(result).toBeNull();
  });
});

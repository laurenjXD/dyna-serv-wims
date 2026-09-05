import { describe, it, expect } from "vitest";
import {
  getReportsExecutiveKpis,
  getVmiBillingReconciliationReport,
  getTradingMarginReport,
  getThroughputReport,
  getDeliveryPerformanceReport,
  getReportArchiveList,
} from "@/lib/db/queries/reports";

describe("Reports Query Layer", () => {
  it("getReportsExecutiveKpis returns executive KPIs and financial margins", async () => {
    const kpis = await getReportsExecutiveKpis();
    expect(kpis).toBeDefined();
    expect(typeof kpis.valuationTotal).toBe("number");
    expect(typeof kpis.vmiAccruedStorage).toBe("number");
    expect(typeof kpis.tradingGrossRevenue).toBe("number");
    expect(typeof kpis.tradingMarginPct).toBe("number");
    expect(typeof kpis.otifRatePct).toBe("number");
  });

  it("getVmiBillingReconciliationReport returns billing rows with rates", async () => {
    const rows = await getVmiBillingReconciliationReport();
    expect(Array.isArray(rows)).toBe(true);
    if (rows.length > 0) {
      expect(rows[0]).toHaveProperty("clientName");
      expect(rows[0]).toHaveProperty("contractedRatePerCbmDay");
      expect(rows[0]).toHaveProperty("mtdAccruedStorage");
      expect(rows[0]).toHaveProperty("unbilledDays");
    }
  });

  it("getTradingMarginReport returns margin history and category breakdown", async () => {
    const report = await getTradingMarginReport();
    expect(report).toBeDefined();
    expect(Array.isArray(report.marginHistory)).toBe(true);
    expect(Array.isArray(report.categoryBreakdown)).toBe(true);
    expect(report.marginHistory.length).toBeGreaterThan(0);
    expect(report.categoryBreakdown.length).toBeGreaterThan(0);
  });

  it("getThroughputReport returns daily and monthly intervals", async () => {
    const daily = await getThroughputReport("daily");
    expect(Array.isArray(daily)).toBe(true);
    expect(daily.length).toBeGreaterThan(0);

    const monthly = await getThroughputReport("monthly");
    expect(Array.isArray(monthly)).toBe(true);
    expect(monthly.length).toBeGreaterThan(0);
  });

  it("getDeliveryPerformanceReport returns SLA history", async () => {
    const sla = await getDeliveryPerformanceReport();
    expect(Array.isArray(sla)).toBe(true);
    expect(sla.length).toBeGreaterThan(0);
    expect(sla[0]).toHaveProperty("otifRate");
    expect(sla[0]).toHaveProperty("targetOtif");
  });

  it("getReportArchiveList returns archived generated document files", async () => {
    const archive = await getReportArchiveList();
    expect(Array.isArray(archive)).toBe(true);
    if (archive.length > 0) {
      expect(archive[0]).toHaveProperty("reportName");
      expect(archive[0]).toHaveProperty("format");
      expect(archive[0]).toHaveProperty("generatedBy");
    }
  });
});

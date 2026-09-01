import { describe, expect, it } from "vitest";
import {
  getVendorScorecards,
  getConsignmentLiabilityAging,
  getVmiStockoutRisk,
} from "../vmi";
import type { AnalyticsExecutor } from "../shared";

describe("vmi queries", () => {
  it("computes vendor scorecards fill rate percentage correctly", async () => {
    const mockExecutor: AnalyticsExecutor = {
      execute: async () => [
        {
          party_id: "vendor-1",
          vendor_name: "Apex Fasteners",
          wrr_count: "5",
          total_expected: "1000",
          total_scanned: "980",
          discrepancy_count: "1",
        },
      ],
    };

    const res = await getVendorScorecards(mockExecutor);
    expect(res).toHaveLength(1);
    expect(res[0].vendorName).toBe("Apex Fasteners");
    expect(res[0].fillRatePct).toBe(98);
    expect(res[0].discrepancyCount).toBe(1);
    expect(res[0].totalReceivedQty).toBe(980);
  });

  it("calculates consignment liability aging brackets correctly", async () => {
    const mockExecutor: AnalyticsExecutor = {
      execute: async () => [
        {
          party_id: "party-1",
          party_name: "Acuity Electronics",
          qty_30: "30000",
          qty_60: "15000",
          qty_90: "5000",
          qty_90_plus: "2000",
          total_val: "52000",
        },
      ],
    };

    const res = await getConsignmentLiabilityAging(mockExecutor);
    expect(res).toHaveLength(1);
    expect(res[0].vendorName).toBe("Acuity Electronics");
    expect(res[0].current0To30Days).toBe(30000);
    expect(res[0].aging31To60Days).toBe(15000);
    expect(res[0].aging61To90Days).toBe(5000);
    expect(res[0].aging90PlusDays).toBe(2000);
    expect(res[0].totalUnbilledLiability).toBe(52000);
  });

  it("flags VMI items at stockout risk with risk levels", async () => {
    const mockExecutor: AnalyticsExecutor = {
      execute: async () => [
        {
          item_id: "item-vmi-1",
          item_code: "VMI-SEAL-01",
          item_name: "Gasket Ring",
          vendor_name: "Pacific Seals",
          qty_available: "20",
          min_reorder_level: "100",
        },
      ],
    };

    const res = await getVmiStockoutRisk(mockExecutor);
    expect(res).toHaveLength(1);
    expect(res[0].itemCode).toBe("VMI-SEAL-01");
    expect(res[0].qtyAvailable).toBe(20);
    expect(res[0].minReorderLevel).toBe(100);
    expect(res[0].deficitQty).toBe(80);
    expect(res[0].riskLevel).toBe("critical"); // 20 <= 100 * 0.3
  });
});

import { describe, expect, it } from "vitest";
import { buildStockAllocationPreview, type StockViewRow } from "../inventory";

const baseRow: StockViewRow = {
  itemId: "item-1", itemCode: "ITEM-1", itemName: "Test item", defaultSupplierPartyId: "party-1", uom: "piece",
  isPerishable: false, lotId: "lot-1", flowType: "trading", lotNumber: "LOT-1", lotStatus: "available",
  expiryDate: null, receivedAt: new Date("2026-01-01T00:00:00Z"),
  locationId: "loc-1", locationLabel: "A-01", qtyRemaining: 10, qtyCommitted: 0,
};

describe("buildStockAllocationPreview", () => {
  it("uses FIFO for non-perishable inventory across locations", () => {
    const result = buildStockAllocationPreview([
      { ...baseRow, lotId: "new", receivedAt: new Date("2026-02-01T00:00:00Z"), locationId: "B" },
      { ...baseRow, lotId: "old", receivedAt: new Date("2026-01-01T00:00:00Z"), locationId: "A" },
    ], "item-1", 15);

    expect(result).toEqual({ ok: true, strategy: "FIFO", lines: [
      { lotId: "old", locationId: "A", qtyAllocated: 10 },
      { lotId: "new", locationId: "B", qtyAllocated: 5 },
    ] });
  });

  it("uses FEFO for perishable inventory and excludes committed quantity", () => {
    const result = buildStockAllocationPreview([
      { ...baseRow, isPerishable: true, lotId: "late", expiryDate: "2026-12-31", qtyRemaining: 10 },
      { ...baseRow, isPerishable: true, lotId: "early", expiryDate: "2026-06-30", qtyRemaining: 10, qtyCommitted: 6 },
    ], "item-1", 8);

    expect(result).toEqual({ ok: true, strategy: "FEFO", lines: [
      { lotId: "early", locationId: "loc-1", qtyAllocated: 4 },
      { lotId: "late", locationId: "loc-1", qtyAllocated: 4 },
    ] });
  });

  it("never returns a partial plan when stock is insufficient", () => {
    expect(buildStockAllocationPreview([baseRow], "item-1", 11)).toEqual({
      ok: false, strategy: "FIFO", error: "insufficient_stock",
    });
  });
});

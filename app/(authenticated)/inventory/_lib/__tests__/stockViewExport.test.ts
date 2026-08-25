import { describe, expect, it } from "vitest";
import { STOCK_VIEW_EXPORT_COLUMNS, toStockViewSpreadsheetXml } from "../stockViewExport";

describe("toStockViewSpreadsheetXml", () => {
  it("creates an Excel-compatible download with the Stock View columns and available quantity", () => {
    const spreadsheet = toStockViewSpreadsheetXml([
      {
        itemId: "item-1",
        itemCode: "DSW-001",
        itemName: "Cable & Clamp",
        defaultSupplierPartyId: "party-1",
        uom: "pcs",
        isPerishable: false,
        lotId: "lot-1",
        flowType: "trading",
        lotNumber: "LOT-001",
        lotStatus: "available",
        expiryDate: null,
        receivedAt: new Date("2026-08-17T00:00:00.000Z"),
        locationId: "loc-1",
        locationLabel: "A-01",
        spq: 1,
        qtyRemaining: 12,
        qtyCommitted: 2,
      },
    ]);

    expect(STOCK_VIEW_EXPORT_COLUMNS).toEqual([
      "Item Code",
      "Item Name",
      "UOM",
      "Lot Number",
      "Location",
      "Available Quantity",
      "Committed Quantity",
      "Expiry Date",
      "Received Date",
      "Lot Status",
      "Allocation Method",
    ]);
    expect(spreadsheet).toContain("<Workbook");
    expect(spreadsheet).toContain("Cable &amp; Clamp");
    expect(spreadsheet).toContain("<Data ss:Type=\"Number\">10</Data>");
    expect(spreadsheet).toContain("FIFO");
  });
});

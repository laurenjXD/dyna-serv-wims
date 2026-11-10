import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ExcelJS from "exceljs";
import { parseCiplDocument } from "../cipl-parser";

describe("cipl-parser", () => {
  it("parses valid CIPL Excel buffer correctly", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Sheet1");

    worksheet.addRow(["Commercial Invoice / Packing List"]);
    worksheet.addRow(["Invoice No:", "INV-2026-99"]);
    worksheet.addRow([]);
    worksheet.addRow(["Item Code", "Lot Number", "Expected Qty", "UOM", "Disposition"]);
    worksheet.addRow(["ITEM-101", "LOT-A1", 100, "BOX", "Store"]);
    worksheet.addRow(["ITEM-102", "LOT-B2", 50, "BOX", "Inspect"]);

    const buffer = (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
    const result = await parseCiplDocument(Buffer.from(buffer), "sample-cipl.xlsx");

    expect(result.ok).toBe(true);
    expect(result.header.ciplReference).toBe("INV-2026-99");
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].itemCode).toBe("ITEM-101");
    expect(result.rows[0].expectedQty).toBe(100);
    expect(result.rows[0].disposition).toBe("store");
    expect(result.rows[1].itemCode).toBe("ITEM-102");
    expect(result.rows[1].disposition).toBe("inspect");
  });

  it("handles unsupported file extensions cleanly", async () => {
    const result = await parseCiplDocument(Buffer.from("dummy"), "document.txt");
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("Unsupported file format");
  });

  it("normalizes thousands separators in CSV quantities", async () => {
    const csv = Buffer.from('Item Code,Quantity,UOM\nITEM-101,"13,500",PCS\n');
    const result = await parseCiplDocument(csv, "sample-cipl.csv");

    expect(result.ok).toBe(true);
    expect(result.rows).toEqual([
      expect.objectContaining({ itemCode: "ITEM-101", expectedQty: 13500, uom: "PCS" }),
    ]);
  });

  it("parses the supplied production CIPL sample (.xls)", async () => {
    const fixture = resolve(process.cwd(), "test-samples", "CIPL PR260030P_Phil whse (08-05).xls");
    const result = await parseCiplDocument(readFileSync(fixture), "CIPL PR260030P_Phil whse (08-05).xls");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.header.ciplReference).toBeTruthy();
      expect(result.rows.some((row) => Number(row.expectedQty) > 0)).toBe(true);
      expect(result.rows[0].itemCode).toBe("AP01000102");
      expect(result.rows[0].customerItemCode).toBe("82012CP100");
      expect(result.rows[0].expectedQty).toBe(13500);
      expect(result.header.ipNumber).toBeUndefined();
    }
  });

  it("handles a spacer row before invoice headers and ignores footer summaries", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Invoice");
    worksheet.addRow([]);
    worksheet.addRow([]);
    worksheet.addRow(["COMMERCIAL INVOICE"]);
    worksheet.addRow(["INVOICE# : PR260030P"]);
    worksheet.addRow([]);
    worksheet.addRow(["Item", "UBoT P/N", "Descriptions", "Cust P/N", "Cust PO#", "Unit Price", "Quantity", "UOM", "Amount"]);
    worksheet.addRow(["(line items)"]);
    worksheet.addRow(["1", "AP01000102", "CARRIER TAPE", "82012CP100", "47361784", 0.01, "13,500", "M", 135]);
    worksheet.addRow(["", "", "Item 01 - 03 : ADGT", "39239090000", "PLASTIC TRAY", 35420, 13084, "", ""]);

    const result = await parseCiplDocument(
      Buffer.from((await workbook.xlsx.writeBuffer()) as unknown as Buffer),
      "spacer-row-cipl.xlsx",
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ itemCode: "AP01000102", expectedQty: 13500, uom: "M" });
    expect(result.mappingSnapshot.headerRow).toBe(4);
    expect(result.mappingSnapshot.columns.find((column) => column.suggestedTarget === "itemCode")?.header).toBe("UBoT P/N");
  });
});

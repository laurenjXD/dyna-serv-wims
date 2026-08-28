import { describe, expect, it } from "vitest";
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
});

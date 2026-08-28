import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { parseDraDocument } from "../dra-parser";

describe("dra-parser", () => {
  it("parses valid DRA Excel buffer correctly", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("DRA Sheet");

    worksheet.addRow(["Delivery Release Advice"]);
    worksheet.addRow(["DRA Ref:", "DRA-8821"]);
    worksheet.addRow([]);
    worksheet.addRow(["Item Code", "Requested Qty", "UOM"]);
    worksheet.addRow(["ITEM-500", 25, "BOX"]);
    worksheet.addRow(["ITEM-600", 10, "BOX"]);

    const buffer = (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
    const result = await parseDraDocument(Buffer.from(buffer), "release-advice.xlsx");

    expect(result.ok).toBe(true);
    expect(result.header.draReference).toBe("DRA-8821");
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].itemCode).toBe("ITEM-500");
    expect(result.rows[0].requestedQty).toBe(25);
    expect(result.rows[1].itemCode).toBe("ITEM-600");
    expect(result.rows[1].requestedQty).toBe(10);
  });

  it("handles unsupported file extensions cleanly", async () => {
    const result = await parseDraDocument(Buffer.from("dummy"), "document.docx");
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("Unsupported file format");
  });
});

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

  it("parses DSGC WR NO as draReference correctly", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("WR Sheet");

    worksheet.addRow(["Warehouse Release Form"]);
    worksheet.addRow(["DSGC WR NO:", "WR-2026-0901"]);
    worksheet.addRow([]);
    worksheet.addRow(["Item Code", "Requested Qty", "UOM"]);
    worksheet.addRow(["ITEM-500", 15, "BOX"]);

    const buffer = (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
    const result = await parseDraDocument(Buffer.from(buffer), "release-form.xlsx");

    expect(result.ok).toBe(true);
    expect(result.header.draReference).toBe("WR-2026-0901");
    expect(result.rows[0].requestedQty).toBe(15);
  });

  it("keeps the requesting Organization separate from the delivery recipient", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("DRA Sheet");

    worksheet.addRow(["DRA Ref:", "DRA-ORG-1"]);
    worksheet.addRow(["REQUESTED BY:", "Customer Organization"]);
    worksheet.addRow(["DELIVERY TO:", "End Customer Organization"]);
    worksheet.addRow(["Item Code", "Requested Qty", "UOM"]);
    worksheet.addRow(["ITEM-500", 5, "BOX"]);

    const buffer = (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
    const result = await parseDraDocument(Buffer.from(buffer), "release-advice.xlsx");

    expect(result.ok).toBe(true);
    expect(result.header.requestingOrganization).toBe("Customer Organization");
    expect(result.header.recipientOrganization).toBe("End Customer Organization");
  });

  it("handles unsupported file extensions cleanly", async () => {
    const result = await parseDraDocument(Buffer.from("dummy"), "document.docx");
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("Unsupported file format");
  });
});

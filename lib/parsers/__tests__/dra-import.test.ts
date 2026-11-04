import { beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { parseDraDocument, type DraParseResult, type ParsedDraRow } from "../dra-parser";

const pdf = vi.hoisted(() => ({
  getText: vi.fn(),
  destroy: vi.fn(),
  constructor: vi.fn(),
}));

vi.mock("pdf-parse", () => ({
  PDFParse: class {
    constructor(options: unknown) { pdf.constructor(options); }
    getText = pdf.getText;
    destroy = pdf.destroy;
  },
}));

type Column = "itemCode" | "customerItemCode" | "itemDescription" | "requestedQty" | "packageCount" | "spq" | "uom" | "remarks";
type ImportOptions = { sheetName?: string; headerRowIndex?: number; columnMap?: Partial<Record<Column, number>> };
type ImportResult = Omit<DraParseResult, "rows"> & {
  rows: Array<ParsedDraRow & { sourceRow?: number }>;
  spreadsheet?: {
    sheetNames: string[];
    sheetName: string;
    headerRowIndex: number;
    columns: Array<{ index: number; label: string }>;
    columnMap: Partial<Record<Column, number>>;
  };
};
// Keep the regression suite executable before the optional mapping contract is
// implemented; the RED assertions exercise runtime behavior, not TS errors.
const parse = parseDraDocument as (buffer: Buffer, name: string, options?: ImportOptions) => Promise<ImportResult>;

async function spreadsheet(rows: unknown[][], name = "Release"): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(name);
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await book.xlsx.writeBuffer());
}

describe("R1.8 DRA import review and explicit mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pdf.destroy.mockResolvedValue(undefined);
    pdf.getText.mockResolvedValue({ text: "DRA No: DRA-420\nREQUESTED BY: OWNER-1\nDELIVERY TO: RECIPIENT-1\nABC-123 20 PCS" });
  });

  it("exposes detected sheet, columns, and source row so operators can review mappings", async () => {
    const result = await parse(await spreadsheet([
      ["Item Code", "Requested Qty", "UOM"],
      ["ABC-123", 20, "PCS"],
    ]), "release.xlsx");

    expect(result.spreadsheet).toMatchObject({
      sheetNames: ["Release"],
      sheetName: "Release",
      headerRowIndex: 0,
      columns: [{ index: 0, label: "Item Code" }, { index: 1, label: "Requested Qty" }, { index: 2, label: "UOM" }],
      columnMap: { itemCode: 0, requestedQty: 1, uom: 2 },
    });
    expect(result.rows[0]).toMatchObject({ itemCode: "ABC-123", requestedQty: 20, sourceRow: 2 });
  });

  it("applies explicit mapping for unfamiliar columns on the selected worksheet", async () => {
    const book = new ExcelJS.Workbook();
    book.addWorksheet("Cover").addRow(["Cover only"]);
    const release = book.addWorksheet("Actual release");
    release.addRow(["Delivery Release Advice"]);
    release.addRow(["Client ref", "Pieces needed", "Cartons required", "Pack size", "Comment"]);
    release.addRow(["CUST-007", 100, 5, 20, "Keep upright"]);

    const result = await parse(Buffer.from(await book.xlsx.writeBuffer()), "release.xlsx", {
      sheetName: "Actual release",
      headerRowIndex: 1,
      columnMap: { customerItemCode: 0, requestedQty: 1, packageCount: 2, spq: 3, remarks: 4 },
    });

    expect(result.ok).toBe(true);
    expect(result.rows).toEqual([expect.objectContaining({
      customerItemCode: "CUST-007", requestedQty: 100, packageCount: 5, spq: 20, remarks: "Keep upright", sourceRow: 3,
    })]);
    expect(result.spreadsheet?.sheetName).toBe("Actual release");
    expect(result.spreadsheet?.sheetNames).toEqual(["Cover", "Actual release"]);
  });

  it("records the actual header row when a blank worksheet row precedes it", async () => {
    const result = await parse(await spreadsheet([
      ["Delivery Release Advice"],
      ["", "", ""],
      ["Item Code", "Requested Qty", "UOM"],
      ["ABC-123", 20, "PCS"],
    ]), "release.xlsx");

    expect(result.spreadsheet?.headerRowIndex).toBe(2);
    expect(result.rows).toEqual([expect.objectContaining({ itemCode: "ABC-123", requestedQty: 20, sourceRow: 4 })]);
  });

  it("does not mistake a customer item column header for the requesting Organization", async () => {
    const result = await parse(await spreadsheet([
      ["Customer Item Code", "Requested Qty", "UOM"],
      ["CUST-123", 20, "PCS"],
    ]), "release.xlsx");

    expect(result.header.requestingOrganization).toBeUndefined();
    expect(result.rows[0].customerItemCode).toBe("CUST-123");
  });

  it("keeps worksheet choices available when the default cover worksheet is empty", async () => {
    const book = new ExcelJS.Workbook();
    book.addWorksheet("Cover");
    const release = book.addWorksheet("Release");
    release.addRow(["Item Code", "Requested Qty"]);
    release.addRow(["ABC-123", 20]);
    const result = await parse(Buffer.from(await book.xlsx.writeBuffer()), "release.xlsx");

    expect(result.ok).toBe(true);
    expect(result.rows).toEqual([]);
    expect(result.spreadsheet).toMatchObject({ sheetNames: ["Cover", "Release"], sheetName: "Cover", headerRowIndex: 0, columns: [], columnMap: {} });
    expect(result.warnings.join(" ")).toMatch(/worksheet|sheet/i);
  });

  it("does not turn a carton-only request into a base-unit quantity", async () => {
    const result = await parse(await spreadsheet([
      ["Item Code", "Box Count"],
      ["ABC-123", 5],
    ]), "release.xlsx");

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].packageCount).toBe(5);
    expect(result.rows[0].requestedQty).toBeUndefined();
  });

  it("does not derive base units and label them as boxes when only box count and SPQ were provided", async () => {
    const result = await parse(await spreadsheet([
      ["Item Code", "Boxes", "SPQ", "UOM"],
      ["ABC-123", 5, 20, "BOX"],
    ]), "release.xlsx", {
      headerRowIndex: 0,
      columnMap: { itemCode: 0, packageCount: 1, spq: 2, uom: 3 },
    });

    expect(result.rows[0]).toMatchObject({ packageCount: 5, spq: 20, uom: "BOX" });
    expect([undefined, 5]).toContain(result.rows[0].requestedQty);
  });

  it("may derive base-unit demand from box count and SPQ when the document UOM is PCS", async () => {
    const result = await parse(await spreadsheet([
      ["Item Code", "Boxes", "SPQ", "UOM"],
      ["ABC-123", 5, 20, "PCS"],
    ]), "release.xlsx", {
      headerRowIndex: 0,
      columnMap: { itemCode: 0, packageCount: 1, spq: 2, uom: 3 },
    });

    expect(result.rows[0]).toMatchObject({ packageCount: 5, requestedQty: 100, spq: 20, uom: "PCS" });
  });

  it("preserves an explicit requested quantity even when carton count and SPQ differ", async () => {
    const result = await parse(await spreadsheet([
      ["Item Code", "Requested Qty", "Boxes", "SPQ", "UOM"],
      ["ABC-123", 7, 5, 20, "BOX"],
    ]), "release.xlsx", {
      headerRowIndex: 0,
      columnMap: { itemCode: 0, requestedQty: 1, packageCount: 2, spq: 3, uom: 4 },
    });

    expect(result.rows[0]).toMatchObject({ packageCount: 5, requestedQty: 7, spq: 20, uom: "BOX" });
  });

  it("keeps zero requests and invalid quantity rows visible for correction", async () => {
    const result = await parse(await spreadsheet([
      ["Item Code", "Requested Qty", "Box Count", "SPQ", "UOM"],
      ["ZERO-001", 0, 3, 20, "PCS"],
      ["BAD-002", "not a quantity", "unknown", 20, "PCS"],
    ]), "release.xlsx");

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ itemCode: "ZERO-001", requestedQty: 0, sourceRow: 2 });
    expect(result.rows[1]).toMatchObject({ itemCode: "BAD-002", sourceRow: 3 });
    expect(result.warnings.join(" ")).toMatch(/row\s*3/i);
  });

  it("requires mapping instead of assuming the first two unidentified columns are code and quantity", async () => {
    const result = await parse(await spreadsheet([
      ["Misc reference", "Unlabelled amount"],
      ["NOT-A-VERIFIED-ITEM", 400],
    ]), "release.xlsx");

    expect(result.rows).toEqual([]);
    expect(result.spreadsheet).toBeDefined();
    expect(result.warnings.join(" ")).toMatch(/map|column/i);
  });

  it("rejects duplicate mapped source columns rather than interpreting one number as boxes and units", async () => {
    const result = await parse(await spreadsheet([
      ["Reference", "Amount"], ["ABC-123", 5],
    ]), "release.xlsx", { headerRowIndex: 0, columnMap: { itemCode: 0, requestedQty: 1, packageCount: 1 } });

    expect(result.ok).toBe(false);
    expect(result.rows).toEqual([]);
    expect(result.errors.join(" ")).toMatch(/column/i);
  });

  it("parses text PDFs using the installed PDFParse API and closes the parser", async () => {
    const result = await parse(Buffer.from("%PDF fixture"), "release.pdf");

    expect(result.ok).toBe(true);
    expect(result.header).toMatchObject({ draReference: "DRA-420", requestingOrganization: "OWNER-1", recipientOrganization: "RECIPIENT-1" });
    expect(result.rows).toEqual([expect.objectContaining({ itemCode: "ABC-123", requestedQty: 20, uom: "PCS" })]);
    expect(pdf.constructor).toHaveBeenCalledWith(expect.objectContaining({ data: expect.any(Uint8Array) }));
    expect(pdf.destroy).toHaveBeenCalledOnce();
  });

  it("closes the PDF parser even when text extraction fails", async () => {
    pdf.getText.mockRejectedValueOnce(new Error("Unreadable PDF"));
    const result = await parse(Buffer.from("%PDF fixture"), "broken.pdf");

    expect(result.ok).toBe(false);
    expect(result.rows).toEqual([]);
    expect(pdf.destroy).toHaveBeenCalledOnce();
  });
});

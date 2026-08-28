import ExcelJS from "exceljs";
import { PassThrough } from "node:stream";

export interface ParsedCiplRow {
  itemCode?: string;
  customerItemCode?: string;
  lotNumber?: string;
  mfgDate?: string;
  expiryDate?: string;
  expectedQty?: number;
  uom?: string;
  remarks?: string;
  disposition?: "store" | "inspect";
}

export interface CiplParseResult {
  ok: boolean;
  fileName: string;
  header: {
    ciplReference?: string;
    invoiceDate?: string;
    mawbMbl?: string;
    vendorOrganization?: string;
  };
  rows: ParsedCiplRow[];
  errors: string[];
  warnings: string[];
}

/**
 * Parses Commercial Invoice & Packing List (CIPL) files in Excel (.xlsx, .xls, .csv) or PDF (.pdf) format.
 */
export async function parseCiplDocument(buffer: Buffer, fileName: string): Promise<CiplParseResult> {
  const ext = fileName.slice(((fileName.lastIndexOf(".") - 1) >>> 0) + 2).toLowerCase();

  if (ext === "pdf") {
    return parseCiplPdf(buffer, fileName);
  } else if (["xlsx", "xls", "csv"].includes(ext)) {
    return parseCiplExcel(buffer, fileName);
  } else {
    return {
      ok: false,
      fileName,
      header: {},
      rows: [],
      errors: [`Unsupported file format .${ext}. Please upload an Excel (.xlsx, .csv) or PDF (.pdf) file.`],
      warnings: [],
    };
  }
}

async function parseCiplExcel(buffer: Buffer, fileName: string): Promise<CiplParseResult> {
  const result: CiplParseResult = {
    ok: true,
    fileName,
    header: {},
    rows: [],
    errors: [],
    warnings: [],
  };

  try {
    const workbook = new ExcelJS.Workbook();
    const isCsv = fileName.toLowerCase().endsWith(".csv");

    if (isCsv) {
      const bufferStream = new PassThrough();
      bufferStream.end(buffer);
      await workbook.csv.read(bufferStream);
    } else {
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    }

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      result.ok = false;
      result.errors.push("The uploaded Excel workbook contains no worksheets.");
      return result;
    }

    let headerRowIndex = -1;
    const colMap: Record<string, number> = {};

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber > 25) return;
      const values = row.values as (string | number | undefined | null)[];
      const rowText = values.map((v) => String(v ?? "").toLowerCase()).join(" ");

      if (rowText.includes("invoice") || rowText.includes("cipl")) {
        values.forEach((cell, idx) => {
          const str = String(cell ?? "");
          if (str.toLowerCase().includes("inv") || str.toLowerCase().includes("cipl")) {
            const nextCell = values[idx + 1];
            if (nextCell && !result.header.ciplReference) {
              result.header.ciplReference = String(nextCell).trim();
            }
          }
        });
      }

      if (
        headerRowIndex === -1 &&
        (rowText.includes("item") || rowText.includes("sku") || rowText.includes("part") || rowText.includes("description")) &&
        (rowText.includes("qty") || rowText.includes("quantity") || rowText.includes("count"))
      ) {
        headerRowIndex = rowNumber;
        values.forEach((cell, idx) => {
          if (!cell) return;
          const val = String(cell).trim().toLowerCase();
          if (val.includes("item code") || val.includes("sku") || val === "item" || val.includes("part no")) {
            colMap["itemCode"] = idx;
          } else if (val.includes("customer item") || val.includes("cust item")) {
            colMap["customerItemCode"] = idx;
          } else if (val.includes("lot") || val.includes("batch")) {
            colMap["lotNumber"] = idx;
          } else if (val.includes("mfg") || val.includes("manufacture")) {
            colMap["mfgDate"] = idx;
          } else if (val.includes("expiry") || val.includes("exp date")) {
            colMap["expiryDate"] = idx;
          } else if (val.includes("qty") || val.includes("quantity") || val.includes("expected")) {
            colMap["expectedQty"] = idx;
          } else if (val.includes("uom") || val.includes("unit")) {
            colMap["uom"] = idx;
          } else if (val.includes("disp") || val.includes("disposition")) {
            colMap["disposition"] = idx;
          } else if (val.includes("remark") || val.includes("note")) {
            colMap["remarks"] = idx;
          }
        });
      }
    });

    if (headerRowIndex === -1) {
      headerRowIndex = 1;
      colMap["itemCode"] = 1;
      colMap["expectedQty"] = 2;
      colMap["uom"] = 3;
      colMap["lotNumber"] = 4;
      result.warnings.push("Could not unambiguously identify table headers; using default column positions.");
    }

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber <= headerRowIndex) return;

      const values = row.values as (string | number | undefined | null)[];
      const itemCodeRaw = colMap["itemCode"] ? values[colMap["itemCode"]] : undefined;
      const qtyRaw = colMap["expectedQty"] ? values[colMap["expectedQty"]] : undefined;

      if (!itemCodeRaw && !qtyRaw) return;

      const itemCode = itemCodeRaw ? String(itemCodeRaw).trim() : "";
      const expectedQty = qtyRaw ? Number(qtyRaw) : undefined;
      const lotNumber = colMap["lotNumber"] && values[colMap["lotNumber"]] ? String(values[colMap["lotNumber"]]).trim() : undefined;
      const uom = colMap["uom"] && values[colMap["uom"]] ? String(values[colMap["uom"]]).trim() : "BOX";
      const remarks = colMap["remarks"] && values[colMap["remarks"]] ? String(values[colMap["remarks"]]).trim() : undefined;

      let disposition: "store" | "inspect" = "store";
      if (colMap["disposition"] && values[colMap["disposition"]]) {
        const dispVal = String(values[colMap["disposition"]]).toLowerCase();
        if (dispVal.includes("inspect") || dispVal.includes("hold") || dispVal.includes("quarantine")) {
          disposition = "inspect";
        }
      }

      let mfgDate: string | undefined;
      if (colMap["mfgDate"] && values[colMap["mfgDate"]]) {
        const d = values[colMap["mfgDate"]];
        if (d && typeof d === "object" && "toISOString" in d) {
          mfgDate = (d as Date).toISOString().slice(0, 10);
        } else {
          mfgDate = String(d).trim();
        }
      }

      let expiryDate: string | undefined;
      if (colMap["expiryDate"] && values[colMap["expiryDate"]]) {
        const d = values[colMap["expiryDate"]];
        if (d && typeof d === "object" && "toISOString" in d) {
          expiryDate = (d as Date).toISOString().slice(0, 10);
        } else {
          expiryDate = String(d).trim();
        }
      }

      if (itemCode || (expectedQty && expectedQty > 0)) {
        result.rows.push({
          itemCode: itemCode || undefined,
          customerItemCode: colMap["customerItemCode"] && values[colMap["customerItemCode"]] ? String(values[colMap["customerItemCode"]]).trim() : undefined,
          lotNumber,
          mfgDate,
          expiryDate,
          expectedQty: expectedQty && !isNaN(expectedQty) ? expectedQty : undefined,
          uom,
          remarks,
          disposition,
        });
      }
    });

    if (result.rows.length === 0) {
      result.warnings.push("No valid line item rows were extracted from the Excel sheet.");
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    result.ok = false;
    result.errors.push(`Failed to parse Excel file: ${errorMsg}`);
  }

  return result;
}

async function parseCiplPdf(buffer: Buffer, fileName: string): Promise<CiplParseResult> {
  const result: CiplParseResult = {
    ok: true,
    fileName,
    header: {},
    rows: [],
    errors: [],
    warnings: [],
  };

  try {
    // Dynamic import for pdf-parse to avoid top-level require
    const pdfParseMod = await import("pdf-parse");
    const pdfParse = (pdfParseMod as unknown as { default?: (b: Buffer) => Promise<{ text: string }> }).default || (pdfParseMod as unknown as (b: Buffer) => Promise<{ text: string }>);
    const pdfData = await pdfParse(buffer);
    const text: string = pdfData.text || "";
    const lines = text.split("\n").map((l: string) => l.trim()).filter(Boolean);

    const invMatch = text.match(/(?:Invoice|CIPL|Ref)\s*(?:No|#|Num|Reference)?\s*[:.-]?\s*([A-Z0-9_-]{3,30})/i);
    if (invMatch) {
      result.header.ciplReference = invMatch[1];
    }

    const dateMatch = text.match(/(?:Date)\s*[:.-]?\s*(\d{4}[-/.]\d{2}[-/.]\d{2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/i);
    if (dateMatch) {
      result.header.invoiceDate = dateMatch[1];
    }

    const lineRegex = /([A-Z0-9_-]{3,25})\s+(?:(LOT-[A-Z0-9_-]+|[A-Z0-9_-]{4,15})\s+)?(\d+(?:\.\d+)?)\s*(BOX|PCS|CTN|PALLET|KG|UNITS|PK)?/gi;

    for (const line of lines) {
      if (/invoice|packing|commercial|date|page|total|subtotal/i.test(line) && !/\d{2,}/.test(line)) {
        continue;
      }

      let match: RegExpExecArray | null;
      lineRegex.lastIndex = 0;
      while ((match = lineRegex.exec(line)) !== null) {
        const potentialItem = match[1];
        const potentialLot = match[2];
        const qtyStr = match[3];
        const uom = match[4] || "BOX";

        if (/^(total|page|inv|date|ref|no|qty|uom)$/i.test(potentialItem)) continue;

        const qty = parseFloat(qtyStr);
        if (!isNaN(qty) && qty > 0) {
          result.rows.push({
            itemCode: potentialItem,
            lotNumber: potentialLot && !/^(box|pcs|ctn)$/i.test(potentialLot) ? potentialLot : undefined,
            expectedQty: qty,
            uom: uom.toUpperCase(),
            disposition: "store",
          });
        }
      }
    }

    if (result.rows.length === 0) {
      result.warnings.push("PDF text extracted successfully, but no table rows matched the line item layout. You can enter expected lines manually or verify the file layout.");
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    result.ok = false;
    result.errors.push(`Failed to parse PDF file: ${errorMsg}`);
  }

  return result;
}

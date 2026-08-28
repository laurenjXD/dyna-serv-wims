import ExcelJS from "exceljs";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse");

export interface ParsedDraRow {
  itemCode?: string;
  customerItemCode?: string;
  requestedQty?: number;
  uom?: string;
  remarks?: string;
}

export interface DraParseResult {
  ok: boolean;
  fileName: string;
  header: {
    draReference?: string;
    releaseDate?: string;
    customerOrganization?: string;
  };
  rows: ParsedDraRow[];
  errors: string[];
  warnings: string[];
}

/**
 * Parses Delivery Release Advice (DRA) files in Excel (.xlsx, .xls, .csv) or PDF (.pdf) format.
 */
export async function parseDraDocument(buffer: Buffer, fileName: string): Promise<DraParseResult> {
  const ext = fileName.slice(((fileName.lastIndexOf(".") - 1) >>> 0) + 2).toLowerCase();

  if (ext === "pdf") {
    return parseDraPdf(buffer, fileName);
  } else if (["xlsx", "xls", "csv"].includes(ext)) {
    return parseDraExcel(buffer, fileName);
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

async function parseDraExcel(buffer: Buffer, fileName: string): Promise<DraParseResult> {
  const result: DraParseResult = {
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
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const stream = require("stream");
      const bufferStream = new stream.PassThrough();
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
    let colMap: Record<string, number> = {};

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber > 25) return;
      const values = row.values as (string | number | undefined | null)[];
      const rowText = values.map((v) => String(v ?? "").toLowerCase()).join(" ");

      if (rowText.includes("dra") || rowText.includes("advice") || rowText.includes("release")) {
        values.forEach((cell, idx) => {
          const str = String(cell ?? "");
          if (str.toLowerCase().includes("dra") || str.toLowerCase().includes("ref")) {
            const nextCell = values[idx + 1];
            if (nextCell && !result.header.draReference) {
              result.header.draReference = String(nextCell).trim();
            }
          }
        });
      }

      if (
        headerRowIndex === -1 &&
        (rowText.includes("item") || rowText.includes("sku") || rowText.includes("part") || rowText.includes("description")) &&
        (rowText.includes("qty") || rowText.includes("quantity") || rowText.includes("release") || rowText.includes("requested"))
      ) {
        headerRowIndex = rowNumber;
        values.forEach((cell, idx) => {
          if (!cell) return;
          const val = String(cell).trim().toLowerCase();
          if (val.includes("item code") || val.includes("sku") || val === "item" || val.includes("part no")) {
            colMap["itemCode"] = idx;
          } else if (val.includes("customer item") || val.includes("cust item")) {
            colMap["customerItemCode"] = idx;
          } else if (val.includes("qty") || val.includes("quantity") || val.includes("release") || val.includes("requested")) {
            colMap["requestedQty"] = idx;
          } else if (val.includes("uom") || val.includes("unit")) {
            colMap["uom"] = idx;
          } else if (val.includes("remark") || val.includes("note")) {
            colMap["remarks"] = idx;
          }
        });
      }
    });

    if (headerRowIndex === -1) {
      headerRowIndex = 1;
      colMap = { itemCode: 1, requestedQty: 2, uom: 3 };
      result.warnings.push("Could not unambiguously identify DRA table headers; using default column positions.");
    }

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber <= headerRowIndex) return;

      const values = row.values as (string | number | undefined | null)[];
      const itemCodeRaw = colMap["itemCode"] ? values[colMap["itemCode"]] : undefined;
      const qtyRaw = colMap["requestedQty"] ? values[colMap["requestedQty"]] : undefined;

      if (!itemCodeRaw && !qtyRaw) return;

      const itemCode = itemCodeRaw ? String(itemCodeRaw).trim() : "";
      const requestedQty = qtyRaw ? Number(qtyRaw) : undefined;

      if (itemCode || (requestedQty && requestedQty > 0)) {
        result.rows.push({
          itemCode: itemCode || undefined,
          customerItemCode: colMap["customerItemCode"] && values[colMap["customerItemCode"]] ? String(values[colMap["customerItemCode"]]).trim() : undefined,
          requestedQty: requestedQty && !isNaN(requestedQty) ? requestedQty : undefined,
          uom: colMap["uom"] && values[colMap["uom"]] ? String(values[colMap["uom"]]).trim() : "BOX",
          remarks: colMap["remarks"] && values[colMap["remarks"]] ? String(values[colMap["remarks"]]).trim() : undefined,
        });
      }
    });

    if (result.rows.length === 0) {
      result.warnings.push("No valid line item rows were extracted from the DRA sheet.");
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    result.ok = false;
    result.errors.push(`Failed to parse DRA Excel file: ${errorMsg}`);
  }

  return result;
}

async function parseDraPdf(buffer: Buffer, fileName: string): Promise<DraParseResult> {
  const result: DraParseResult = {
    ok: true,
    fileName,
    header: {},
    rows: [],
    errors: [],
    warnings: [],
  };

  try {
    const pdfData = await pdfParse(buffer);
    const text: string = pdfData.text || "";
    const lines = text.split("\n").map((l: string) => l.trim()).filter(Boolean);

    const refMatch = text.match(/(?:DRA|Release|Advice|Ref)\s*(?:No|#|Num|Reference)?\s*[:.-]?\s*([A-Z0-9_-]{3,30})/i);
    if (refMatch) {
      result.header.draReference = refMatch[1];
    }

    const lineRegex = /([A-Z0-9_-]{3,25})\s+(\d+(?:\.\d+)?)\s*(BOX|PCS|CTN|PALLET|KG|UNITS|PK)?/gi;

    for (const line of lines) {
      if (/delivery|release|advice|date|page|total|subtotal/i.test(line) && !/\d{2,}/.test(line)) {
        continue;
      }

      let match: RegExpExecArray | null;
      lineRegex.lastIndex = 0;
      while ((match = lineRegex.exec(line)) !== null) {
        const potentialItem = match[1];
        const qtyStr = match[2];
        const uom = match[3] || "BOX";

        if (/^(total|page|dra|date|ref|no|qty|uom)$/i.test(potentialItem)) continue;

        const qty = parseFloat(qtyStr);
        if (!isNaN(qty) && qty > 0) {
          result.rows.push({
            itemCode: potentialItem,
            requestedQty: qty,
            uom: uom.toUpperCase(),
          });
        }
      }
    }

    if (result.rows.length === 0) {
      result.warnings.push("PDF text extracted, but no line items matched the DRA table layout. Please enter release quantities manually or check the file.");
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    result.ok = false;
    result.errors.push(`Failed to parse DRA PDF file: ${errorMsg}`);
  }

  return result;
}

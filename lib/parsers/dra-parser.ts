import ExcelJS from "exceljs";
import { PassThrough } from "node:stream";

export interface ParsedDraRow {
  itemCode?: string;
  customerItemCode?: string;
  requestedQty?: number;
  packageCount?: number;
  spq?: number;
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
        (rowText.includes("qty") || rowText.includes("quantity") || rowText.includes("release") || rowText.includes("requested") || rowText.includes("package") || rowText.includes("carton"))
      ) {
        headerRowIndex = rowNumber;
        values.forEach((cell, idx) => {
          if (!cell) return;
          const val = String(cell).trim().toLowerCase();
          if (
            val.includes("item code") ||
            val.includes("sku") ||
            val === "item" ||
            val.includes("part no") ||
            val.includes("part number") ||
            val.includes("product code") ||
            val.includes("dsgc item") ||
            val.includes("supplier item") ||
            val.includes("material")
          ) {
            colMap["itemCode"] = idx;
          } else if (
            val.includes("customer item") ||
            val.includes("cust item") ||
            val.includes("cust pn") ||
            val.includes("customer pn") ||
            val.includes("client item") ||
            val.includes("customer part") ||
            val.includes("buyer item")
          ) {
            colMap["customerItemCode"] = idx;
          } else if (
            val.includes("pkg") ||
            val.includes("package") ||
            val.includes("carton") ||
            val.includes("ctn") ||
            val.includes("no. of") ||
            val.includes("box count") ||
            val.includes("total packages") ||
            val.includes("boxes")
          ) {
            colMap["noOfPackages"] = idx;
          } else if (
            val.includes("spq") ||
            val.includes("pcs/ctn") ||
            val.includes("units/ctn") ||
            val.includes("pcs per box") ||
            val.includes("pcs per carton") ||
            val.includes("standard pkg qty") ||
            val.includes("standard package")
          ) {
            colMap["spq"] = idx;
          } else if (
            val.includes("requested qty") ||
            val.includes("to pick") ||
            val.includes("pick qty") ||
            val.includes("release qty") ||
            val.includes("total qty") ||
            val === "qty" ||
            val === "quantity" ||
            val.includes("pcs")
          ) {
            colMap["requestedQty"] = idx;
          } else if (val.includes("uom") || val.includes("unit of measure") || val === "unit" || val.includes("measurement")) {
            colMap["uom"] = idx;
          } else if (val.includes("remark") || val.includes("note") || val.includes("comment")) {
            colMap["remarks"] = idx;
          }
        });
      }
    });

    if (headerRowIndex === -1) {
      headerRowIndex = 1;
      colMap["itemCode"] = 1;
      colMap["requestedQty"] = 2;
      colMap["uom"] = 3;
      result.warnings.push("Could not unambiguously identify DRA table headers; using default column positions.");
    }

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber <= headerRowIndex) return;

      const values = row.values as (string | number | undefined | null)[];
      const itemCodeRaw = colMap["itemCode"] ? values[colMap["itemCode"]] : undefined;
      const qtyRaw = colMap["requestedQty"] ? values[colMap["requestedQty"]] : undefined;
      const packageCountRaw = colMap["noOfPackages"] ? values[colMap["noOfPackages"]] : undefined;
      const spqRaw = colMap["spq"] ? values[colMap["spq"]] : undefined;

      if (!itemCodeRaw && !qtyRaw && !packageCountRaw) return;

      const itemCode = itemCodeRaw ? String(itemCodeRaw).trim() : "";
      let requestedQty = qtyRaw ? Number(qtyRaw) : undefined;
      const packageCount = packageCountRaw ? Number(packageCountRaw) : undefined;
      const spq = spqRaw ? Number(spqRaw) : undefined;

      // Qty is equal to SPQ × No. of packages (cartons)
      if ((!requestedQty || isNaN(requestedQty)) && packageCount && spq && !isNaN(packageCount) && !isNaN(spq)) {
        requestedQty = packageCount * spq;
      } else if ((!requestedQty || isNaN(requestedQty)) && packageCount && !isNaN(packageCount)) {
        requestedQty = packageCount;
      }

      if (itemCode || (requestedQty && requestedQty > 0)) {
        result.rows.push({
          itemCode: itemCode || undefined,
          customerItemCode: colMap["customerItemCode"] && values[colMap["customerItemCode"]] ? String(values[colMap["customerItemCode"]]).trim() : undefined,
          requestedQty: requestedQty && !isNaN(requestedQty) ? requestedQty : undefined,
          packageCount: packageCount && !isNaN(packageCount) ? packageCount : undefined,
          spq: spq && !isNaN(spq) ? spq : undefined,
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
    const pdfParseMod = await import("pdf-parse");
    const pdfParse = (pdfParseMod as unknown as { default?: (b: Buffer) => Promise<{ text: string }> }).default || (pdfParseMod as unknown as (b: Buffer) => Promise<{ text: string }>);
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

import * as XLSX from "xlsx";

export interface ParsedCiplRow {
  itemCode?: string;
  customerItemCode?: string;
  description?: string;
  lotNumber?: string;
  mfgDate?: string;
  expiryDate?: string;
  expectedQty?: number;
  packageCount?: number;
  spq?: number;
  cbm?: number;
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
    ipNumber?: string;
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
      errors: [`Unsupported file format .${ext}. Please upload an Excel (.xlsx, .xls, .csv) or PDF (.pdf) file.`],
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
    const workbook = XLSX.read(buffer, { type: "buffer" });
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      result.ok = false;
      result.errors.push("The uploaded Excel workbook contains no worksheets.");
      return result;
    }

    // Look for preferred sheets: "Invoice", "Packing List", "CIPL", or default to first sheet
    let targetSheetName = workbook.SheetNames[0];
    for (const name of workbook.SheetNames) {
      const lower = name.toLowerCase();
      if (lower.includes("invoice") || lower.includes("cipl") || lower.includes("packing")) {
        targetSheetName = name;
        break;
      }
    }

    const worksheet = workbook.Sheets[targetSheetName];
    const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });

    if (!rawRows || rawRows.length === 0) {
      result.ok = false;
      result.errors.push(`Sheet "${targetSheetName}" contains no data.`);
      return result;
    }

    let headerRowIndex = -1;
    const colMap: Record<string, number> = {};

    // Scan top 30 rows for metadata (Invoice #, Date, Vendor) and find column headers
    for (let r = 0; r < Math.min(rawRows.length, 30); r++) {
      const row = rawRows[r] || [];
      const rowStr = row.map((c) => String(c ?? "").trim()).join(" ");
      const rowLower = rowStr.toLowerCase();

      // Extract Invoice Reference
      if (!result.header.ciplReference) {
        for (let c = 0; c < row.length; c++) {
          const cellStr = String(row[c] ?? "").trim();
          const match = cellStr.match(/(?:INVOICE|CIPL|REF)\s*(?:#|NO|NUM|NUMBER|REF|REFERENCE)?\s*[:.-]\s*([A-Z0-9_-]{3,})/i);
          if (match && match[1] && !/^(no|num|number|ref|reference|form|advice|list)$/i.test(match[1])) {
            result.header.ciplReference = match[1];
            break;
          } else if (/^(?:INVOICE|CIPL|REF)\s*(?:#|NO|NUM|NUMBER|REF|REFERENCE)?\s*[:.-]?$/i.test(cellStr)) {
            const nextCell = String(row[c + 1] ?? "").trim();
            if (nextCell && !/^(no|num|number|ref|reference|form|advice|list)$/i.test(nextCell)) {
              result.header.ciplReference = nextCell;
              break;
            }
          }
        }
      }

      // Extract Date
      if (!result.header.invoiceDate) {
        for (let c = 0; c < row.length; c++) {
          const cellStr = String(row[c] ?? "").trim();
          const dateMatch = cellStr.match(/(?:DATE)\s*[:.-]?\s*([0-9A-Z-/.]+)/i);
          if (dateMatch && dateMatch[1] && dateMatch[1].length >= 4) {
            result.header.invoiceDate = dateMatch[1];
            break;
          }
        }
      }

      // Extract IP Number (Import Permit)
      if (!result.header.ipNumber) {
        for (let c = 0; c < row.length; c++) {
          const cellStr = String(row[c] ?? "").trim();
          const ipMatch = cellStr.match(/(?:IP|IMPORT\s*PERMIT)\s*(?:#|NO|NUM)?\s*[:.-]?\s*([A-Z0-9_-]{3,})/i);
          if (ipMatch && ipMatch[1] && !/^(no|num|number|ref|permit)$/i.test(ipMatch[1])) {
            result.header.ipNumber = ipMatch[1];
            break;
          }
        }
      }

      // Extract MAWB / MBL
      if (!result.header.mawbMbl) {
        for (let c = 0; c < row.length; c++) {
          const cellStr = String(row[c] ?? "").trim();
          const mawbMatch = cellStr.match(/(?:MAWB|MBL|WAYBILL|BL|BILL\s*OF\s*LADING)\s*(?:#|NO|NUM)?\s*[:.-]?\s*([A-Z0-9_-]{3,})/i);
          if (mawbMatch && mawbMatch[1] && !/^(no|num|number|ref|lading)$/i.test(mawbMatch[1])) {
            result.header.mawbMbl = mawbMatch[1];
            break;
          }
        }
      }

      // Check if this row looks like the table column header
      const hasItemCol =
        rowLower.includes("item") ||
        rowLower.includes("sku") ||
        rowLower.includes("part") ||
        rowLower.includes("p/n") ||
        rowLower.includes("ubot") ||
        rowLower.includes("description");
      const hasQtyCol =
        rowLower.includes("qty") ||
        rowLower.includes("quantity") ||
        rowLower.includes("count") ||
        rowLower.includes("package") ||
        rowLower.includes("carton") ||
        rowLower.includes("boxes") ||
        rowLower.includes("amount");

      if (headerRowIndex === -1 && hasItemCol && hasQtyCol) {
        headerRowIndex = r;

        // Also check if next row contains sub-headers (e.g. Row 17 "UBoT", Row 18 "P/N")
        const nextRow = rawRows[r + 1] || [];

        for (let c = 0; c < Math.max(row.length, nextRow.length); c++) {
          const topVal = String(row[c] ?? "").trim().toLowerCase();
          const subVal = String(nextRow[c] ?? "").trim().toLowerCase();
          const combined = `${topVal} ${subVal}`.trim();

          if (
            combined.includes("description") ||
            combined.includes("item name") ||
            combined.includes("desc")
          ) {
            colMap["description"] = c;
          } else if (
            combined.includes("customer item") ||
            combined.includes("cust item") ||
            combined.includes("cust p/n") ||
            combined.includes("cust pn") ||
            combined.includes("customer pn") ||
            combined.includes("client item") ||
            combined.includes("customer part") ||
            combined.includes("buyer item")
          ) {
            colMap["customerItemCode"] = c;
          } else if (
            combined.includes("item code") ||
            combined.includes("sku") ||
            combined === "item" ||
            combined.includes("ubot") ||
            combined.includes("dsgc item") ||
            combined.includes("supplier item") ||
            combined.includes("part no") ||
            combined.includes("part number") ||
            combined.includes("product code") ||
            combined.includes("material") ||
            (combined.includes("p/n") && !combined.includes("cust"))
          ) {
            colMap["itemCode"] = c;
          } else if (
            combined.includes("shipping lot") ||
            combined.includes("lot") ||
            combined.includes("batch")
          ) {
            colMap["lotNumber"] = c;
          } else if (
            combined.includes("mfd") ||
            combined.includes("mfg") ||
            combined.includes("manufacture")
          ) {
            colMap["mfgDate"] = c;
          } else if (combined.includes("expiry") || combined.includes("exp date")) {
            colMap["expiryDate"] = c;
          } else if (
            combined.includes("cbm") ||
            combined.includes("unit cbm") ||
            combined.includes("volume")
          ) {
            colMap["cbm"] = c;
          } else if (
            combined.includes("pkg") ||
            combined.includes("package") ||
            combined.includes("carton") ||
            combined.includes("ctn") ||
            combined.includes("no. of") ||
            combined.includes("box count") ||
            combined.includes("total packages") ||
            combined.includes("boxes")
          ) {
            colMap["noOfPackages"] = c;
          } else if (
            combined.includes("spq") ||
            combined.includes("pcs/ctn") ||
            combined.includes("units/ctn") ||
            combined.includes("pcs per box") ||
            combined.includes("pcs per carton") ||
            combined.includes("standard pkg qty") ||
            combined.includes("standard package")
          ) {
            colMap["spq"] = c;
          } else if (
            combined.includes("total qty") ||
            combined.includes("expected") ||
            combined.includes("received") ||
            combined === "qty" ||
            combined === "quantity" ||
            combined.includes("quantity") ||
            combined.includes("pcs")
          ) {
            colMap["expectedQty"] = c;
          } else if (
            combined.includes("uom") ||
            combined.includes("unit of measure") ||
            combined === "unit" ||
            combined.includes("measurement")
          ) {
            colMap["uom"] = c;
          } else if (combined.includes("disp") || combined.includes("disposition")) {
            colMap["disposition"] = c;
          } else if (combined.includes("remark") || combined.includes("note") || combined.includes("comment")) {
            colMap["remarks"] = c;
          }
        }
      }
    }

    if (headerRowIndex === -1) {
      headerRowIndex = 0;
      colMap["itemCode"] = 1;
      colMap["expectedQty"] = 6;
      colMap["uom"] = 7;
      result.warnings.push("Could not unambiguously identify table headers; using default column positions.");
    }

    // Process data rows
    const startRow = headerRowIndex + 1;
    for (let r = startRow; r < rawRows.length; r++) {
      const row = rawRows[r];
      if (!row || row.length === 0) continue;

      const itemCodeRaw = colMap["itemCode"] !== undefined ? row[colMap["itemCode"]] : undefined;
      const custItemCodeRaw = colMap["customerItemCode"] !== undefined ? row[colMap["customerItemCode"]] : undefined;
      const descRaw = colMap["description"] !== undefined ? row[colMap["description"]] : undefined;
      const qtyRaw = colMap["expectedQty"] !== undefined ? row[colMap["expectedQty"]] : undefined;
      const packageCountRaw = colMap["noOfPackages"] !== undefined ? row[colMap["noOfPackages"]] : undefined;
      const spqRaw = colMap["spq"] !== undefined ? row[colMap["spq"]] : undefined;
      const cbmRaw = colMap["cbm"] !== undefined ? row[colMap["cbm"]] : undefined;

      // Skip summary, footer, or HS Code breakdown rows
      const rowStr = row.map((c) => String(c ?? "")).join(" ").toLowerCase();
      if (
        rowStr.includes("total") ||
        rowStr.includes("subtotal") ||
        rowStr.includes("page ") ||
        rowStr.includes("hs code") ||
        rowStr.includes("incoterms") ||
        rowStr.includes("computer-generated")
      ) {
        continue;
      }

      if (!itemCodeRaw && !custItemCodeRaw) continue;

      const itemCode = itemCodeRaw ? String(itemCodeRaw).trim() : "";
      // If itemCode is just a header word like "P/N" from a multi-row header or line number, skip
      if (/^(p\/n|item|part no|descriptions?|qty|uom|#)$/i.test(itemCode)) continue;

      let expectedQty = qtyRaw !== undefined && qtyRaw !== null && qtyRaw !== "" ? Number(qtyRaw) : undefined;
      const packageCount = packageCountRaw !== undefined && packageCountRaw !== null && packageCountRaw !== "" ? Number(packageCountRaw) : undefined;
      const spq = spqRaw !== undefined && spqRaw !== null && spqRaw !== "" ? Number(spqRaw) : undefined;
      const cbm = cbmRaw !== undefined && cbmRaw !== null && cbmRaw !== "" ? Number(cbmRaw) : undefined;

      // Compute Qty if missing: Qty = SPQ × Package Count
      if ((!expectedQty || isNaN(expectedQty)) && packageCount && spq && !isNaN(packageCount) && !isNaN(spq)) {
        expectedQty = packageCount * spq;
      } else if ((!expectedQty || isNaN(expectedQty)) && packageCount && !isNaN(packageCount)) {
        expectedQty = packageCount;
      }

      const lotNumber = colMap["lotNumber"] !== undefined && row[colMap["lotNumber"]] ? String(row[colMap["lotNumber"]]).trim() : undefined;
      const uom = colMap["uom"] !== undefined && row[colMap["uom"]] ? String(row[colMap["uom"]]).trim() : "BOX";
      const remarks = colMap["remarks"] !== undefined && row[colMap["remarks"]] ? String(row[colMap["remarks"]]).trim() : undefined;
      const description = descRaw ? String(descRaw).trim() : undefined;

      let disposition: "store" | "inspect" = "store";
      if (colMap["disposition"] !== undefined && row[colMap["disposition"]]) {
        const dispVal = String(row[colMap["disposition"]]).toLowerCase();
        if (dispVal.includes("inspect") || dispVal.includes("hold") || dispVal.includes("quarantine")) {
          disposition = "inspect";
        }
      }

      let mfgDate: string | undefined;
      if (colMap["mfgDate"] !== undefined && row[colMap["mfgDate"]]) {
        const d = row[colMap["mfgDate"]];
        if (d && typeof d === "object" && "toISOString" in d) {
          mfgDate = (d as Date).toISOString().slice(0, 10);
        } else {
          mfgDate = String(d).trim();
        }
      }

      let expiryDate: string | undefined;
      if (colMap["expiryDate"] !== undefined && row[colMap["expiryDate"]]) {
        const d = row[colMap["expiryDate"]];
        if (d && typeof d === "object" && "toISOString" in d) {
          expiryDate = (d as Date).toISOString().slice(0, 10);
        } else {
          expiryDate = String(d).trim();
        }
      }

      if (itemCode || custItemCodeRaw || (expectedQty && expectedQty > 0)) {
        result.rows.push({
          itemCode: itemCode || undefined,
          customerItemCode: custItemCodeRaw ? String(custItemCodeRaw).trim() : undefined,
          description,
          lotNumber,
          mfgDate,
          expiryDate,
          expectedQty: expectedQty && !isNaN(expectedQty) ? expectedQty : undefined,
          packageCount: packageCount && !isNaN(packageCount) ? packageCount : undefined,
          spq: spq && !isNaN(spq) ? spq : undefined,
          cbm: cbm && !isNaN(cbm) ? cbm : undefined,
          uom,
          remarks,
          disposition,
        });
      }
    }

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

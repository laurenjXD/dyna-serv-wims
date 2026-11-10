import * as XLSX from "xlsx";

export interface ParsedCiplRow {
  itemCode?: string;
  customerItemCode?: string;
  description?: string;
  lotNumber?: string;
  mfgDate?: string;
  expiryDate?: string;
  expectedQty?: number;
  /** Source package count, retained only as import metadata; WRR stores total units. */
  packageCount?: number;
  spq?: number;
  cbm?: number;
  uom?: string;
  remarks?: string;
  disposition?: "store" | "inspect";
}

export type CiplTargetField = keyof Pick<ParsedCiplRow,
  "itemCode" | "customerItemCode" | "description" | "lotNumber" | "mfgDate" |
  "expiryDate" | "expectedQty" | "packageCount" | "spq" | "cbm" | "uom" |
  "remarks" | "disposition">;

export type CiplSourceColumn = {
  index: number;
  header: string;
  suggestedTarget?: CiplTargetField;
  status: "mapped" | "unmapped" | "fallback";
  sampleValues: string[];
};

export type CiplMappingSnapshot = {
  version: 1;
  sourceKind: "spreadsheet" | "pdf";
  sheetName?: string;
  headerRow?: number;
  columns: CiplSourceColumn[];
  sourceRows: Array<{ rowNumber: number; values: string[] }>;
};

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
  mappingSnapshot: CiplMappingSnapshot;
  errors: string[];
  warnings: string[];
}

function parseNumericCell(value: unknown): number | undefined {
  if (value === undefined || value === null || String(value).trim() === "") return undefined;
  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : undefined;
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
      mappingSnapshot: { version: 1, sourceKind: "spreadsheet", columns: [], sourceRows: [] },
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
    mappingSnapshot: { version: 1, sourceKind: "spreadsheet", columns: [], sourceRows: [] },
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
    const rawRows: unknown[][] = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: null });

    if (!rawRows || rawRows.length === 0) {
      result.ok = false;
      result.errors.push(`Sheet "${targetSheetName}" contains no data.`);
      return result;
    }

    let headerRowIndex = -1;
    const colMap: Record<string, number> = {};
    let bestHeaderRowIndex = -1;
    let bestColMap: Record<string, number> = {};
    let bestScore = 0;

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

      // Extract IP Number (Import Permit). Require a label boundary so words
      // such as "PHILIPPINES" cannot be mistaken for an `IP` label.
      if (!result.header.ipNumber) {
        for (let c = 0; c < row.length; c++) {
          const cellStr = String(row[c] ?? "").trim();
          const ipMatch = cellStr.match(/(?:^|\b)(?:IP|IMPORT\s*PERMIT)\s*(?:#|NO|NUM|NUMBER)?\s*(?:[:.-]\s*|\s+)([A-Z0-9_-]{3,})\b/i);
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

      // Check if this row or combined next row can serve as column headers
      const nextRow = rawRows[r + 1] || [];
      const candidateColMap: Record<string, number> = {};

      for (let c = 0; c < Math.max(row.length, nextRow.length); c++) {
        const topVal = String(row[c] ?? "").trim().toLowerCase();
        const subVal = String(nextRow[c] ?? "").trim().toLowerCase();
        const combined = `${topVal} ${subVal}`.trim();
        const val = combined.length > 0 ? combined : topVal;

        if (
          val.includes("description") ||
          val.includes("item name") ||
          val.includes("product name") ||
          val.includes("desc") ||
          val.includes("goods desc") ||
          val.includes("material desc") ||
          val === "spec" ||
          val.includes("specification") ||
          val.includes("device name")
        ) {
          if (candidateColMap["description"] === undefined) candidateColMap["description"] = c;
        } else if (
          val.includes("customer item") ||
          val.includes("cust item") ||
          val.includes("cust p/n") ||
          val.includes("cust pn") ||
          val.includes("customer pn") ||
          val.includes("client item") ||
          val.includes("customer part") ||
          val.includes("buyer item") ||
          val.includes("buyer part") ||
          val.includes("drawing no") ||
          val.includes("oem part") ||
          val.includes("cust part #") ||
          val.includes("cust part no")
        ) {
          if (candidateColMap["customerItemCode"] === undefined) candidateColMap["customerItemCode"] = c;
        } else if (
          val.includes("item code") ||
          val.includes("sku") ||
          val.includes("ubot") ||
          val.includes("dsgc item") ||
          val.includes("supplier item") ||
          val.includes("part no") ||
          val.includes("part number") ||
          val.includes("part #") ||
          val.includes("material code") ||
          val.includes("material no") ||
          val === "material" ||
          val.includes("product code") ||
          val.includes("catalog no") ||
          val.includes("cat #") ||
          (val.includes("p/n") && !val.includes("cust")) ||
          (val.includes("pn") && !val.includes("cust") && !val.includes("desc"))
        ) {
          if (candidateColMap["itemCode"] === undefined) candidateColMap["itemCode"] = c;
        } else if (
          // Many commercial invoice templates use `Item` or `#` for a
          // display-only line number and put the actual supplier code in a
          // separate column (for example, `UBoT P/N`). Keep this candidate
          // separate so a real code column wins when both are present.
          val === "item" ||
          val === "#" ||
          val === "line" ||
          val === "line no" ||
          val === "item no" ||
          val === "no"
        ) {
          if (candidateColMap["lineNumber"] === undefined) candidateColMap["lineNumber"] = c;
        } else if (
          val.includes("shipping lot") ||
          val.includes("lot no") ||
          val.includes("lot number") ||
          val.includes("lot #") ||
          val.includes("batch no") ||
          val.includes("batch number") ||
          val.includes("batch #") ||
          val.includes("lot") ||
          val.includes("batch") ||
          val.includes("date code") ||
          val === "d/c"
        ) {
          if (candidateColMap["lotNumber"] === undefined) candidateColMap["lotNumber"] = c;
        } else if (
          val.includes("mfd") ||
          val.includes("mfg date") ||
          val.includes("mfg") ||
          val.includes("manufacture") ||
          val.includes("production date") ||
          val.includes("date of mfg")
        ) {
          if (candidateColMap["mfgDate"] === undefined) candidateColMap["mfgDate"] = c;
        } else if (
          val.includes("expiry") ||
          val.includes("exp date") ||
          val.includes("expiration") ||
          val.includes("shelf life")
        ) {
          if (candidateColMap["expiryDate"] === undefined) candidateColMap["expiryDate"] = c;
        } else if (
          val.includes("cbm") ||
          val.includes("unit cbm") ||
          val.includes("total cbm") ||
          val.includes("volume") ||
          val.includes("m3")
        ) {
          if (candidateColMap["cbm"] === undefined) candidateColMap["cbm"] = c;
        } else if (
          val.includes("no. of packages") ||
          val.includes("total packages") ||
          val.includes("package count") ||
          val.includes("box count") ||
          val.includes("boxes") ||
          val.includes("carton count") ||
          val.includes("cartons") ||
          val.includes("ctn") ||
          val.includes("ctns") ||
          val.includes("no of ctn") ||
          val.includes("no. of pkg") ||
          val.includes("pkgs") ||
          val.includes("package") ||
          val.includes("pkg")
        ) {
          if (candidateColMap["noOfPackages"] === undefined) candidateColMap["noOfPackages"] = c;
        } else if (
          val.includes("spq") ||
          val.includes("pcs/ctn") ||
          val.includes("pcs per ctn") ||
          val.includes("pcs/carton") ||
          val.includes("pcs per carton") ||
          val.includes("pcs per box") ||
          val.includes("pcs/box") ||
          val.includes("qty/box") ||
          val.includes("units/ctn") ||
          val.includes("standard pkg") ||
          val.includes("std pkg") ||
          val.includes("standard package")
        ) {
          if (candidateColMap["spq"] === undefined) candidateColMap["spq"] = c;
        } else if (
          val.includes("total qty") ||
          val.includes("expected qty") ||
          val.includes("expected") ||
          val.includes("received qty") ||
          val.includes("received") ||
          val.includes("ship qty") ||
          val.includes("shipped qty") ||
          val.includes("order qty") ||
          val.includes("ordered qty") ||
          val.includes("delivery qty") ||
          val.includes("billing qty") ||
          val.includes("bal qty") ||
          val.includes("balance qty") ||
          val === "qty" ||
          val === "quantity" ||
          val.includes("quantity") ||
          val.includes("amount (pcs)") ||
          val.includes("total pcs") ||
          val === "pcs"
        ) {
          if (candidateColMap["expectedQty"] === undefined) candidateColMap["expectedQty"] = c;
        } else if (
          val.includes("uom") ||
          val.includes("unit of measure") ||
          val === "unit" ||
          val.includes("measurement") ||
          val.includes("base unit")
        ) {
          if (candidateColMap["uom"] === undefined) candidateColMap["uom"] = c;
        } else if (
          val.includes("disp") ||
          val.includes("disposition") ||
          val === "status" ||
          val.includes("route")
        ) {
          if (candidateColMap["disposition"] === undefined) candidateColMap["disposition"] = c;
        } else if (
          val.includes("remark") ||
          val.includes("note") ||
          val.includes("comment")
        ) {
          if (candidateColMap["remarks"] === undefined) candidateColMap["remarks"] = c;
        }
      }

      // Check if candidate header has both item indicator and quantity indicator
      const hasItem =
        candidateColMap["itemCode"] !== undefined ||
        candidateColMap["customerItemCode"] !== undefined ||
        candidateColMap["description"] !== undefined ||
        candidateColMap["lineNumber"] !== undefined;
      const hasQty =
        candidateColMap["expectedQty"] !== undefined ||
        candidateColMap["noOfPackages"] !== undefined;

      const recognizedCount = Object.keys(candidateColMap).length;
      if (hasItem && hasQty && recognizedCount > bestScore) {
        bestScore = recognizedCount;
        bestHeaderRowIndex = r;
        bestColMap = candidateColMap;
      }
    }

    // If a template has only a generic `Item` column, retain the historical
    // fallback of treating it as the item code. When a stronger code header
    // (such as `UBoT P/N`) exists, the line-number column is intentionally
    // ignored instead.
    if (bestHeaderRowIndex !== -1 && bestColMap["itemCode"] === undefined && bestColMap["lineNumber"] !== undefined) {
      bestColMap["itemCode"] = bestColMap["lineNumber"];
    }

    if (bestHeaderRowIndex !== -1) {
      headerRowIndex = bestHeaderRowIndex;
      Object.assign(colMap, bestColMap);
    } else {
      headerRowIndex = 0;
      colMap["itemCode"] = 1;
      colMap["expectedQty"] = 6;
      colMap["uom"] = 7;
      result.warnings.push("Could not unambiguously identify table headers; using default column positions.");
    }

    const sourceRows = rawRows.slice(headerRowIndex + 1)
      .map((row, offset) => ({
        rowNumber: headerRowIndex + offset + 2,
        values: row.map((value) => String(value ?? "").trim()),
      }))
      .filter((row) => row.values.some(Boolean));
    const sourceColumnCount = Math.max(
      rawRows[headerRowIndex]?.length ?? 0,
      ...sourceRows.map((row) => row.values.length),
    );
    const targetByColumn = new Map<number, CiplTargetField>();
    for (const [target, column] of Object.entries(colMap)) {
      if (target !== "lineNumber") targetByColumn.set(column, target as CiplTargetField);
    }
    result.mappingSnapshot = {
      version: 1,
      sourceKind: "spreadsheet",
      sheetName: targetSheetName,
      headerRow: headerRowIndex + 1,
      columns: Array.from({ length: sourceColumnCount }, (_, index) => {
        const header = String(rawRows[headerRowIndex]?.[index] ?? "").trim() || `Column ${index + 1}`;
        const suggestedTarget = targetByColumn.get(index);
        return {
          index,
          header,
          ...(suggestedTarget ? { suggestedTarget } : {}),
          status: suggestedTarget ? "mapped" : (bestHeaderRowIndex === -1 ? "fallback" : "unmapped"),
          sampleValues: sourceRows.map((row) => row.values[index]).filter(Boolean).slice(0, 3),
        };
      }),
      sourceRows,
    };

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
      // If itemCode is just a header word like "Item Code" from a multi-row header or line number, skip
      if (/^(p\/n|pn|item|item code|item no|part no|part number|sku|cust p\/n|customer part|descriptions?|ubot|u?bot p\/n|qty|quantity|uom|#)$/i.test(itemCode)) continue;

      let expectedQty = parseNumericCell(qtyRaw);
      const packageCount = parseNumericCell(packageCountRaw);
      const spq = parseNumericCell(spqRaw);
      const cbm = parseNumericCell(cbmRaw);

      // Compute total units when both the source package count and SPQ are known.
      // A package count without SPQ is not a reliable unit quantity, so leave the
      // field unresolved for operator review instead of silently treating cartons
      // as units.
      if (expectedQty === undefined && packageCount !== undefined && spq !== undefined) {
        expectedQty = packageCount * spq;
      }

      const lotNumber = colMap["lotNumber"] !== undefined && row[colMap["lotNumber"]] ? String(row[colMap["lotNumber"]]).trim() : undefined;
      const rawUom = colMap["uom"] !== undefined && row[colMap["uom"]] ? String(row[colMap["uom"]]).trim().toUpperCase() : "BOX";
      const uom = (rawUom === "PALLET" || rawUom === "PLT") ? "BOX" : rawUom;
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
          expectedQty,
          packageCount,
          spq,
          cbm,
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
    mappingSnapshot: { version: 1, sourceKind: "pdf", columns: [], sourceRows: [] },
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

    const lineRegex = /([A-Z0-9_-]{3,25})\s+(?:(LOT-[A-Z0-9_-]+|[A-Z0-9_-]{4,15})\s+)?(\d+(?:\.\d+)?)\s*(BOX|PCS|CTN|KG|UNITS|PK)?/gi;

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
        const rawUom = (match[4] || "BOX").toUpperCase();
        const uom = (rawUom === "PALLET" || rawUom === "PLT") ? "BOX" : rawUom;

        if (/^(total|page|inv|date|ref|no|qty|uom)$/i.test(potentialItem)) continue;

        const qty = parseFloat(qtyStr);
        if (!isNaN(qty) && qty > 0) {
          result.rows.push({
            itemCode: potentialItem,
            lotNumber: potentialLot && !/^(box|pcs|ctn)$/i.test(potentialLot) ? potentialLot : undefined,
            expectedQty: qty,
            uom,
            disposition: "store",
          });
        }
      }
    }

    if (result.rows.length === 0) {
      result.warnings.push("PDF text extracted successfully, but no table rows matched the line item layout. You can enter expected lines manually or verify the file layout.");
    }
    result.mappingSnapshot = {
      version: 1,
      sourceKind: "pdf",
      columns: [],
      sourceRows: lines.map((line, index) => ({ rowNumber: index + 1, values: [line] })),
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    result.ok = false;
    result.errors.push(`Failed to parse PDF file: ${errorMsg}`);
  }

  return result;
}

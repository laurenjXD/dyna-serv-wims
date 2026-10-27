import * as XLSX from "xlsx";

export interface ParsedDraRow {
  itemCode?: string;
  customerItemCode?: string;
  itemDescription?: string;
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
    requestingOrganization?: string;
    recipientOrganization?: string;
    /** @deprecated Use requestingOrganization/recipientOrganization. */
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
      errors: [`Unsupported file format .${ext}. Please upload an Excel (.xlsx, .xls, .csv) or PDF (.pdf) file.`],
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
    const workbook = XLSX.read(buffer, { type: "buffer" });
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      result.ok = false;
      result.errors.push("The uploaded Excel workbook contains no worksheets.");
      return result;
    }

    // Pick first non-lookup sheet (skip "DO NOT EDIT" or lookup sheets)
    let targetSheetName = workbook.SheetNames[0];
    for (const name of workbook.SheetNames) {
      const lower = name.toLowerCase();
      if (!lower.includes("do not edit") && !lower.includes("lookup") && !lower.includes("master")) {
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

    // Scan top 30 rows for metadata and headers
    for (let r = 0; r < Math.min(rawRows.length, 30); r++) {
      const row = rawRows[r] || [];
      const rowStr = row.map((c) => String(c ?? "").trim()).join(" ");
      const rowLower = rowStr.toLowerCase();

      // Extract Reference (DSGC WR NO / WRF / DRA / Release No)
      if (!result.header.draReference) {
        for (let c = 0; c < row.length; c++) {
          const cellStr = String(row[c] ?? "").trim();
          const match = cellStr.match(/(?:DSGC\s*WR|WR|WRF|DRA|RELEASE)\s*(?:NO|#|NUM|NUMBER|REF|REFERENCE)?\s*[:.-]\s*([A-Z0-9_-]{3,})/i);
          if (match && match[1] && !/^(no|num|number|ref|reference|form|advice|list)$/i.test(match[1])) {
            result.header.draReference = match[1];
            break;
          } else if (/^(?:DSGC\s*WR|WR|WRF|DRA|RELEASE)\s*(?:NO|#|NUM|NUMBER|REF|REFERENCE)?\s*[:.-]?$/i.test(cellStr)) {
            const nextCell = String(row[c + 1] ?? "").trim();
            if (nextCell && !/^(no|num|number|ref|reference|form|advice|list)$/i.test(nextCell)) {
              result.header.draReference = nextCell;
              break;
            }
          }
        }
      }

      // Identify the requesting Organization first. DELIVERY TO/SHIP TO is a
      // separate recipient field and must not be used as the requester.
      if (!result.header.requestingOrganization) {
        for (let c = 0; c < row.length; c++) {
          const cellStr = String(row[c] ?? "").trim();
          if (/^(REQUESTED\s*BY|REQUESTOR|REQUESTING\s*(?:ORG(?:ANIZATION)?|PARTY)|CUSTOMER|BILL\s*TO)\s*[:.-]?$/i.test(cellStr)) {
            const nextCell = String(row[c + 1] ?? "").trim();
            const belowCell = rawRows[r + 1] ? String(rawRows[r + 1][c] ?? "").trim() : "";
            result.header.requestingOrganization = nextCell || belowCell;
            break;
          }
        }
      }

      if (!result.header.recipientOrganization) {
        for (let c = 0; c < row.length; c++) {
          const cellStr = String(row[c] ?? "").trim();
          if (/^(DELIVERY\s*TO|SHIP\s*TO|DELIVER\s*TO)\s*[:.-]?$/i.test(cellStr)) {
            // Next row or next col
            const nextCell = String(row[c + 1] ?? "").trim();
            const belowCell = rawRows[r + 1] ? String(rawRows[r + 1][c] ?? "").trim() : "";
            result.header.recipientOrganization = nextCell || belowCell;
            break;
          }
        }
      }

      result.header.customerOrganization = result.header.recipientOrganization ?? result.header.requestingOrganization;

      // Extract Date (REQUESTED WITHDRAWAL DATE:)
      if (!result.header.releaseDate) {
        for (let c = 0; c < row.length; c++) {
          const cellStr = String(row[c] ?? "").trim();
          const dateMatch = cellStr.match(/(?:DATE)\s*[:.-]?\s*([0-9A-Z-/.]+)/i);
          if (dateMatch && dateMatch[1] && dateMatch[1].length >= 4) {
            result.header.releaseDate = dateMatch[1];
            break;
          } else if (/DATE\s*[:.-]?$/i.test(cellStr)) {
            const nextCell = String(row[c + 1] ?? "").trim();
            if (nextCell) {
              result.header.releaseDate = nextCell;
              break;
            }
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
          val.includes("customer item") ||
          val.includes("cust item") ||
          val.includes("cust pn") ||
          val.includes("cust p/n") ||
          val.includes("customer pn") ||
          val.includes("client item") ||
          val.includes("customer part") ||
          val.includes("buyer item") ||
          val.includes("drawing no") ||
          val.includes("cust part #") ||
          val.includes("cust part no")
        ) {
          if (candidateColMap["customerItemCode"] === undefined) candidateColMap["customerItemCode"] = c;
        } else if (
          val === "item code" ||
          val === "sku" ||
          val.includes("part no") ||
          val.includes("part number") ||
          val.includes("part #") ||
          val.includes("product code") ||
          val.includes("material code") ||
          val.includes("material no") ||
          val === "material" ||
          val.includes("dsgc item") ||
          val.includes("supplier item") ||
          val.includes("catalog no") ||
          val.includes("cat #") ||
          (val.includes("p/n") && !val.includes("cust")) ||
          (val.includes("pn") && !val.includes("cust") && !val.includes("desc")) ||
          (val.includes("item") && !val.includes("no") && !val.includes("desc") && !val.includes("cust"))
        ) {
          if (candidateColMap["itemCode"] === undefined) candidateColMap["itemCode"] = c;
        } else if (
          val.includes("item description") ||
          val === "description" ||
          val === "desc" ||
          val.includes("product description") ||
          val.includes("material description")
        ) {
          if (candidateColMap["itemDescription"] === undefined) candidateColMap["itemDescription"] = c;
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
          val.includes("requested qty") ||
          val.includes("to pick") ||
          val.includes("pick qty") ||
          val.includes("release qty") ||
          val.includes("total qty") ||
          val.includes("order qty") ||
          val.includes("ordered qty") ||
          val.includes("bal qty") ||
          val.includes("balance qty") ||
          val === "qty" ||
          val === "quantity" ||
          val.includes("quantity") ||
          val.includes("amount (pcs)") ||
          val.includes("total pcs") ||
          val.includes("pcs")
        ) {
          if (candidateColMap["requestedQty"] === undefined) candidateColMap["requestedQty"] = c;
        } else if (
          val.includes("uom") ||
          val.includes("unit of measure") ||
          val === "unit" ||
          val.includes("measurement") ||
          val.includes("base unit")
        ) {
          if (candidateColMap["uom"] === undefined) candidateColMap["uom"] = c;
        } else if (
          val.includes("remark") ||
          val.includes("note") ||
          val.includes("comment")
        ) {
          if (candidateColMap["remarks"] === undefined) candidateColMap["remarks"] = c;
        }
      }

      const hasItem =
        candidateColMap["itemCode"] !== undefined ||
        candidateColMap["customerItemCode"] !== undefined;
      const hasQty =
        candidateColMap["requestedQty"] !== undefined ||
        candidateColMap["noOfPackages"] !== undefined;

      const recognizedCount = Object.keys(candidateColMap).length;
      if (hasItem && hasQty && recognizedCount > bestScore) {
        bestScore = recognizedCount;
        bestHeaderRowIndex = r;
        bestColMap = candidateColMap;
      }
    }

    if (bestHeaderRowIndex !== -1) {
      headerRowIndex = bestHeaderRowIndex;
      Object.assign(colMap, bestColMap);
    } else {
      headerRowIndex = 0;
      colMap["itemCode"] = 0;
      colMap["requestedQty"] = 1;
      colMap["uom"] = 2;
      result.warnings.push("Could not unambiguously identify DRA table headers; using default column positions.");
    }

    // Process data rows
    const startRow = headerRowIndex + 1;
    for (let r = startRow; r < rawRows.length; r++) {
      const row = rawRows[r];
      if (!row || row.length === 0) continue;

      const rowStr = row.map((c) => String(c ?? "")).join(" ").toLowerCase();
      if (
        rowStr.includes("total qty") ||
        rowStr.includes("total quantity") ||
        rowStr.includes("subtotal") ||
        rowStr.includes("delivery instructions") ||
        rowStr.includes("n/f")
      ) {
        continue;
      }

      const itemCodeRaw = colMap["itemCode"] !== undefined ? row[colMap["itemCode"]] : undefined;
      const custItemCodeRaw = colMap["customerItemCode"] !== undefined ? row[colMap["customerItemCode"]] : undefined;
      const itemDescriptionRaw = colMap["itemDescription"] !== undefined ? row[colMap["itemDescription"]] : undefined;
      const qtyRaw = colMap["requestedQty"] !== undefined ? row[colMap["requestedQty"]] : undefined;
      const packageCountRaw = colMap["noOfPackages"] !== undefined ? row[colMap["noOfPackages"]] : undefined;
      const spqRaw = colMap["spq"] !== undefined ? row[colMap["spq"]] : undefined;

      if (!itemCodeRaw && !custItemCodeRaw && !qtyRaw && !packageCountRaw) continue;

      const primaryCode = custItemCodeRaw ? String(custItemCodeRaw).trim() : (itemCodeRaw ? String(itemCodeRaw).trim() : "");
      if (/^(item|item code|item no|part|part no|part number|sku|cust|cust pn|cust p\/n|customer part|customer item|n\/f|#|total)$/i.test(primaryCode)) continue;

      let requestedQty = qtyRaw !== undefined && qtyRaw !== null && qtyRaw !== "" ? Number(qtyRaw) : undefined;
      const packageCount = packageCountRaw !== undefined && packageCountRaw !== null && packageCountRaw !== "" ? Number(packageCountRaw) : undefined;
      const spq = spqRaw !== undefined && spqRaw !== null && spqRaw !== "" ? Number(spqRaw) : undefined;

      // Qty is equal to SPQ × No. of packages (cartons)
      if ((!requestedQty || isNaN(requestedQty)) && packageCount && spq && !isNaN(packageCount) && !isNaN(spq)) {
        requestedQty = packageCount * spq;
      } else if ((!requestedQty || isNaN(requestedQty)) && packageCount && !isNaN(packageCount)) {
        requestedQty = packageCount;
      }

      if (primaryCode || (requestedQty && requestedQty > 0)) {
        const rawUom = colMap["uom"] !== undefined && row[colMap["uom"]] ? String(row[colMap["uom"]]).trim().toUpperCase() : "BOX";
        const uom = (rawUom === "PALLET" || rawUom === "PLT") ? "BOX" : rawUom;
        result.rows.push({
          itemCode: itemCodeRaw ? String(itemCodeRaw).trim() : undefined,
          customerItemCode: custItemCodeRaw ? String(custItemCodeRaw).trim() : undefined,
          itemDescription: itemDescriptionRaw ? String(itemDescriptionRaw).trim() : undefined,
          requestedQty: requestedQty && !isNaN(requestedQty) ? requestedQty : undefined,
          packageCount: packageCount && !isNaN(packageCount) ? packageCount : undefined,
          spq: spq && !isNaN(spq) ? spq : undefined,
          uom,
          remarks: colMap["remarks"] !== undefined && row[colMap["remarks"]] ? String(row[colMap["remarks"]]).trim() : undefined,
        });
      }
    }

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
    const requestingMatch = text.match(/(?:REQUESTED\s*BY|REQUESTOR|REQUESTING\s*(?:ORGANIZATION|ORG)|CUSTOMER|BILL\s*TO)\s*[:.-]\s*([^\n\r]+)/i);
    const recipientMatch = text.match(/(?:DELIVERY\s*TO|SHIP\s*TO|DELIVER\s*TO)\s*[:.-]\s*([^\n\r]+)/i);
    if (requestingMatch?.[1]?.trim()) result.header.requestingOrganization = requestingMatch[1].trim();
    if (recipientMatch?.[1]?.trim()) result.header.recipientOrganization = recipientMatch[1].trim();
    result.header.customerOrganization = result.header.recipientOrganization ?? result.header.requestingOrganization;

    const refMatch = text.match(/(?:DRA|WRF|DSGC\s*WR|WR)\s*(?:No|#|Num|Reference)?\s*[:.-]?\s*([A-Z0-9_-]{3,30})/i) ||
      text.match(/(?:Release|Advice|Ref)\s*(?:No|#|Num|Reference)?\s*[:.-]?\s*([A-Z0-9_-]{3,30})/i);
    if (refMatch) {
      result.header.draReference = refMatch[1];
    }

    const lineRegex = /([A-Z0-9_-]{3,25})\s+(\d+(?:\.\d+)?)\s*(BOX|PCS|CTN|KG|UNITS|PK)?/gi;

    for (const line of lines) {
      if (/delivery|release|advice|date|page|total|subtotal/i.test(line) && !/\d{2,}/.test(line)) {
        continue;
      }

      let match: RegExpExecArray | null;
      lineRegex.lastIndex = 0;
      while ((match = lineRegex.exec(line)) !== null) {
        const potentialItem = match[1];
        const qtyStr = match[2];
        const rawUom = (match[3] || "BOX").toUpperCase();
        const uom = (rawUom === "PALLET" || rawUom === "PLT") ? "BOX" : rawUom;

        if (/^(total|page|dra|date|ref|no|qty|uom)$/i.test(potentialItem)) continue;

        const qty = parseFloat(qtyStr);
        if (!isNaN(qty) && qty > 0) {
          result.rows.push({
            itemCode: potentialItem,
            requestedQty: qty,
            uom,
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

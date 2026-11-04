import * as XLSX from "xlsx";

export interface ParsedDraRow {
  /** One-based worksheet row (or PDF text line), for operator review. */
  sourceRow?: number;
  itemCode?: string;
  customerItemCode?: string;
  itemDescription?: string;
  requestedQty?: number;
  packageCount?: number;
  spq?: number;
  uom?: string;
  remarks?: string;
}

export type DraColumn = "itemCode" | "customerItemCode" | "itemDescription" | "requestedQty" | "packageCount" | "spq" | "uom" | "remarks";
export type DraColumnMap = Partial<Record<DraColumn, number>>;
export interface DraImportOptions {
  sheetName?: string;
  /** Zero-based; the UI displays a one-based worksheet row. */
  headerRowIndex?: number;
  columnMap?: DraColumnMap;
}
export type DraParseOptions = DraImportOptions;
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
  spreadsheet?: {
    sheetNames: string[];
    sheetName: string;
    headerRowIndex: number;
    columns: Array<{ index: number; label: string }>;
    columnMap: DraColumnMap;
  };
}

const FIELDS: DraColumn[] = ["itemCode", "customerItemCode", "itemDescription", "requestedQty", "packageCount", "spq", "uom", "remarks"];
const textOf = (value: unknown): string => value == null ? "" : String(value).trim();
const present = (value: unknown): boolean => value != null && textOf(value) !== "";
function emptyResult(fileName: string): DraParseResult {
  return { ok: true, fileName, header: {}, rows: [], errors: [], warnings: [] };
}

/** Extract document demand. Stock identity and allocation are reviewed separately. */
export async function parseDraDocument(buffer: Buffer, fileName: string, options: DraImportOptions = {}): Promise<DraParseResult> {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return parseDraPdf(buffer, fileName);
  if (["xlsx", "xls", "csv"].includes(ext ?? "")) return parseDraExcel(buffer, fileName, options);
  return { ...emptyResult(fileName), ok: false, errors: [`Unsupported file format .${ext ?? ""}. Upload an Excel (.xlsx, .xls, .csv) or PDF (.pdf) DRA.`] };
}

/** Match headers, never arbitrary data positions. Pack size precedes carton count. */
function columnFor(label: string): DraColumn | undefined {
  const value = label.toLowerCase().replace(/\s+/g, " ").trim();
  if (/customer\s*(?:item|part|pn|p\/n)|cust\s*(?:item|part|pn|p\/n)|client item|buyer item|drawing no/.test(value)) return "customerItemCode";
  if (/spq|pcs\s*(?:\/|per)\s*(?:ctn|carton|box)|qty\/box|units\/ctn|(?:standard|std)\s*(?:pkg|package)/.test(value)) return "spq";
  if (/item description|product description|material description/.test(value) || /^(?:description|desc)$/.test(value)) return "itemDescription";
  if (/no\.? of (?:boxes|packages|ctn|pkg)|total packages|package count|box count|carton count|\b(?:boxes|cartons|ctns?|pkgs?|packages)\b/.test(value)) return "packageCount";
  if (/requested qty|to pick|pick qty|release qty|total qty|order(?:ed)? qty|bal(?:ance)? qty|quantity|amount \(pcs\)|total pcs/.test(value) || /^(?:qty|pcs)$/.test(value)) return "requestedQty";
  if (/uom|unit of measure|measurement|base unit/.test(value) || value === "unit") return "uom";
  if (/remark|note|comment/.test(value)) return "remarks";
  if (/part no|part number|part #|product code|material code|material no|dsgc item|supplier item|catalog no|cat #|\bp\/n\b/.test(value) || /^(?:item code|sku|material|item|pn)$/.test(value)) return "itemCode";
  return undefined;
}
function detectColumns(rows: unknown[][], headerIndex: number): DraColumnMap {
  const top = rows[headerIndex] ?? [];
  const bottom = rows[headerIndex + 1] ?? [];
  const map: DraColumnMap = {};
  top.forEach((cell, index) => {
    if (!present(cell)) return;
    const field = columnFor(textOf(cell)) ?? columnFor(`${textOf(cell)} ${textOf(bottom[index])}`);
    if (field && map[field] === undefined) map[field] = index;
  });
  return map;
}
function hasDemandColumns(map: DraColumnMap): boolean {
  return (map.itemCode !== undefined || map.customerItemCode !== undefined)
    && (map.requestedQty !== undefined || map.packageCount !== undefined);
}
function readHeader(rows: unknown[][], result: DraParseResult): void {
  const header = result.header;
  const labels: Array<[keyof typeof header, RegExp]> = [
    ["requestingOrganization", /^(?:REQUESTED\s*BY|REQUESTOR|REQUESTING\s*(?:ORG(?:ANIZATION)?|PARTY)|CUSTOMER|BILL\s*TO)\s*(?:[:.-]\s*(.*))?$/i],
    ["recipientOrganization", /^(?:DELIVERY\s*TO|SHIP\s*TO|DELIVER\s*TO)\s*(?:[:.-]\s*(.*))?$/i],
    ["draReference", /^(?:DSGC\s*WR|WRF|DRA|WR|RELEASE)\s*(?:NUMBER|REFERENCE|NUM|REF|NO|#)\s*[:.-]?\s*(.*)$/i],
    ["releaseDate", /^(?:REQUESTED\s*WITHDRAWAL\s*DATE|RELEASE\s*DATE|DATE)\s*[:.-]?\s*(.*)$/i],
  ];
  rows.slice(0, 50).forEach((row, rowIndex) => row.forEach((cell, columnIndex) => {
    for (const [key, regex] of labels) {
      if (header[key]) continue;
      const match = textOf(cell).match(regex);
      if (!match) continue;
      const next = row.slice(columnIndex + 1).find(present);
      const value = match[1]?.trim() || textOf(next) || textOf(rows[rowIndex + 1]?.[columnIndex]);
      if (value) header[key] = value;
    }
  }));
  header.customerOrganization = header.recipientOrganization ?? header.requestingOrganization;
}
function numberOf(value: unknown, field: string, sourceRow: number, warnings: string[]): number | undefined {
  if (!present(value)) return undefined;
  const number = typeof value === "number" ? value : Number(textOf(value).replace(/,/g, ""));
  if (Number.isFinite(number)) return number;
  warnings.push(`Row ${sourceRow}: ${field} is not a number. Correct this quantity in the import review.`);
  return undefined;
}
function extractRows(rows: unknown[][], headerIndex: number, map: DraColumnMap, result: DraParseResult): void {
  for (let index = headerIndex + 1; index < rows.length; index++) {
    const row = rows[index] ?? [];
    const get = (field: DraColumn): unknown => map[field] === undefined ? undefined : row[map[field]];
    if (!["itemCode", "customerItemCode", "itemDescription", "requestedQty", "packageCount"].some((key) => present(get(key as DraColumn)))) continue;
    const code = textOf(get("customerItemCode")) || textOf(get("itemCode"));
    if (/^(?:item|item code|item no\.?|part|part no\.?|part number|sku|cust|cust pn|cust p\/n|customer part|customer item|n\/f|#|total(?: qty| quantity)?|subtotal)$/i.test(code)) continue;
    const firstText = row.find(present);
    if (/^(?:total(?:\s+(?:qty|quantity|boxes|cartons))?|subtotal|delivery instructions|n\/f)\s*:?$/i.test(textOf(firstText))) continue;
    if (columnFor(code) === "customerItemCode" || columnFor(code) === "itemCode") continue;
    const sourceRow = index + 1;
    let requestedQty = numberOf(get("requestedQty"), "requested quantity", sourceRow, result.warnings);
    const packageCount = numberOf(get("packageCount"), "box count", sourceRow, result.warnings);
    const spq = numberOf(get("spq"), "SPQ", sourceRow, result.warnings);
    const uom = textOf(get("uom")).toUpperCase() || undefined;
    const quantityUsesBoxes = /^(?:box(?:es)?|ctns?|cartons?|pkgs?|packages?)$/i.test(uom ?? "");
    // Only an absent value may be derived; never replace zero or invalid input.
    // An explicit carton UOM must not label the derived base-unit total as boxes.
    if (!present(get("requestedQty")) && !quantityUsesBoxes && packageCount !== undefined && spq !== undefined && packageCount >= 0 && spq > 0) requestedQty = packageCount * spq;
    result.rows.push({
      sourceRow,
      itemCode: textOf(get("itemCode")) || undefined,
      customerItemCode: textOf(get("customerItemCode")) || undefined,
      itemDescription: textOf(get("itemDescription")) || undefined,
      requestedQty,
      packageCount,
      spq,
      uom,
      remarks: textOf(get("remarks")) || undefined,
    });
  }
}
function validMapping(map: DraColumnMap, columnCount: number): boolean {
  const entries = Object.entries(map);
  return entries.every(([field, index]) => FIELDS.includes(field as DraColumn) && Number.isInteger(index) && index >= 0 && index < columnCount)
    && new Set(entries.map(([, index]) => index)).size === entries.length;
}
async function parseDraExcel(buffer: Buffer, fileName: string, options: DraImportOptions): Promise<DraParseResult> {
  const result = emptyResult(fileName);
  try {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    if (workbook.SheetNames.length === 0) return { ...result, ok: false, errors: ["The workbook contains no worksheets. Upload a DRA with a release table."] };
    const defaultSheet = workbook.SheetNames.find((name) => !/do not edit|lookup|master/i.test(name)) ?? workbook.SheetNames[0];
    const sheetName = options.sheetName ?? defaultSheet;
    if (!workbook.SheetNames.includes(sheetName)) return { ...result, ok: false, errors: ["The selected worksheet is unavailable. Select a worksheet from this workbook."] };
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: null, blankrows: true });
    if (!rows.some((row) => row.some(present))) {
      result.spreadsheet = { sheetNames: workbook.SheetNames, sheetName, headerRowIndex: 0, columns: [], columnMap: {} };
      result.warnings.push(`Worksheet “${sheetName}” is empty. Select another worksheet containing the DRA table.`);
      return result;
    }
    readHeader(rows, result);
    let headerRowIndex = options.headerRowIndex ?? 0;
    let columnMap: DraColumnMap = {};
    if (options.headerRowIndex === undefined) {
      let bestScore = 0;
      for (let index = 0; index < Math.min(rows.length, 50); index++) {
        const detected = detectColumns(rows, index);
        const score = Object.keys(detected).length;
        if (hasDemandColumns(detected) && score > bestScore) {
          bestScore = score;
          headerRowIndex = index;
          columnMap = detected;
        }
      }
    } else if (!Number.isInteger(headerRowIndex) || headerRowIndex < 0 || headerRowIndex >= rows.length) {
      return { ...result, ok: false, errors: ["The header row is outside this worksheet. Enter the row containing the column names."] };
    } else columnMap = detectColumns(rows, headerRowIndex);
    if (options.columnMap !== undefined) columnMap = { ...options.columnMap };
    const columnCount = Math.max(...rows.map((row) => row.length));
    result.spreadsheet = {
      sheetNames: workbook.SheetNames,
      sheetName,
      headerRowIndex,
      columns: Array.from({ length: columnCount }, (_, index) => ({
        index,
        label: textOf(rows[headerRowIndex]?.[index]) || `Column ${XLSX.utils.encode_col(index)}`,
      })),
      columnMap,
    };
    if (!validMapping(columnMap, columnCount)) return { ...result, ok: false, errors: ["Column mapping is invalid. Choose a different existing source column for each mapped field."] };
    if (!hasDemandColumns(columnMap)) {
      result.warnings.push("Map an item code or customer item code and either requested quantity or box count before reviewing release rows.");
      return result;
    }
    extractRows(rows, headerRowIndex, columnMap, result);
    if (result.rows.length === 0) result.warnings.push("No release rows were extracted. Check the worksheet, header row, and column mapping.");
  } catch {
    result.ok = false;
    result.errors.push("The DRA workbook could not be read. Save a new Excel or CSV copy and upload it again.");
  }
  return result;
}
async function parseDraPdf(buffer: Buffer, fileName: string): Promise<DraParseResult> {
  const result = emptyResult(fileName);
  let parser: { destroy(): Promise<void> } | undefined;
  try {
    const { PDFParse } = await import("pdf-parse");
    const pdf = new PDFParse({ data: new Uint8Array(buffer) });
    parser = pdf;
    const { text } = await pdf.getText({ cellSeparator: "\t", pageJoiner: "\n" });
    if (!text.trim()) {
      result.warnings.push("This PDF has no readable text and may be a scanned image. Upload the original Excel/CSV DRA or a searchable text PDF, or enter the release rows manually.");
      return result;
    }
    const lines = text.split(/\r?\n/).map((line) => line.trim());
    readHeader(lines.map((line) => line.split(/\t|\s{2,}/)), result);
    const table = lines.map((line) => line.split(/\t|\s{2,}/));
    let tableHeader = -1;
    let tableMap: DraColumnMap = {};
    for (let index = 0; index < table.length; index++) {
      const map = detectColumns(table, index);
      if (hasDemandColumns(map)) {
        tableHeader = index;
        tableMap = map;
        break;
      }
    }
    if (tableHeader >= 0) extractRows(table, tableHeader, tableMap, result);
    else lines.forEach((line, index) => {
      if (/^(?:delivery|release|advice|requested by|requestor|customer|bill to|ship to|date|page|total|subtotal|dra|wrf|dsgc wr)\b/i.test(line)) return;
      const match = line.match(/^([A-Z0-9][A-Z0-9._/-]{1,99})\s+([+-]?\d[\d,]*(?:\.\d+)?)\s*(BOX(?:ES)?|PCS|CTNS?|CARTONS?|KG|UNITS?|PK|EA)?(?:\s+(.+))?$/i);
      if (match) result.rows.push({ sourceRow: index + 1, itemCode: match[1], requestedQty: Number(match[2].replace(/,/g, "")), uom: match[3]?.toUpperCase(), remarks: match[4] });
    });
    if (result.rows.length === 0) result.warnings.push("PDF text was extracted, but its release table could not be identified. Upload an Excel/CSV copy or enter the release rows manually.");
    else result.warnings.push("Review every PDF item and quantity against the document before applying the import.");
  } catch {
    result.ok = false;
    result.errors.push("The DRA PDF could not be read. Upload an unlocked searchable PDF or the original Excel/CSV document.");
  } finally {
    if (parser) await parser.destroy().catch(() => undefined);
  }
  return result;
}

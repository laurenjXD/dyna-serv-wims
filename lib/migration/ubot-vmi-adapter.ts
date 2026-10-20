import * as XLSX from "xlsx";
import type {
  MigrationIssue,
  UbotItemDraft,
  UbotLocationDraft,
  UbotMigrationDraft,
  UbotOpeningBalanceDraft,
  UbotPartyDraft,
  UbotRateDraft,
  UbotSourceRow,
} from "./types";

type Cell = string | number | boolean | Date | null | undefined;
type Row = Record<string, Cell>;

const REFERENCE_SHEETS = [
  "IN",
  "OUT",
  "Transactions",
  "SOA Details",
  "CBM Ledger",
  "Storage Ledger",
];

function text(value: Cell): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function numberValue(value: Cell): number | undefined {
  const raw = text(value).replace(/,/g, "");
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeHeader(value: Cell): string {
  return text(value).replace(/\s+/g, " ").toLowerCase();
}

function normalizeItemCode(value: Cell): string {
  const raw = text(value).replace(/\s+/g, "");
  if (!raw) return "";
  if (!/[eE][+-]?\d+$/.test(raw)) return raw;

  const [mantissa, exponentText] = raw.toUpperCase().split("E");
  const exponent = Number(exponentText);
  const negative = mantissa.startsWith("-");
  const unsigned = negative || mantissa.startsWith("+") ? mantissa.slice(1) : mantissa;
  const [whole, fraction = ""] = unsigned.split(".");
  const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, "");
  const decimalIndex = whole.length + exponent;
  let expanded: string;
  if (decimalIndex <= 0) expanded = `0.${"0".repeat(-decimalIndex)}${digits}`;
  else if (decimalIndex >= digits.length) expanded = `${digits}${"0".repeat(decimalIndex - digits.length)}`;
  else expanded = `${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
  expanded = expanded.replace(/\.0+$/, "").replace(/^0+(?=\d)/, "");
  return negative ? `-${expanded}` : expanded;
}

function excelDate(value: Cell): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const numeric = numberValue(value);
  if (numeric === undefined) return undefined;
  const date = new Date(Date.UTC(1899, 11, 30) + numeric * 86400000);
  return date.toISOString().slice(0, 10);
}

function sheetRows(workbook: XLSX.WorkBook, sheetName: string): Array<{ rowNumber: number; row: Row }> {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  const matrix = XLSX.utils.sheet_to_json<Cell[]>(sheet, { header: 1, defval: "", raw: true });
  return matrix.map((values, index) => ({
    rowNumber: index + 1,
    row: Object.fromEntries(values.map((value, column) => [String(column), value])),
  }));
}

function tabularRows(
  workbook: XLSX.WorkBook,
  sheetName: string,
  requiredHeaders: string[],
): Array<{ rowNumber: number; row: Row }> {
  const rows = sheetRows(workbook, sheetName);
  const required = new Set(requiredHeaders.map((header) => normalizeHeader(header)));
  const header = rows.find(({ row }) => {
    const values = new Set(Object.values(row).map(normalizeHeader));
    return [...required].every((value) => values.has(value));
  });
  if (!header) return [];
  const headers = Object.values(header.row).map(normalizeHeader);
  return rows
    .filter(({ rowNumber }) => rowNumber > header.rowNumber)
    .map(({ rowNumber, row }) => ({
      rowNumber,
      row: Object.fromEntries(Object.entries(row).map(([column, value]) => [headers[Number(column)] ?? column, value])),
    }))
    .filter(({ row }) => Object.values(row).some((value) => text(value)));
}

function locationParts(label: string): Omit<UbotLocationDraft, "sourceRow" | "label"> {
  if (label.toUpperCase() === "RCV") {
    return { zone: "RCV", rack: "RCV", level: "0", position: "0", locationType: "receiving_bay" };
  }
  const match = label.match(/^([A-Za-z]+)(\d+)-(\d+)$/);
  if (match) {
    return { zone: match[1].toUpperCase(), rack: match[1].toUpperCase(), level: match[2], position: match[3], locationType: "storage" };
  }
  return { zone: label, rack: label, level: "0", position: "0", locationType: "storage" };
}

function addIssue(issues: MigrationIssue[], issue: MigrationIssue): void {
  issues.push(issue);
}

function sourceRowKey(value: string): string {
  if (value.length <= 255) return value;
  return `${value.slice(0, 240)}…[${value.length} chars]`;
}

function displayValue(value: string): string {
  return value.length <= 80 ? value : `${value.slice(0, 72)}…[${value.length} chars]`;
}

export function parseUbotVmiWorkbook(buffer: Buffer, openingDate = "2026-10-09"): UbotMigrationDraft {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, raw: true });
  const issues: MigrationIssue[] = [];
  const sourceRows: UbotSourceRow[] = [];
  const availableSheets = new Set(workbook.SheetNames);
  const requiredSheets = ["Customers", "CODES", "Location Matrix", "Rates"];
  for (const sheet of requiredSheets) {
    if (!availableSheets.has(sheet)) addIssue(issues, { severity: "blocking", code: "missing_sheet", message: `Required sheet '${sheet}' is missing.`, sheet });
  }

  const locationRows = tabularRows(workbook, "Location Matrix", ["LOCATION ID", "ITEM CODE", "LOT NO.", "QTY"]);
  const openingItemCodes = new Set(locationRows
    .filter(({ row }) => Boolean(text(row["location id"]) && text(row["item code"]) && text(row["lot no."]) && numberValue(row.qty) !== undefined))
    .map(({ row }) => normalizeItemCode(row["item code"]))
    .filter(Boolean));

  const parties: UbotPartyDraft[] = [];
  const partyKeys = new Set<string>();
  for (const { rowNumber, row } of tabularRows(workbook, "Customers", ["CUSTOMER NAME"])) {
    const name = text(row["customer name"]);
    if (!name) continue;
    const party = {
      sourceRow: rowNumber,
      name,
      address1: text(row["address 1"]) || undefined,
      address2: text(row["address 2"]) || undefined,
      paymentTerms: text(row.terms) || undefined,
      active: text(row["active?"]).toUpperCase() !== "N",
      role: name.toLowerCase() === "ubot incorporated limited" ? "supplier" : "end_customer",
    } satisfies UbotPartyDraft;
    const partyKey = name.toLowerCase();
    if (partyKeys.has(partyKey)) addIssue(issues, { severity: "blocking", code: "duplicate_party", message: `Party ${name} appears more than once.`, sheet: "Customers", row: rowNumber });
    partyKeys.add(partyKey);
    parties.push(party);
    sourceRows.push({ sheetName: "Customers", sourceRowNumber: rowNumber, rowKey: name, phase: "parties", rawData: row, normalizedData: party });
  }

  const items: UbotItemDraft[] = [];
  const itemKeys = new Set<string>();
  for (const { rowNumber, row } of tabularRows(workbook, "CODES", ["ITEM CODE", "CATEGORY", "DESCRIPTION"])) {
    const code = normalizeItemCode(row["item code"]);
    const name = text(row.description);
    if (!code && !name) continue;
    if (!code || !name) {
      addIssue(issues, { severity: openingItemCodes.has(code) ? "blocking" : "warning", code: "item_missing_identity", message: "Item code and description are both required.", sheet: "CODES", row: rowNumber });
      continue;
    }
    if (code.length > 100) addIssue(issues, { severity: openingItemCodes.has(code) ? "blocking" : "warning", code: "item_code_too_long", message: `Item code ${displayValue(code)} exceeds the 100-character canonical limit (${code.length} characters).`, sheet: "CODES", row: rowNumber });
    const item: UbotItemDraft = {
      sourceRow: rowNumber,
      code,
      name,
      category: text(row.category) || undefined,
      lengthCm: numberValue(row["length (cm)"]),
      widthCm: numberValue(row["width (cm)"]),
      heightCm: numberValue(row["height (cm)"]),
      spq: numberValue(row["spq (pcs/roll)"]),
      boxesPerPallet: numberValue(row["no. boxes per pallet"]),
      volumeCm3: numberValue(row.volume),
      volumeCbm: numberValue(row["cbm per box"]),
      spqMeter: numberValue(row["spq meter (from roll)"]),
    };
    if (!item.volumeCbm || item.volumeCbm <= 0) addIssue(issues, { severity: "warning", code: "item_missing_cbm", message: `Item ${displayValue(code)} has no positive CBM per box; the migration fallback will be used unless corrected before commit.`, sheet: "CODES", row: rowNumber });
    if (itemKeys.has(code)) addIssue(issues, { severity: openingItemCodes.has(code) ? "blocking" : "warning", code: "duplicate_item", message: `Item ${displayValue(code)} appears more than once.`, sheet: "CODES", row: rowNumber });
    itemKeys.add(code);
    items.push(item);
    sourceRows.push({ sheetName: "CODES", sourceRowNumber: rowNumber, rowKey: sourceRowKey(code), phase: "items", rawData: row, normalizedData: item });
  }

  const locations = new Map<string, UbotLocationDraft>();
  const locationRawRows = new Map<string, Row>();
  for (const { rowNumber, row } of locationRows) {
    const label = text(row["location id"]);
    if (!label) continue;
    if (!locations.has(label)) {
      locations.set(label, { sourceRow: rowNumber, label, ...locationParts(label) });
      locationRawRows.set(label, row);
    }
  }
  for (const { rowNumber, row } of sheetRows(workbook, "Racking ID")) {
    for (const value of Object.values(row)) {
      const label = text(value);
      if (!label || /^rack /i.test(label) || !/^[A-Za-z]+\d+-\d+$/.test(label)) continue;
      if (!locations.has(label)) {
        locations.set(label, { sourceRow: rowNumber, label, ...locationParts(label) });
        locationRawRows.set(label, row);
      }
    }
  }
  // RCV is a known temporary receiving location in the UBoT profile even when
  // the current snapshot has no stock staged there.
  locations.set("RCV", { sourceRow: 0, label: "RCV", ...locationParts("RCV") });

  const openingBalances: UbotOpeningBalanceDraft[] = [];
  for (const { rowNumber, row } of locationRows) {
    const locationLabel = text(row["location id"]);
    const itemCode = normalizeItemCode(row["item code"]);
    const lotNumber = text(row["lot no."]);
    const quantity = numberValue(row.qty);
    if (!locationLabel && !itemCode && !lotNumber && quantity === undefined) continue;
    if (!locationLabel || !itemCode || !lotNumber || quantity === undefined) {
      addIssue(issues, { severity: "blocking", code: "opening_balance_missing_key", message: "Opening balance requires location, item code, lot number, and quantity.", sheet: "Location Matrix", row: rowNumber });
      continue;
    }
    if (quantity < 0) addIssue(issues, { severity: "blocking", code: "opening_balance_negative", message: `Opening quantity cannot be negative for ${itemCode}/${lotNumber}.`, sheet: "Location Matrix", row: rowNumber });
    const balance = { sourceRow: rowNumber, locationLabel, itemCode, lotNumber, quantity, boxes: numberValue(row["boxes on hand"]), ownerPartyName: "UBoT Incorporated Limited", flowType: "vmi" } satisfies UbotOpeningBalanceDraft;
    openingBalances.push(balance);
    sourceRows.push({ sheetName: "Location Matrix", sourceRowNumber: rowNumber, rowKey: sourceRowKey(`${itemCode}/${lotNumber}/${locationLabel}`), phase: "opening_balances", rawData: row, normalizedData: balance });
  }

  const rates: UbotRateDraft[] = [];
  const rateKeys = new Set<string>();
  for (const { rowNumber, row } of tabularRows(workbook, "Rates", ["CUSTOMER", "CHARGE TYPE", "RATE", "CURRENCY"])) {
    const numericRate = numberValue(row.rate);
    if (numericRate === undefined) {
      addIssue(issues, { severity: "blocking", code: "rate_invalid", message: "Rate must be numeric.", sheet: "Rates", row: rowNumber });
      continue;
    }
    const rate = { sourceRow: rowNumber, partyName: text(row.customer), chargeType: text(row["charge type"]), basis: text(row.basis) || undefined, rate: numericRate, currency: text(row.currency), active: text(row.active).toUpperCase() !== "N", effectiveFrom: excelDate(row["effective from"]), effectiveTo: excelDate(row["effective to"]) } satisfies UbotRateDraft;
    const rateKey = `${rate.partyName.toLowerCase()}/${rate.chargeType.toLowerCase()}/${rate.effectiveFrom ?? ""}`;
    if (rateKeys.has(rateKey)) addIssue(issues, { severity: "blocking", code: "duplicate_rate", message: `Rate ${rate.chargeType} for ${rate.partyName} appears more than once for the same effective date.`, sheet: "Rates", row: rowNumber });
    rateKeys.add(rateKey);
    rates.push(rate);
    sourceRows.push({ sheetName: "Rates", sourceRowNumber: rowNumber, rowKey: sourceRowKey(`${rate.partyName}/${rate.chargeType}/${rate.rate}`), phase: "rates", rawData: row, normalizedData: rate });
  }

  const itemCodes = new Set(items.map((item) => item.code));
  const balanceKeys = new Set<string>();
  for (const balance of openingBalances) {
    const key = `${balance.itemCode}/${balance.lotNumber}/${balance.locationLabel}`;
    if (balanceKeys.has(key)) addIssue(issues, { severity: "blocking", code: "duplicate_opening_balance", message: `Opening balance ${key} appears more than once.`, sheet: "Location Matrix", row: balance.sourceRow });
    balanceKeys.add(key);
  }
  for (const balance of openingBalances) if (!itemCodes.has(balance.itemCode)) addIssue(issues, { severity: "blocking", code: "opening_item_unmatched", message: `Opening balance item ${balance.itemCode} is not enrolled in CODES.`, sheet: "Location Matrix", row: balance.sourceRow });
  for (const balance of openingBalances) if (!locations.has(balance.locationLabel)) addIssue(issues, { severity: "blocking", code: "opening_location_unmatched", message: `Opening balance location ${balance.locationLabel} is not defined.`, sheet: "Location Matrix", row: balance.sourceRow });

  for (const location of locations.values()) {
    if (location.sourceRow > 0) sourceRows.push({ sheetName: "Location Matrix", sourceRowNumber: location.sourceRow, rowKey: location.label, phase: "locations", rawData: locationRawRows.get(location.label) ?? {}, normalizedData: location });
  }
  return { profileKey: "ubot-vmi-v1", organizationName: "UBoT Incorporated Limited", flowType: "vmi", openingDate, parties, items, locations: [...locations.values()], openingBalances, rates, sourceRows, referenceSheets: REFERENCE_SHEETS.filter((sheet) => availableSheets.has(sheet)), issues };
}

export { normalizeItemCode };

import * as XLSX from "xlsx";
import { computeItemVolumes } from "./item-schema";

export type MaterialImportRow = {
  rowNumber: number;
  code: string;
  name: string;
  description: string | null;
  category: string | null;
  lengthCm: string | null;
  widthCm: string | null;
  heightCm: string | null;
  volumeCm3: string | null;
  volumeCbm: string;
  spq: number;
  boxesPerPallet: number | null;
};

export type MaterialImportWarning = { rowNumber: number; message: string };

const DEFAULT_VOLUME_CBM = "0.0001";

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function numberValue(value: unknown): number | undefined {
  const raw = text(value).replace(/,/g, "");
  if (!raw) return undefined;
  const result = Number(raw);
  return Number.isFinite(result) ? result : undefined;
}

function headerKey(value: unknown): string {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function findValue(row: Record<string, unknown>, ...names: string[]): unknown {
  const wanted = new Set(names.map(headerKey));
  const entry = Object.entries(row).find(([key]) => wanted.has(headerKey(key)));
  return entry?.[1];
}

export function parseMaterialImport(buffer: Buffer): {
  rows: MaterialImportRow[];
  warnings: MaterialImportWarning[];
  error?: string;
} {
  const workbook = XLSX.read(buffer, { type: "buffer", raw: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return { rows: [], warnings: [], error: "The file does not contain a worksheet." };

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true });
  const headerIndex = matrix.findIndex((row) => row.some((value) => headerKey(value) === "itemcode"));
  if (headerIndex < 0) return { rows: [], warnings: [], error: "Add an ITEM CODE column to the file." };

  const headers = matrix[headerIndex].map((value, index) => text(value) || `column_${index}`);
  const warnings: MaterialImportWarning[] = [];
  const rows: MaterialImportRow[] = [];

  for (let index = headerIndex + 1; index < matrix.length; index += 1) {
    const values = matrix[index];
    if (!values.some((value) => text(value))) continue;
    const raw = Object.fromEntries(headers.map((header, column) => [header, values[column]]));
    const code = text(findValue(raw, "ITEM CODE", "CODE"));
    const description = text(findValue(raw, "DESCRIPTION", "NAME")) || null;
    if (!code) {
      warnings.push({ rowNumber: index + 1, message: "Missing item code; row will not be imported." });
      continue;
    }

    const length = numberValue(findValue(raw, "LENGTH (cm)", "LENGTH"));
    const width = numberValue(findValue(raw, "WIDTH (cm)", "WIDTH"));
    const height = numberValue(findValue(raw, "HEIGHT (cm)", "HEIGHT"));
    const suppliedCbm = numberValue(findValue(raw, "CBM PER BOX", "VOLUME CBM", "CBM"));
    const suppliedCm3 = numberValue(findValue(raw, "VOLUME", "VOLUME CM3"));
    const hasDimensions = [length, width, height].every((value) => value !== undefined && value > 0);
    const calculated = hasDimensions ? computeItemVolumes(length!, width!, height!) : null;
    const volumeCbm = suppliedCbm && suppliedCbm > 0
      ? suppliedCbm
      : calculated?.volumeCbm ?? Number(DEFAULT_VOLUME_CBM);
    const volumeCm3 = suppliedCm3 && suppliedCm3 > 0
      ? suppliedCm3
      : calculated?.volumeCm3 ?? null;
    const rawSpq = numberValue(findValue(raw, "SPQ (PCS/ROLL)", "SPQ"));
    const rawBoxes = numberValue(findValue(raw, "NO. BOXES PER PALLET", "BOXES PER PALLET"));
    const spq = rawSpq && Number.isInteger(rawSpq) && rawSpq > 0 ? rawSpq : 1;
    const boxesPerPallet = rawBoxes && Number.isInteger(rawBoxes) && rawBoxes > 0 ? rawBoxes : null;
    const category = text(findValue(raw, "CATEGORY")) || null;

    if (!description) warnings.push({ rowNumber: index + 1, message: "Missing description; item name will use the item code." });
    if (!suppliedCbm && !calculated) warnings.push({ rowNumber: index + 1, message: "Missing volume and dimensions; minimum migration volume 0.0001 CBM will be used." });
    if (!rawSpq || !Number.isInteger(rawSpq) || rawSpq < 1) warnings.push({ rowNumber: index + 1, message: "Missing or invalid SPQ; SPQ 1 will be used." });

    rows.push({
      rowNumber: index + 1,
      code,
      name: description ?? code,
      description,
      category,
      lengthCm: hasDimensions ? length!.toFixed(2) : null,
      widthCm: hasDimensions ? width!.toFixed(2) : null,
      heightCm: hasDimensions ? height!.toFixed(2) : null,
      volumeCm3: volumeCm3 === null ? null : volumeCm3.toFixed(2),
      volumeCbm: volumeCbm.toFixed(4),
      spq,
      boxesPerPallet,
    });
  }

  return { rows, warnings };
}

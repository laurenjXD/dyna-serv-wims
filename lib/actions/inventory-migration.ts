"use server";

// Opening Stock Migration — scanner-free bulk Excel/CSV import for existing inventory.
//
// Traceability:
//   specs/06-party-and-item-enrollment/design.md §6 (item master vs physical inventory)
//   specs/07-incoming-receiving/design.md §4, §9 (WRR and location balance creation)
//   specs/01-core-data-model (lot_location_balances, lots, inventory_transactions)

import ExcelJS from "exceljs";
import { PassThrough } from "node:stream";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { RequestAuthorizationResolver } from "@/lib/rbac/session";
import { requirePermission } from "@/lib/rbac/guard";
import { withRlsTransaction } from "@/lib/db/rls-transaction";
import type { RlsTransactionDeps } from "@/lib/db/rls-transaction";
import { rlsPool } from "@/lib/db/rls-pool";
import { getAuthenticatedSession } from "@/lib/auth/get-authenticated-session";
import { db as defaultDb } from "@/lib/db/client";
import { items as itemCatalog } from "@/lib/db/schema/items";
import { locations } from "@/lib/db/schema/locations";
import { lots } from "@/lib/db/schema/lots";
import { lotLocationBalances } from "@/lib/db/schema/lot_location_balances";
import { wrrDocuments, wrrItems } from "@/lib/db/schema/wrr";
import { inventoryTransactions } from "@/lib/db/schema/transactions";
import { randomUUID } from "node:crypto";

const defaultRlsDeps: RlsTransactionDeps = { getAuthenticatedSession, pool: rlsPool };

/* eslint-disable @typescript-eslint/no-explicit-any */
type DbLike = {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
  update: (...args: any[]) => any;
  transaction: (callback: (tx: DbLike) => Promise<unknown>) => Promise<unknown>;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface ParsedOpeningStockRow {
  itemCode: string;
  lotNumber: string;
  locationCode: string;
  boxes: number;
  spq?: number;
  manufactureDate?: string | null;
  expiryDate?: string | null;
  flowType?: "vmi" | "trading" | "supplies";
  remarks?: string | null;
}

export interface ValidatedOpeningStockRow extends ParsedOpeningStockRow {
  itemId: string;
  itemName: string;
  locationId: string;
  spqResolved: number;
  totalQty: number;
  uom: string;
  isValid: boolean;
  error?: string;
}

export interface ParseOpeningStockResult {
  ok: boolean;
  fileName: string;
  rows: ValidatedOpeningStockRow[];
  totalBoxes: number;
  totalPcs: number;
  errors: string[];
  warnings: string[];
}

/**
 * Parses an Excel (.xlsx, .xls) or CSV (.csv) opening stock spreadsheet.
 */
export async function parseOpeningStockFile(
  formData: FormData
): Promise<ParseOpeningStockResult> {
  const file = formData.get("file") as File | null;
  if (!file) {
    return {
      ok: false,
      fileName: "",
      rows: [],
      totalBoxes: 0,
      totalPcs: 0,
      errors: ["No file uploaded. Please select an Excel or CSV file."],
      warnings: [],
    };
  }

  const fileName = file.name;
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = fileName.slice(((fileName.lastIndexOf(".") - 1) >>> 0) + 2).toLowerCase();

  if (!["xlsx", "xls", "csv"].includes(ext)) {
    return {
      ok: false,
      fileName,
      rows: [],
      totalBoxes: 0,
      totalPcs: 0,
      errors: [`Unsupported file format .${ext}. Please upload a .xlsx or .csv file.`],
      warnings: [],
    };
  }

  const rawRows: ParsedOpeningStockRow[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const workbook = new ExcelJS.Workbook();
    const isCsv = ext === "csv";

    if (isCsv) {
      const bufferStream = new PassThrough();
      bufferStream.end(buffer);
      await workbook.csv.read(bufferStream);
    } else {
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    }

    const worksheet = workbook.worksheets[0];
    if (!worksheet || worksheet.rowCount < 2) {
      return {
        ok: false,
        fileName,
        rows: [],
        totalBoxes: 0,
        totalPcs: 0,
        errors: ["Spreadsheet appears empty or has no data rows."],
        warnings: [],
      };
    }

    // Header mapping
    let headerRowIdx = 1;
    const colMap = new Map<string, number>();

    // Scan first 5 rows to locate header row
    for (let r = 1; r <= Math.min(5, worksheet.rowCount); r++) {
      const row = worksheet.getRow(r);
      row.eachCell((cell, colNumber) => {
        const val = String(cell.value || "").trim().toLowerCase();
        if (val.includes("location") || val.includes("rack") || val.includes("bin")) {
          colMap.set("locationCode", colNumber);
        } else if (val.includes("item") || val.includes("sku") || val.includes("code")) {
          colMap.set("itemCode", colNumber);
        } else if (val.includes("lot") || val.includes("batch")) {
          colMap.set("lotNumber", colNumber);
        } else if (val.includes("box") || val.includes("carton") || val.includes("qty") || val.includes("count")) {
          colMap.set("boxes", colNumber);
        } else if (val.includes("spq") || val.includes("pack")) {
          colMap.set("spq", colNumber);
        } else if (val.includes("mfg") || val.includes("manufacture")) {
          colMap.set("mfgDate", colNumber);
        } else if (val.includes("exp") || val.includes("expiry")) {
          colMap.set("expiryDate", colNumber);
        } else if (val.includes("model") || val.includes("flow")) {
          colMap.set("flowType", colNumber);
        } else if (val.includes("remark") || val.includes("note")) {
          colMap.set("remarks", colNumber);
        }
      });

      if (colMap.has("itemCode") && (colMap.has("locationCode") || colMap.has("boxes"))) {
        headerRowIdx = r;
        break;
      }
    }

    // Default column fallback if specific headers weren't named:
    // Col 1 = Item Code, Col 2 = Lot Number, Col 3 = Location, Col 4 = Boxes
    if (!colMap.has("itemCode")) colMap.set("itemCode", 1);
    if (!colMap.has("lotNumber")) colMap.set("lotNumber", 2);
    if (!colMap.has("locationCode")) colMap.set("locationCode", 3);
    if (!colMap.has("boxes")) colMap.set("boxes", 4);
    if (!colMap.has("spq")) colMap.set("spq", 5);

    for (let r = headerRowIdx + 1; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r);
      const itemCode = String(row.getCell(colMap.get("itemCode") || 1).value || "").trim();
      if (!itemCode) continue; // Skip blank rows

      const lotNumber = String(row.getCell(colMap.get("lotNumber") || 2).value || "").trim() || `LOT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
      const locationCode = String(row.getCell(colMap.get("locationCode") || 3).value || "").trim().toUpperCase();
      const boxesRaw = Number(row.getCell(colMap.get("boxes") || 4).value || 0);
      const spqRaw = colMap.has("spq") ? Number(row.getCell(colMap.get("spq")!).value || 0) : undefined;
      const mfgDateRaw = colMap.has("mfgDate") ? row.getCell(colMap.get("mfgDate")!).value : null;
      const expiryDateRaw = colMap.has("expiryDate") ? row.getCell(colMap.get("expiryDate")!).value : null;
      const flowRaw = colMap.has("flowType") ? String(row.getCell(colMap.get("flowType")!).value || "").toLowerCase() : "trading";
      const remarks = colMap.has("remarks") ? String(row.getCell(colMap.get("remarks")!).value || "") : null;

      const flowType = flowRaw.includes("vmi") ? "vmi" : flowRaw.includes("supplies") ? "supplies" : "trading";

      const formatDate = (d: unknown) => {
        if (!d) return null;
        if (d instanceof Date) return d.toISOString().split("T")[0];
        const s = String(d).trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        const parsed = new Date(s);
        return isNaN(parsed.getTime()) ? null : parsed.toISOString().split("T")[0];
      };

      rawRows.push({
        itemCode,
        lotNumber,
        locationCode,
        boxes: Math.max(0, boxesRaw),
        spq: spqRaw && spqRaw > 0 ? spqRaw : undefined,
        manufactureDate: formatDate(mfgDateRaw),
        expiryDate: formatDate(expiryDateRaw),
        flowType,
        remarks,
      });
    }

    // Step 2: Validate items and locations against database
    const uniqueItemCodes = [...new Set(rawRows.map((r) => r.itemCode.toLowerCase()))];
    const uniqueLocationCodes = [...new Set(rawRows.map((r) => r.locationCode.toUpperCase()))];

    const [itemRows, locationRows] = await Promise.all([
      defaultDb
        .select({
          id: itemCatalog.id,
          code: itemCatalog.code,
          name: itemCatalog.name,
          spq: itemCatalog.spq,
          uom: itemCatalog.uom,
        })
        .from(itemCatalog)
        .where(
          uniqueItemCodes.length > 0
            ? inArray(sql`LOWER(${itemCatalog.code})`, uniqueItemCodes)
            : undefined
        ),
      defaultDb
        .select({
          id: locations.id,
          label: locations.label,
          isActive: locations.isActive,
        })
        .from(locations)
        .where(
          uniqueLocationCodes.length > 0
            ? inArray(sql`UPPER(${locations.label})`, uniqueLocationCodes)
            : undefined
        ),
    ]);

    const itemMap = new Map(itemRows.map((i) => [i.code.toLowerCase(), i]));
    const locationMap = new Map(locationRows.map((l) => [l.label.toUpperCase(), l]));

    let totalBoxes = 0;
    let totalPcs = 0;

    const validatedRows: ValidatedOpeningStockRow[] = rawRows.map((row) => {
      const item = itemMap.get(row.itemCode.toLowerCase());
      const location = locationMap.get(row.locationCode.toUpperCase());

      let isValid = true;
      let error = "";

      if (!item) {
        isValid = false;
        error = `Item Code '${row.itemCode}' not found in Item Master Data. Enroll it first.`;
      } else if (!location) {
        isValid = false;
        error = `Location '${row.locationCode}' not found in Locations Master.`;
      } else if (!location.isActive) {
        isValid = false;
        error = `Location '${row.locationCode}' is marked inactive.`;
      } else if (row.boxes <= 0) {
        isValid = false;
        error = `Boxes count must be greater than 0.`;
      }

      const spqResolved = row.spq || item?.spq || 1;
      const totalQty = row.boxes * spqResolved;

      if (isValid) {
        totalBoxes += row.boxes;
        totalPcs += totalQty;
      }

      return {
        ...row,
        itemId: item?.id || "",
        itemName: item?.name || "Unknown Item",
        locationId: location?.id || "",
        spqResolved,
        totalQty,
        uom: item?.uom || "PCS",
        isValid,
        error: error || undefined,
      };
    });

    return {
      ok: errors.length === 0,
      fileName,
      rows: validatedRows,
      totalBoxes,
      totalPcs,
      errors,
      warnings,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      fileName,
      rows: [],
      totalBoxes: 0,
      totalPcs: 0,
      errors: [`Error parsing spreadsheet: ${err instanceof Error ? err.message : "Invalid file"}`],
      warnings: [],
    };
  }
}

/**
 * 1-Click Commits Opening Stock Migration rows directly into warehouse location balances.
 */
export async function commitOpeningStockMigration(
  resolver: RequestAuthorizationResolver,
  rows: ValidatedOpeningStockRow[],
  batchNotes: string = "Opening Stock Migration",
  rlsDeps: RlsTransactionDeps = defaultRlsDeps
): Promise<{ ok: true; wrrNumber: string; committedRows: number } | { ok: false; errors: string[] }> {
  const perm = await requirePermission(resolver, "receiving.confirm");
  if (perm.kind !== "authorized") {
    return { ok: false, errors: ["Forbidden: You do not have permission to post receiving balances."] };
  }

  const validRows = rows.filter((r) => r.isValid && r.itemId && r.locationId);
  if (validRows.length === 0) {
    return { ok: false, errors: ["No valid rows to commit."] };
  }

  const rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;
    const userId = perm.context.userId;

    const timestampStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const randomSuffix = randomUUID().slice(0, 4).toUpperCase();
    const wrrNumber = `WRR-INIT-${timestampStr}-${randomSuffix}`;
    const wrrId = randomUUID();

    // 1. Create Opening Stock WRR Document
    await db.insert(wrrDocuments).values({
      id: wrrId,
      wrrNumber,
      status: "confirmed",
      flowType: validRows[0].flowType || "trading",
      referenceNumber: "OPENING-STOCK-MIGRATION",
      notes: batchNotes,
      vendorPartyId: null,
      createdById: userId,
      confirmedById: userId,
      confirmedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    let committedCount = 0;

    for (const row of validRows) {
      const wrrItemId = randomUUID();
      const lotId = randomUUID();

      // 2. Insert WRR Line
      await db.insert(wrrItems).values({
        id: wrrItemId,
        wrrId,
        itemId: row.itemId,
        lotNumber: row.lotNumber,
        expectedQty: row.boxes,
        scannedQty: row.boxes,
        committedQty: row.boxes,
        uom: row.uom || "BOX",
        disposition: "store",
        status: "committed",
        manufactureDate: row.manufactureDate || null,
        expiryDate: row.expiryDate || null,
        remarks: row.remarks || "Opening balance migration",
      });

      // 3. Create or Match Lot
      const existingLots = await db
        .select({ id: lots.id })
        .from(lots)
        .where(
          and(
            eq(lots.itemId, row.itemId),
            eq(lots.lotNumber, row.lotNumber),
            eq(lots.flowType, row.flowType || "trading")
          )
        );

      let resolvedLotId = lotId;
      if (existingLots.length > 0) {
        resolvedLotId = existingLots[0].id;
      } else {
        await db.insert(lots).values({
          id: lotId,
          itemId: row.itemId,
          lotNumber: row.lotNumber,
          flowType: row.flowType || "trading",
          status: "available",
          manufactureDate: row.manufactureDate || null,
          expiryDate: row.expiryDate || null,
          createdAt: new Date(),
        });
      }

      // 4. Create or Increment Location Balance
      const existingBalances = await db
        .select({
          id: lotLocationBalances.id,
          qtyRemaining: lotLocationBalances.qtyRemaining,
          qtyReceived: lotLocationBalances.qtyReceived,
        })
        .from(lotLocationBalances)
        .where(
          and(
            eq(lotLocationBalances.lotId, resolvedLotId),
            eq(lotLocationBalances.locationId, row.locationId)
          )
        );

      if (existingBalances.length > 0) {
        const bal = existingBalances[0];
        await db
          .update(lotLocationBalances)
          .set({
            qtyRemaining: bal.qtyRemaining + row.boxes,
            qtyReceived: (bal.qtyReceived || bal.qtyRemaining) + row.boxes,
            updatedAt: new Date(),
          })
          .where(eq(lotLocationBalances.id, bal.id));
      } else {
        await db.insert(lotLocationBalances).values({
          id: randomUUID(),
          lotId: resolvedLotId,
          locationId: row.locationId,
          qtyRemaining: row.boxes,
          qtyCommitted: 0,
          qtyReceived: row.boxes,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      // 5. Create Inventory Audit Transaction
      await db.insert(inventoryTransactions).values({
        id: randomUUID(),
        movementType: "receive",
        itemId: row.itemId,
        lotId: resolvedLotId,
        sourceLocationId: null,
        destinationLocationId: row.locationId,
        qty: row.boxes,
        referenceId: wrrId,
        referenceNumber: wrrNumber,
        reason: "Opening Stock Migration",
        createdById: userId,
        createdAt: new Date(),
      });

      committedCount++;
    }

    return { ok: true as const, wrrNumber, committedRows: committedCount };
  });

  if (rlsResult.kind === "unauthenticated") {
    return { ok: false, errors: ["Unauthenticated session."] };
  }

  if (rlsResult.value.ok) {
    try {
      revalidatePath("/inventory");
      revalidatePath("/receiving");
      revalidatePath("/master-data/items");
    } catch {
      // Ignored in non-Next runtime/unit test environments
    }
  }

  return rlsResult.value;
}

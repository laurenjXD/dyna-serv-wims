"use server";

import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { withRlsTransaction } from "@/lib/db/rls-transaction";
import { rlsPool } from "@/lib/db/rls-pool";
import { getAuthenticatedSession } from "@/lib/auth/get-authenticated-session";
import { createClient } from "@/lib/supabase/server";
import { db as defaultDb } from "@/lib/db/client";
import { parties, partyRoles } from "@/lib/db/schema/parties";
import { items } from "@/lib/db/schema/items";
import { locations } from "@/lib/db/schema/locations";
import { lots } from "@/lib/db/schema/lots";
import { lotLocationBalances } from "@/lib/db/schema/lot_location_balances";
import { inventoryTransactions } from "@/lib/db/schema/transactions";
import { inventoryUnits } from "@/lib/db/schema/inventory_units";
import { vmiContractTerms, vmiRecurringFeeLines } from "@/lib/db/schema/vmi_billing";
import { migrationBatches, migrationExceptions, migrationSourceRows } from "@/lib/db/schema/migrations";
import { parseUbotVmiWorkbook, ubotPartyRole } from "@/lib/migration/ubot-vmi-adapter";
import { selectEffectiveUbotRates } from "@/lib/migration/rate-selection";
import { migrationVolumeCbm } from "@/lib/migration/volume";
import { isMigrationResolutionCategory, type MigrationResolutionCategory } from "@/lib/migration/exception-resolution";
import type { UbotMigrationDraft } from "@/lib/migration/types";
import { cartonIdFromUnitId } from "@/lib/barcode/carton";

const defaultRlsDeps = { getAuthenticatedSession, pool: rlsPool };
const SOURCE_BUCKET = "migration-source-files";

function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Unknown migration error.";
  const cause = error.cause;
  if (cause instanceof Error && cause.message) return cause.message;
  if (cause && typeof cause === "object" && "message" in cause && typeof cause.message === "string") return cause.message;
  return error.message;
}

export type MigrationResult =
  | { ok: true; batchId: string; status: string; blockingIssues: number; warningIssues: number; sourceRows: number }
  | { ok: false; error: string };

export type MigrationExceptionSummary = { id: string; severity: string; code: string; message: string; resolutionStatus: string; resolutionCategory: string | null; resolutionNote: string | null };

export type MigrationSummaryResult =
  | {
      ok: true;
      batch: { id: string; status: string; sourceFileName: string; openingDate: string; sourceRows: number };
      exceptions: MigrationExceptionSummary[];
    }
  | { ok: false; error: string };

export type MigrationBatchListItem = {
  id: string;
  status: string;
  sourceFileName: string;
  openingDate: string;
  createdAt: string;
  sourceRows: number;
  blockingIssues: number;
  warningIssues: number;
};

export type MigrationBatchListResult =
  | { ok: true; batches: MigrationBatchListItem[] }
  | { ok: false; error: string };

export type MigratedLotQrLabel = {
  lotId: string;
  lotNumber: string;
  itemCode: string;
};

export type MigratedLotQrLabelResult =
  | { ok: true; labels: MigratedLotQrLabel[] }
  | { ok: false; error: string };

export type MigrationCartonResolution = { lotId: string; cartonCount: number };

export type MigrationCartonQrLabel = {
  unitId: string;
  cartonId: string;
  lotNumber: string;
  itemCode: string;
};

export type MigrationPendingCartonLot = {
  lotId: string;
  lotNumber: string;
  itemCode: string;
  quantity: number;
};

async function canManageMigration() {
  const resolver = await createPageResolver();
  const [partiesPermission, itemsPermission, locationsPermission] = await Promise.all([
    requirePermission(resolver, "parties.manage"),
    requirePermission(resolver, "items.manage"),
    requirePermission(resolver, "locations.manage"),
  ]);
  if ([partiesPermission, itemsPermission, locationsPermission].some((result) => result.kind !== "authorized")) return null;
  if (partiesPermission.kind !== "authorized" || !partiesPermission.context.activeRoleKeys.includes("administrator")) return null;
  const [ratePermission, financialPermission] = await Promise.all([
    requirePermission(resolver, "vmi_contract_terms.manage"),
    requirePermission(resolver, "reporting.financial_read"),
  ]);
  return {
    resolver,
    userId: partiesPermission.context.userId,
    // Older deployed databases gate the VMI contract table through the
    // administrator financial capability, while the newer catalog exposes
    // the narrower vmi_contract_terms.manage capability. Keep migration
    // commit compatible with both RLS versions; the migration is already
    // restricted to administrator users above.
    canManageRates: ratePermission.kind === "authorized" || financialPermission.kind === "authorized",
  };
}

/** Returns the immutable lot identities created by one committed migration. */
export async function getMigratedLotQrLabels(batchId: string): Promise<MigratedLotQrLabelResult> {
  const access = await canManageMigration();
  if (!access) return { ok: false, error: "You do not have permission to print migration lot labels." };
  if (!/^[0-9a-f-]{36}$/i.test(batchId)) return { ok: false, error: "Invalid migration batch." };

  try {
    const rows = await defaultDb
      .select({ lotId: lots.id, lotNumber: lots.lotNumber, itemCode: items.code })
      .from(lots)
      .innerJoin(items, eq(lots.itemId, items.id))
      .where(eq(lots.migrationBatchId, batchId))
      .orderBy(lots.lotNumber, items.code);

    return { ok: true, labels: rows };
  } catch (error) {
    console.error("[data-migration] migrated lot QR labels failed", error);
    return { ok: false, error: "Migrated lot labels are temporarily unavailable." };
  }
}

export async function getMigrationCartonQrLabels(batchId: string): Promise<{ ok: true; labels: MigrationCartonQrLabel[] } | { ok: false; error: string }> {
  const access = await canManageMigration();
  if (!access) return { ok: false, error: "You do not have permission to print migration carton labels." };
  try {
    const rows = await defaultDb
      .select({ unitId: inventoryUnits.unitId, cartonId: inventoryUnits.cartonId, lotNumber: lots.lotNumber, itemCode: items.code })
      .from(inventoryUnits)
      .innerJoin(lots, eq(inventoryUnits.lotId, lots.id))
      .innerJoin(items, eq(lots.itemId, items.id))
      .where(eq(inventoryUnits.migrationBatchId, batchId))
      .orderBy(lots.lotNumber, inventoryUnits.unitIndex);
    return { ok: true, labels: rows };
  } catch (error) {
    console.error("[data-migration] migration carton QR labels failed", error);
    return { ok: false, error: "Migration carton labels are temporarily unavailable." };
  }
}

export async function getPendingMigrationCartonLots(batchId: string): Promise<{ ok: true; lots: MigrationPendingCartonLot[] } | { ok: false; error: string }> {
  const access = await canManageMigration();
  if (!access) return { ok: false, error: "You do not have permission to resolve migration cartons." };
  try {
    const rows = await defaultDb
      .select({ lotId: lots.id, lotNumber: lots.lotNumber, itemCode: items.code, quantity: lotLocationBalances.qtyReceived })
      .from(lots)
      .innerJoin(items, eq(lots.itemId, items.id))
      .innerJoin(lotLocationBalances, eq(lotLocationBalances.lotId, lots.id))
      .where(and(eq(lots.migrationBatchId, batchId), eq(lots.cartonTraceStatus, "pending")))
      .orderBy(lots.lotNumber);
    return { ok: true, lots: rows.map((row) => ({ ...row, quantity: Number(row.quantity) })) };
  } catch (error) {
    console.error("[data-migration] pending migration cartons failed", error);
    return { ok: false, error: "Pending migration cartons are temporarily unavailable." };
  }
}

export async function resolveMigrationCartons(batchId: string, resolutions: MigrationCartonResolution[]): Promise<{ ok: true; created: number } | { ok: false; error: string }> {
  try {
    const access = await canManageMigration();
    if (!access) return { ok: false, error: "You do not have permission to resolve migration cartons." };
    if (resolutions.length === 0) return { ok: false, error: "Enter at least one carton count." };

    const result = await withRlsTransaction(defaultRlsDeps, async (tx, session) => {
      const db = tx.db as typeof defaultDb;
      const [batch] = await db.select({ id: migrationBatches.id, status: migrationBatches.status }).from(migrationBatches).where(eq(migrationBatches.id, batchId)).limit(1);
      if (!batch || batch.status !== "committed") return { ok: false as const, error: "Only committed migration batches can have cartons resolved." };
      let created = 0;
      for (const resolution of resolutions) {
        if (!/^[0-9a-f-]{36}$/i.test(resolution.lotId) || !Number.isInteger(resolution.cartonCount) || resolution.cartonCount < 1) return { ok: false as const, error: "Carton counts must be positive whole numbers." };
        const [lot] = await db.select({ id: lots.id, cartonTraceStatus: lots.cartonTraceStatus }).from(lots).where(and(eq(lots.id, resolution.lotId), eq(lots.migrationBatchId, batchId))).limit(1);
        if (!lot) return { ok: false as const, error: "A migration lot could not be found." };
        const existing = await db.select({ unitId: inventoryUnits.unitId }).from(inventoryUnits).where(and(eq(inventoryUnits.lotId, lot.id), eq(inventoryUnits.migrationBatchId, batchId))).limit(1);
        if (existing.length > 0) return { ok: false as const, error: "This lot already has generated carton identities." };
        const [balance] = await db.select({ locationId: lotLocationBalances.locationId }).from(lotLocationBalances).where(eq(lotLocationBalances.lotId, lot.id)).limit(1);
        if (!balance) return { ok: false as const, error: "A location balance could not be found for this lot." };
        await db.insert(inventoryUnits).values(Array.from({ length: resolution.cartonCount }, (_, unitOffset) => {
          const unitId = randomUUID();
          return { unitId, cartonId: cartonIdFromUnitId(unitId), unitIndex: unitOffset + 1, wrrItemId: null, migrationBatchId: batchId, lotId: lot.id, locationId: balance.locationId, status: "available" as const };
        }));
        await db.update(lots).set({ cartonTraceStatus: "active", updatedAt: new Date() }).where(eq(lots.id, lot.id));
        created += resolution.cartonCount;
      }
      return { ok: true as const, created };
    });
    if (result.kind === "unauthenticated") return { ok: false, error: "Your session is no longer authenticated." };
    if (!result.value.ok) return result.value;
    revalidatePath("/migration/success");
    revalidatePath("/inventory");
    return result.value;
  } catch (error) {
    console.error("[data-migration] migration carton resolution failed", error);
    return { ok: false, error: `The carton resolution could not be saved: ${errorMessage(error)}` };
  }
}

function sourceRows(draft: UbotMigrationDraft) {
  return draft.sourceRows.map((row) => ({
    ...row,
    rowKey: row.rowKey.length <= 255 ? row.rowKey : `${row.rowKey.slice(0, 240)}…[${row.rowKey.length} chars]`,
  }));
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function rateLabel(rate: UbotMigrationDraft["rates"][number]): string {
  const basis = rate.basis ? ` (${rate.basis})` : "";
  return `Imported ${rate.chargeType}${basis}`.slice(0, 200);
}

function blockingIssueMessage(issues: UbotMigrationDraft["issues"]): string {
  const blocking = issues.filter((issue) => issue.severity === "blocking");
  const details = blocking.slice(0, 8).map((issue) => {
    const source = issue.sheet ? ` [${issue.sheet}${issue.row ? ` row ${issue.row}` : ""}]` : "";
    return `• ${issue.message}${source}`;
  });
  const remaining = blocking.length - details.length;
  if (remaining > 0) details.push(`• ${remaining} more blocking error(s) are in the workbook.`);
  return `Workbook rejected. Fix these errors in Excel and upload the file again:\n${details.join("\n")}`;
}

export async function stageUbotMigration(formData: FormData): Promise<MigrationResult> {
  const access = await canManageMigration();
  if (!access) return { ok: false, error: "You do not have permission to stage a data migration." };

  try {

  const file = formData.get("file");
  const sourcePathInput = String(formData.get("sourcePath") || "");
  const sourceFileName = String(formData.get("sourceFileName") || (file instanceof File ? file.name : ""));
  if (!sourceFileName.toLowerCase().endsWith(".xlsx")) return { ok: false, error: "The UBoT migration currently accepts .xlsx workbooks." };

  let buffer: Buffer;
  if (file instanceof File) {
    buffer = Buffer.from(await file.arrayBuffer());
  } else if (sourcePathInput) {
    const supabase = await createClient();
    const download = await supabase.storage.from(SOURCE_BUCKET).download(sourcePathInput);
    if (download.error || !download.data) return { ok: false, error: `The staged workbook could not be read: ${download.error?.message ?? "file not found"}` };
    buffer = Buffer.from(await download.data.arrayBuffer());
  } else {
    return { ok: false, error: "Select the UBoT Excel workbook first." };
  }
  const openingDate = String(formData.get("openingDate") || "2026-10-09");
  const draft = parseUbotVmiWorkbook(buffer, openingDate);
  const blockingIssues = draft.issues.filter((issue) => issue.severity === "blocking").length;
  const warningIssues = draft.issues.filter((issue) => issue.severity === "warning").length;
  if (blockingIssues > 0) {
    if (sourcePathInput) {
      const cleanup = await createClient();
      const removed = await cleanup.storage.from(SOURCE_BUCKET).remove([sourcePathInput]);
      if (removed.error) console.warn("[data-migration] rejected workbook cleanup failed", removed.error);
    }
    return { ok: false, error: blockingIssueMessage(draft.issues) };
  }
  const batchId = randomUUID();
  const hash = createHash("sha256").update(buffer).digest("hex");
  const sourcePath = sourcePathInput || `${draft.profileKey}/${batchId}/${sourceFileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  if (!sourcePathInput) {
    const supabase = await createClient();
    const upload = await supabase.storage.from(SOURCE_BUCKET).upload(sourcePath, buffer, { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", upsert: false });
    if (upload.error) return { ok: false, error: `The workbook could not be retained: ${upload.error.message}` };
  }

  const result = await withRlsTransaction(defaultRlsDeps, async (tx, session) => {
    const db = tx.db as typeof defaultDb;
    const duplicate = await db.select({ id: migrationBatches.id }).from(migrationBatches).where(and(eq(migrationBatches.sourceFileHash, hash), eq(migrationBatches.profileKey, draft.profileKey))).limit(1);
    if (duplicate.length > 0) return { ok: false as const, error: "This workbook has already been staged for this adapter profile. Open it from Previous stages to continue." };

    await db.insert(migrationBatches).values({ id: batchId, organizationName: draft.organizationName, flowType: draft.flowType, profileKey: draft.profileKey, openingDate: draft.openingDate, sourceFileName, sourceFileHash: hash, sourceFileUrl: sourcePath, status: blockingIssues > 0 ? "needs_review" : "staged", uploadedByUserId: session.userId });
    const rows = sourceRows(draft);
    let insertedSourceRows: Array<{ id: string; sheetName: string; sourceRowNumber: number; phase: string }> = [];
    for (const rowChunk of chunks(rows, 250)) {
      const inserted = await db.insert(migrationSourceRows).values(rowChunk.map((row) => ({ batchId, sheetName: row.sheetName, sourceRowNumber: row.sourceRowNumber, rowKey: row.rowKey, phase: row.phase, rawData: row.rawData, normalizedData: row.normalizedData, validationErrors: null }))).returning({ id: migrationSourceRows.id, sheetName: migrationSourceRows.sheetName, sourceRowNumber: migrationSourceRows.sourceRowNumber, phase: migrationSourceRows.phase });
      insertedSourceRows = [...insertedSourceRows, ...inserted];
    }
    if (draft.issues.length > 0) await db.insert(migrationExceptions).values(draft.issues.map((issue) => ({
      batchId,
      sourceRowId: issue.sheet && issue.row
        ? insertedSourceRows.find((row) => row.sheetName === issue.sheet && row.sourceRowNumber === issue.row)?.id ?? null
        : null,
      severity: issue.severity,
      code: issue.code,
      message: `${issue.message}${issue.sheet ? ` (${issue.sheet}${issue.row ? ` row ${issue.row}` : ""})` : ""}`,
      resolutionStatus: "open",
    })));
    return { ok: true as const, batchId, status: blockingIssues > 0 ? "needs_review" : "staged", blockingIssues, warningIssues, sourceRows: rows.length };
  });

  if (result.kind === "unauthenticated") return { ok: false, error: "Your session is no longer authenticated." };
  if (!result.value.ok) return result.value;
  return result.value;
  } catch (error) {
    console.error("[data-migration] staging failed", error);
    return { ok: false, error: `The workbook could not be staged: ${errorMessage(error)}` };
  }
}

export async function getMigrationSummary(batchId: string): Promise<MigrationSummaryResult> {
  const access = await canManageMigration();
  if (!access) return { ok: false, error: "You do not have permission to view migration review details." };

  const result = await withRlsTransaction(defaultRlsDeps, async (tx) => {
    const db = tx.db as typeof defaultDb;
    const [batch] = await db.select({ id: migrationBatches.id, status: migrationBatches.status, sourceFileName: migrationBatches.sourceFileName, openingDate: migrationBatches.openingDate }).from(migrationBatches).where(eq(migrationBatches.id, batchId)).limit(1);
    if (!batch) return { ok: false as const, error: "Migration batch not found." };
    const [sourceRowCount] = await db.select({ count: sql<number>`count(*)` }).from(migrationSourceRows).where(eq(migrationSourceRows.batchId, batchId));
    const exceptions = await db.select({ id: migrationExceptions.id, severity: migrationExceptions.severity, code: migrationExceptions.code, message: migrationExceptions.message, resolutionStatus: migrationExceptions.resolutionStatus, resolutionCategory: migrationExceptions.resolutionCategory, resolutionNote: migrationExceptions.resolutionNote }).from(migrationExceptions).where(eq(migrationExceptions.batchId, batchId));
    return { ok: true as const, batch: { ...batch, sourceRows: Number(sourceRowCount?.count ?? 0) }, exceptions };
  });

  if (result.kind === "unauthenticated") return { ok: false, error: "Your session is no longer authenticated." };
  return result.value;
}

export async function listMigrationBatches(): Promise<MigrationBatchListResult> {
  try {
    const access = await canManageMigration();
    if (!access) return { ok: false, error: "You do not have permission to view previous migration stages." };

    const result = await withRlsTransaction(defaultRlsDeps, async (tx) => {
      const db = tx.db as typeof defaultDb;
      // Committed batches remain in the database as immutable audit/history,
      // but they are no longer resumable migration stages and should not be
      // offered in the review list.
      const batches = await db.select({ id: migrationBatches.id, status: migrationBatches.status, sourceFileName: migrationBatches.sourceFileName, openingDate: migrationBatches.openingDate, createdAt: migrationBatches.createdAt }).from(migrationBatches).where(and(ne(migrationBatches.status, "committed"), ne(migrationBatches.status, "cancelled"))).orderBy(desc(migrationBatches.createdAt)).limit(20);
      const summaries: MigrationBatchListItem[] = [];
      for (const batch of batches) {
        const [sourceRowCount] = await db.select({ count: sql<number>`count(*)` }).from(migrationSourceRows).where(eq(migrationSourceRows.batchId, batch.id));
        const issueRows = await db.select({ severity: migrationExceptions.severity, resolutionStatus: migrationExceptions.resolutionStatus }).from(migrationExceptions).where(eq(migrationExceptions.batchId, batch.id));
        summaries.push({
          ...batch,
          createdAt: batch.createdAt.toISOString(),
          sourceRows: Number(sourceRowCount?.count ?? 0),
          blockingIssues: issueRows.filter((issue) => issue.severity === "blocking" && issue.resolutionStatus === "open").length,
          warningIssues: issueRows.filter((issue) => issue.severity === "warning").length,
        });
      }
      return { ok: true as const, batches: summaries };
    });

    if (result.kind === "unauthenticated") return { ok: false, error: "Your session is no longer authenticated." };
    return result.value;
  } catch (error) {
    console.error("[data-migration] listing previous stages failed", error);
    return { ok: false, error: "Previous migration stages are temporarily unavailable." };
  }
}

export async function cancelMigrationBatch(batchId: string): Promise<{ ok: true; batchId: string } | { ok: false; error: string }> {
  const access = await canManageMigration();
  if (!access) return { ok: false, error: "You do not have permission to cancel migration stages." };

  const result = await withRlsTransaction(defaultRlsDeps, async (tx) => {
    const db = tx.db as typeof defaultDb;
    const [batch] = await db.select({ id: migrationBatches.id, status: migrationBatches.status }).from(migrationBatches).where(eq(migrationBatches.id, batchId)).limit(1);
    if (!batch) return { ok: false as const, error: "Migration batch not found." };
    if (batch.status === "committed") return { ok: false as const, error: "A committed migration cannot be cancelled." };
    if (batch.status === "cancelled") return { ok: true as const, batchId };
    await db.update(migrationBatches).set({ status: "cancelled", updatedAt: new Date() }).where(and(eq(migrationBatches.id, batchId), ne(migrationBatches.status, "committed")));
    return { ok: true as const, batchId };
  });

  if (result.kind === "unauthenticated") return { ok: false, error: "Your session is no longer authenticated." };
  if (result.value.ok) revalidatePath("/migration");
  return result.value;
}

export async function resolveMigrationException(exceptionId: string, resolutionCategory: string, resolutionNote: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const access = await canManageMigration();
  if (!access) return { ok: false, error: "You do not have permission to resolve migration exceptions." };
  const category = resolutionCategory.trim();
  if (!isMigrationResolutionCategory(category)) return { ok: false, error: "Choose a resolution category before resolving this exception." };
  const note = resolutionNote.trim();
  if (category === "other" && !note) return { ok: false, error: "Add a short note when using the Other category." };

  const result = await withRlsTransaction(defaultRlsDeps, async (tx, session) => {
    const db = tx.db as typeof defaultDb;
    const [exception] = await db.select({ id: migrationExceptions.id, batchId: migrationExceptions.batchId, severity: migrationExceptions.severity, resolutionStatus: migrationExceptions.resolutionStatus }).from(migrationExceptions).where(eq(migrationExceptions.id, exceptionId)).limit(1);
    if (!exception) return { ok: false as const, error: "Migration exception not found." };
    if (exception.severity === "blocking") return { ok: false as const, error: "This is a blocking error. Fix the workbook and upload it again; it cannot be approved here." };
    if (exception.resolutionStatus !== "open") return { ok: false as const, error: "This migration issue has already been resolved." };
    await db.update(migrationExceptions).set({ resolutionStatus: "resolved", resolutionCategory: category as MigrationResolutionCategory, resolutionNote: note || null, resolvedByUserId: session.userId, resolvedAt: new Date() }).where(eq(migrationExceptions.id, exceptionId));
    const openBlocking = await db.select({ id: migrationExceptions.id }).from(migrationExceptions).where(and(eq(migrationExceptions.batchId, exception.batchId), eq(migrationExceptions.severity, "blocking"), eq(migrationExceptions.resolutionStatus, "open"))).limit(1);
    if (openBlocking.length === 0) await db.update(migrationBatches).set({ status: "staged", updatedAt: new Date() }).where(and(eq(migrationBatches.id, exception.batchId), eq(migrationBatches.status, "needs_review")));
    return { ok: true as const };
  });

  if (result.kind === "unauthenticated") return { ok: false, error: "Your session is no longer authenticated." };
  return result.value;
}

export async function approveUbotMigration(batchId: string): Promise<{ ok: true; batchId: string } | { ok: false; error: string }> {
  const access = await canManageMigration();
  if (!access) return { ok: false, error: "You do not have permission to approve a data migration." };

  const result = await withRlsTransaction(defaultRlsDeps, async (tx, session) => {
    const db = tx.db as typeof defaultDb;
    const [batch] = await db.select({ id: migrationBatches.id, status: migrationBatches.status }).from(migrationBatches).where(eq(migrationBatches.id, batchId)).limit(1);
    if (!batch) return { ok: false as const, error: "Migration batch not found." };
    if (batch.status === "approved" || batch.status === "committed") return { ok: true as const, batchId };
    if (batch.status !== "staged") return { ok: false as const, error: "Resolve all blocking migration exceptions before approval." };
    const openBlocking = await db.select({ id: migrationExceptions.id }).from(migrationExceptions).where(and(eq(migrationExceptions.batchId, batchId), eq(migrationExceptions.severity, "blocking"), eq(migrationExceptions.resolutionStatus, "open"))).limit(1);
    if (openBlocking.length > 0) return { ok: false as const, error: "Resolve all blocking migration exceptions before approval." };
    await db.update(migrationBatches).set({ status: "approved", approvedByUserId: session.userId, updatedAt: new Date() }).where(and(eq(migrationBatches.id, batchId), eq(migrationBatches.status, "staged")));
    return { ok: true as const, batchId };
  });

  if (result.kind === "unauthenticated") return { ok: false, error: "Your session is no longer authenticated." };
  return result.value;
}

function rowsByPhase<T>(rows: Array<{ phase: string; normalizedData: unknown }>, phase: string): T[] {
  return rows.filter((row) => row.phase === phase).map((row) => row.normalizedData as T);
}

export async function commitUbotMigration(batchId: string): Promise<{ ok: true; committedRows: number; batchId: string } | { ok: false; error: string }> {
  try {
    const access = await canManageMigration();
    if (!access) return { ok: false, error: "You do not have permission to commit a data migration." };
    if (!access.canManageRates) return { ok: false, error: "Your administrator account is missing VMI rate-card permission. Ask an administrator to apply the billing permissions before committing this migration." };

  const result = await withRlsTransaction(defaultRlsDeps, async (tx, session) => {
    const db = tx.db as typeof defaultDb;
    const [batch] = await db.select().from(migrationBatches).where(eq(migrationBatches.id, batchId)).limit(1);
    if (!batch) return { ok: false as const, error: "Migration batch not found." };
    if (batch.status === "committed") return { ok: true as const, committedRows: 0, batchId };
    if (batch.status !== "approved") return { ok: false as const, error: "Approve the staged migration report before committing." };

    const openExceptions = await db.select({ id: migrationExceptions.id }).from(migrationExceptions).where(and(eq(migrationExceptions.batchId, batchId), eq(migrationExceptions.resolutionStatus, "open"), eq(migrationExceptions.severity, "blocking"))).limit(1);
    if (openExceptions.length > 0) return { ok: false as const, error: "Resolve all blocking migration exceptions before committing." };

    const rows = await db.select({ phase: migrationSourceRows.phase, normalizedData: migrationSourceRows.normalizedData }).from(migrationSourceRows).where(eq(migrationSourceRows.batchId, batchId));
    const draftParties = rowsByPhase<UbotMigrationDraft["parties"][number]>(rows, "parties");
    const draftItems = rowsByPhase<UbotMigrationDraft["items"][number]>(rows, "items");
    const draftLocations = rowsByPhase<UbotMigrationDraft["locations"][number]>(rows, "locations");
    const draftBalances = rowsByPhase<UbotMigrationDraft["openingBalances"][number]>(rows, "opening_balances");
    const draftRates = rowsByPhase<UbotMigrationDraft["rates"][number]>(rows, "rates");

    // Older staged batches were created before the synthetic RCV location was
    // persisted in source rows. Preserve those batches without requiring a
    // re-upload: if opening stock references RCV, add the canonical receiving
    // bay to the commit-time map.
    if (draftBalances.some((balance) => balance.locationLabel === "RCV") && !draftLocations.some((location) => location.label === "RCV")) {
      draftLocations.push({ sourceRow: 0, label: "RCV", zone: "RCV", rack: "RCV", level: "0", position: "0", locationType: "receiving_bay" });
    }

    const partyIds = new Map<string, string>();
    for (const party of draftParties) {
      const existing = await db.select({ id: parties.id }).from(parties).where(eq(parties.name, party.name)).limit(1);
      const partyId = existing[0]?.id ?? randomUUID();
      if (!existing[0]) await db.insert(parties).values({ id: partyId, code: `MIG-${party.name.replace(/[^A-Z0-9]+/gi, "-").slice(0, 40).toUpperCase()}`, name: party.name, address1: party.address1, address2: party.address2, paymentTerms: party.paymentTerms, isActive: party.active });
      partyIds.set(party.name, partyId);
      const role = ubotPartyRole(party.name) === "customer" ? "customer" : party.role;

      // UBoT was previously imported as a Supplier. Reconcile that incorrect
      // role when an existing/staged migration is committed so VMI defaults
      // to Customer and the WRR selector does not retain a stale Supplier role.
      if (role === "customer") {
        await db.delete(partyRoles).where(
          and(
            eq(partyRoles.partyId, partyId),
            sql`${partyRoles.role}::text IN ('supplier', 'vendor')`,
          ),
        );
      }

      const existingRole = await db.select({ id: partyRoles.id }).from(partyRoles).where(and(eq(partyRoles.partyId, partyId), eq(partyRoles.role, role))).limit(1);
      if (!existingRole[0]) await db.insert(partyRoles).values({ partyId, role });
    }

    const rateGroups = new Map<string, UbotMigrationDraft["rates"]>();
    for (const rate of selectEffectiveUbotRates(draftRates, String(batch.openingDate))) {
      const group = rateGroups.get(rate.partyName) ?? [];
      group.push(rate);
      rateGroups.set(rate.partyName, group);
    }
    for (const [partyName, partyRates] of rateGroups) {
      const partyId = partyIds.get(partyName);
      if (!partyId) throw new Error(`Migration rate party mapping disappeared for ${partyName}.`);
      const currency = partyRates[0]?.currency || "USD";
      if (!/^[A-Z]{3}$/.test(currency)) throw new Error(`Migration rates for ${partyName} use invalid currency '${currency}'.`);
      if (partyRates.some((rate) => rate.currency && rate.currency !== currency)) throw new Error(`Migration rates for ${partyName} use multiple currencies.`);
      const valueFor = (pattern: RegExp, fallback: string) => String(partyRates.find((rate) => pattern.test(rate.chargeType))?.rate ?? fallback);
      const handlingFallback = valueFor(/handling/i, "0");
      const existingContract = await db.select({ id: vmiContractTerms.id }).from(vmiContractTerms).where(eq(vmiContractTerms.partyId, partyId)).limit(1);
      if (existingContract.length > 0) throw new Error(`VMI contract terms already exist for ${partyName}; resolve the existing rate card before committing.`);
      const earliestEffectiveFrom = partyRates.map((rate) => rate.effectiveFrom).filter((value): value is string => Boolean(value)).sort()[0];
      await db.insert(vmiContractTerms).values({
        partyId,
        storageRatePerCbmDay: valueFor(/warehousing|storage/i, "0"),
        billingTiming: "beginning_of_day",
        cbmThresholdType: "none",
        handlingInRatePerCbm: valueFor(/handling\s*(in|inbound)/i, handlingFallback),
        handlingOutRatePerCbm: valueFor(/handling\s*(out|outbound)/i, handlingFallback),
        documentationDefaultRateUsd: valueFor(/documentation/i, "0"),
        billingCurrency: currency,
        isActive: true,
        effectiveFrom: earliestEffectiveFrom ? new Date(`${earliestEffectiveFrom}T00:00:00.000Z`) : new Date(batch.openingDate),
        createdByUserId: session.userId,
      });

      for (const rate of partyRates) {
        const chargeType = rate.chargeType.toLowerCase();
        if (/warehousing|storage|documentation|handling/.test(chargeType)) continue;
        if (/man\s*power|manpower/.test(chargeType)) {
          await db.insert(vmiRecurringFeeLines).values({
            partyId,
            feeType: "manpower",
            label: rateLabel(rate),
            manpowerRatePerHour: rate.rate.toFixed(2),
            manpowerCurrency: rate.currency,
            isActive: true,
          });
          continue;
        }
        if (/admin\s*fee/.test(chargeType)) {
          if (rate.currency !== "USD") throw new Error(`The Admin Fee for ${partyName} is recorded in ${rate.currency}; the recurring fee table requires USD.`);
          await db.insert(vmiRecurringFeeLines).values({
            partyId,
            feeType: "trucking_admin_fee",
            label: rateLabel(rate),
            flatAmountUsd: rate.rate.toFixed(4),
            isActive: true,
          });
          continue;
        }
        if (/insurance/.test(chargeType)) {
          if (rate.currency !== "USD") throw new Error(`The Insurance rate for ${partyName} is recorded in ${rate.currency}; the recurring fee table requires USD.`);
          await db.insert(vmiRecurringFeeLines).values({
            partyId,
            feeType: "other",
            label: rateLabel(rate),
            flatAmountUsd: rate.rate.toFixed(4),
            isActive: true,
          });
          continue;
        }
        throw new Error(`The opening-date rate '${rate.chargeType}' for ${partyName} has no safe canonical billing mapping.`);
      }
    }

    const itemIds = new Map<string, string>();
    for (const item of draftItems) {
      if (item.code.length > 100) throw new Error(`Item code ${item.code.slice(0, 40)}… exceeds the 100-character canonical limit.`);
      const existing = await db.select({ id: items.id }).from(items).where(eq(items.code, item.code)).limit(1);
      const itemId = existing[0]?.id ?? randomUUID();
      if (!existing[0]) await db.insert(items).values({ id: itemId, code: item.code, name: item.name, barcode: item.code, itemType: "standard", uom: "piece", currency: "USD", spq: Math.max(1, Math.round(item.spq ?? 1)), spqMeter: item.spqMeter?.toFixed(2), lengthCm: item.lengthCm?.toFixed(2), widthCm: item.widthCm?.toFixed(2), heightCm: item.heightCm?.toFixed(2), volumeCm3: item.volumeCm3?.toFixed(2), volumeCbm: migrationVolumeCbm(item.volumeCbm), boxesPerPallet: item.boxesPerPallet ? Math.round(item.boxesPerPallet) : null, isActive: true });
      itemIds.set(item.code, itemId);
    }

    const locationIds = new Map<string, string>();
    for (const location of draftLocations) {
      const existing = await db.select({ id: locations.id }).from(locations).where(eq(locations.label, location.label)).limit(1);
      const locationId = existing[0]?.id ?? randomUUID();
      if (!existing[0]) await db.insert(locations).values({ id: locationId, zone: location.zone, rack: location.rack, level: location.level, position: location.position, label: location.label, locationType: location.locationType, maxCbmCapacity: (location.maxCbmCapacity ?? 9999.9999).toFixed(4), isActive: true });
      locationIds.set(location.label, locationId);
    }

    let committedRows = 0;
    for (const [index, balance] of draftBalances.entries()) {
      const itemId = itemIds.get(balance.itemCode);
      const locationId = locationIds.get(balance.locationLabel);
      const ownerPartyId = partyIds.get(balance.ownerPartyName);
      if (!itemId || !locationId || !ownerPartyId) throw new Error(`Migration mapping disappeared for ${balance.itemCode}/${balance.lotNumber}.`);
      const lotId = randomUUID();
      const cartonCount = Number.isInteger(balance.boxes) && (balance.boxes ?? 0) > 0 ? balance.boxes! : null;
      await db.insert(lots).values({ id: lotId, lotNumber: balance.lotNumber, itemId, flowType: "vmi", ownerPartyId, migrationBatchId: batchId, status: "available", cartonTraceStatus: cartonCount ? "active" : "pending" });
      await db.insert(lotLocationBalances).values({ lotId, locationId, qtyReceived: balance.quantity, qtyRemaining: balance.quantity, qtyCommitted: 0, version: 1 });
      await db.insert(inventoryTransactions).values({ transactionNumber: `MIG-${batchId.slice(0, 8)}-${String(index + 1).padStart(5, "0")}`, lotId, itemId, movementType: "inventory_reconciliation", toLocationId: locationId, qty: balance.quantity, flowType: "vmi", performedByUserId: session.userId });
      if (cartonCount) {
        await db.insert(inventoryUnits).values(Array.from({ length: cartonCount }, (_, unitOffset) => {
          const unitId = randomUUID();
          return {
            unitId,
            cartonId: cartonIdFromUnitId(unitId),
            unitIndex: unitOffset + 1,
            wrrItemId: null,
            migrationBatchId: batchId,
            lotId,
            locationId,
            status: "available" as const,
          };
        }));
      }
      committedRows += 1;
    }
    await db.update(migrationBatches).set({ status: "committed", approvedByUserId: session.userId, committedAt: new Date(), updatedAt: new Date() }).where(eq(migrationBatches.id, batchId));
    return { ok: true as const, committedRows, batchId };
  });

    if (result.kind === "unauthenticated") return { ok: false, error: "Your session is no longer authenticated." };
    if (!result.value.ok) return result.value;
    revalidatePath("/inventory");
    revalidatePath("/enrollment");
    return result.value;
  } catch (error) {
    // withRlsTransaction rolls back every canonical write before this result
    // is returned. Keep the failure inside the migration workflow so a DB
    // constraint or mapping error cannot replace the authenticated workspace.
    console.error("[data-migration] commit failed", error);
    return { ok: false, error: `The migration could not be committed: ${errorMessage(error)}` };
  }
}

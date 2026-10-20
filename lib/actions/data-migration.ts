"use server";

import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
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
import { vmiContractTerms } from "@/lib/db/schema/vmi_billing";
import { migrationBatches, migrationExceptions, migrationSourceRows } from "@/lib/db/schema/migrations";
import { parseUbotVmiWorkbook } from "@/lib/migration/ubot-vmi-adapter";
import type { UbotMigrationDraft } from "@/lib/migration/types";

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

export type MigrationExceptionSummary = { id: string; severity: string; code: string; message: string; resolutionStatus: string; resolutionNote: string | null };

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
    const exceptions = await db.select({ id: migrationExceptions.id, severity: migrationExceptions.severity, code: migrationExceptions.code, message: migrationExceptions.message, resolutionStatus: migrationExceptions.resolutionStatus, resolutionNote: migrationExceptions.resolutionNote }).from(migrationExceptions).where(eq(migrationExceptions.batchId, batchId));
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
      const batches = await db.select({ id: migrationBatches.id, status: migrationBatches.status, sourceFileName: migrationBatches.sourceFileName, openingDate: migrationBatches.openingDate, createdAt: migrationBatches.createdAt }).from(migrationBatches).orderBy(desc(migrationBatches.createdAt)).limit(20);
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

export async function resolveMigrationException(exceptionId: string, resolutionNote: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const access = await canManageMigration();
  if (!access) return { ok: false, error: "You do not have permission to resolve migration exceptions." };
  const note = resolutionNote.trim();
  if (!note) return { ok: false, error: "Add a short resolution note before resolving this exception." };

  const result = await withRlsTransaction(defaultRlsDeps, async (tx, session) => {
    const db = tx.db as typeof defaultDb;
    const [exception] = await db.select({ id: migrationExceptions.id, batchId: migrationExceptions.batchId }).from(migrationExceptions).where(eq(migrationExceptions.id, exceptionId)).limit(1);
    if (!exception) return { ok: false as const, error: "Migration exception not found." };
    await db.update(migrationExceptions).set({ resolutionStatus: "resolved", resolutionNote: note, resolvedByUserId: session.userId, resolvedAt: new Date() }).where(eq(migrationExceptions.id, exceptionId));
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

    const partyIds = new Map<string, string>();
    for (const party of draftParties) {
      const existing = await db.select({ id: parties.id }).from(parties).where(eq(parties.name, party.name)).limit(1);
      const partyId = existing[0]?.id ?? randomUUID();
      if (!existing[0]) await db.insert(parties).values({ id: partyId, code: `MIG-${party.name.replace(/[^A-Z0-9]+/gi, "-").slice(0, 40).toUpperCase()}`, name: party.name, address1: party.address1, address2: party.address2, paymentTerms: party.paymentTerms, isActive: party.active });
      partyIds.set(party.name, partyId);
      const existingRole = await db.select({ id: partyRoles.id }).from(partyRoles).where(and(eq(partyRoles.partyId, partyId), eq(partyRoles.role, party.role))).limit(1);
      if (!existingRole[0]) await db.insert(partyRoles).values({ partyId, role: party.role });
    }

    const rateGroups = new Map<string, UbotMigrationDraft["rates"]>();
    for (const rate of draftRates) {
      if (!rate.active) continue;
      const group = rateGroups.get(rate.partyName) ?? [];
      group.push(rate);
      rateGroups.set(rate.partyName, group);
    }
    for (const [partyName, partyRates] of rateGroups) {
      const partyId = partyIds.get(partyName);
      if (!partyId) throw new Error(`Migration rate party mapping disappeared for ${partyName}.`);
      const unsupported = partyRates.find((rate) => !/warehousing|storage|handling\s*(in|inbound|out|outbound)|documentation/i.test(rate.chargeType));
      if (unsupported) throw new Error(`Unsupported migration rate charge type: ${unsupported.chargeType}.`);
      const currency = partyRates[0]?.currency || "USD";
      if (partyRates.some((rate) => rate.currency && rate.currency !== currency)) throw new Error(`Migration rates for ${partyName} use multiple currencies.`);
      const valueFor = (pattern: RegExp, fallback: string) => String(partyRates.find((rate) => pattern.test(rate.chargeType))?.rate ?? fallback);
      const existingContract = await db.select({ id: vmiContractTerms.id }).from(vmiContractTerms).where(eq(vmiContractTerms.partyId, partyId)).limit(1);
      if (existingContract.length > 0) throw new Error(`VMI contract terms already exist for ${partyName}; resolve the existing rate card before committing.`);
      const earliestEffectiveFrom = partyRates.map((rate) => rate.effectiveFrom).filter((value): value is string => Boolean(value)).sort()[0];
      await db.insert(vmiContractTerms).values({
        partyId,
        storageRatePerCbmDay: valueFor(/warehousing|storage/i, "0"),
        billingTiming: "beginning_of_day",
        cbmThresholdType: "none",
        handlingInRatePerCbm: valueFor(/handling\s*(in|inbound)/i, "0"),
        handlingOutRatePerCbm: valueFor(/handling\s*(out|outbound)/i, "0"),
        documentationDefaultRateUsd: valueFor(/documentation/i, "0"),
        billingCurrency: currency,
        isActive: true,
        effectiveFrom: earliestEffectiveFrom ? new Date(`${earliestEffectiveFrom}T00:00:00.000Z`) : new Date(batch.openingDate),
        createdByUserId: session.userId,
      });
    }

    const itemIds = new Map<string, string>();
    for (const item of draftItems) {
      if (item.code.length > 100) throw new Error(`Item code ${item.code.slice(0, 40)}… exceeds the 100-character canonical limit.`);
      const existing = await db.select({ id: items.id }).from(items).where(eq(items.code, item.code)).limit(1);
      const itemId = existing[0]?.id ?? randomUUID();
      if (!existing[0]) await db.insert(items).values({ id: itemId, code: item.code, name: item.name, barcode: item.code, itemType: "standard", uom: "piece", currency: "USD", spq: Math.max(1, Math.round(item.spq ?? 1)), spqMeter: item.spqMeter?.toFixed(2), lengthCm: item.lengthCm?.toFixed(2), widthCm: item.widthCm?.toFixed(2), heightCm: item.heightCm?.toFixed(2), volumeCm3: item.volumeCm3?.toFixed(2), volumeCbm: (item.volumeCbm ?? 0.0001).toFixed(4), boxesPerPallet: item.boxesPerPallet ? Math.round(item.boxesPerPallet) : null, isActive: true });
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
      await db.insert(lots).values({ id: lotId, lotNumber: balance.lotNumber, itemId, flowType: "vmi", ownerPartyId, migrationBatchId: batchId, status: "available" });
      await db.insert(lotLocationBalances).values({ lotId, locationId, qtyReceived: balance.quantity, qtyRemaining: balance.quantity, qtyCommitted: 0, version: 1 });
      await db.insert(inventoryTransactions).values({ transactionNumber: `MIG-${batchId.slice(0, 8)}-${String(index + 1).padStart(5, "0")}`, lotId, itemId, movementType: "inventory_reconciliation", toLocationId: locationId, qty: balance.quantity, flowType: "vmi", performedByUserId: session.userId });
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
}

"use server";

import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
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
import { migrationBatches, migrationExceptions, migrationSourceRows } from "@/lib/db/schema/migrations";
import { parseUbotVmiWorkbook } from "@/lib/migration/ubot-vmi-adapter";
import type { UbotMigrationDraft } from "@/lib/migration/types";

const defaultRlsDeps = { getAuthenticatedSession, pool: rlsPool };
const SOURCE_BUCKET = "migration-source-files";

type MigrationResult =
  | { ok: true; batchId: string; status: string; blockingIssues: number; warningIssues: number; sourceRows: number }
  | { ok: false; error: string };

export type MigrationExceptionSummary = { id: string; severity: string; code: string; message: string; resolutionStatus: string; resolutionNote: string | null };

export type MigrationSummaryResult =
  | {
      ok: true;
      batch: { id: string; status: string; sourceFileName: string; openingDate: string };
      exceptions: MigrationExceptionSummary[];
    }
  | { ok: false; error: string };

async function canManageMigration() {
  const resolver = await createPageResolver();
  const [partiesPermission, itemsPermission, locationsPermission] = await Promise.all([
    requirePermission(resolver, "parties.manage"),
    requirePermission(resolver, "items.manage"),
    requirePermission(resolver, "locations.manage"),
  ]);
  if ([partiesPermission, itemsPermission, locationsPermission].some((result) => result.kind !== "authorized")) return null;
  return { resolver, userId: partiesPermission.kind === "authorized" ? partiesPermission.context.userId : "" };
}

function sourceRows(draft: UbotMigrationDraft) {
  return [
    ...draft.parties.map((value) => ({ sheetName: "Customers", sourceRowNumber: value.sourceRow, rowKey: value.name, phase: "parties", value })),
    ...draft.items.map((value) => ({ sheetName: "CODES", sourceRowNumber: value.sourceRow, rowKey: value.code, phase: "items", value })),
    ...draft.locations.map((value) => ({ sheetName: "Location Matrix", sourceRowNumber: value.sourceRow, rowKey: value.label, phase: "locations", value })),
    ...draft.openingBalances.map((value) => ({ sheetName: "Location Matrix", sourceRowNumber: value.sourceRow, rowKey: `${value.itemCode}/${value.lotNumber}/${value.locationLabel}`, phase: "opening_balances", value })),
    ...draft.rates.map((value) => ({ sheetName: "Rates", sourceRowNumber: value.sourceRow, rowKey: `${value.partyName}/${value.chargeType}/${value.rate}`, phase: "rates", value })),
  ];
}

export async function stageUbotMigration(formData: FormData): Promise<MigrationResult> {
  const access = await canManageMigration();
  if (!access) return { ok: false, error: "You do not have permission to stage a data migration." };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Select the UBoT Excel workbook first." };
  if (!file.name.toLowerCase().endsWith(".xlsx")) return { ok: false, error: "The UBoT migration currently accepts .xlsx workbooks." };

  const buffer = Buffer.from(await file.arrayBuffer());
  const openingDate = String(formData.get("openingDate") || "2026-10-09");
  const draft = parseUbotVmiWorkbook(buffer, openingDate);
  const blockingIssues = draft.issues.filter((issue) => issue.severity === "blocking").length;
  const warningIssues = draft.issues.filter((issue) => issue.severity === "warning").length;
  const batchId = randomUUID();
  const hash = createHash("sha256").update(buffer).digest("hex");
  const sourcePath = `${draft.profileKey}/${batchId}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  const supabase = await createClient();
  const upload = await supabase.storage.from(SOURCE_BUCKET).upload(sourcePath, buffer, { contentType: file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", upsert: false });
  if (upload.error) return { ok: false, error: `The workbook could not be retained: ${upload.error.message}` };

  const result = await withRlsTransaction(defaultRlsDeps, async (tx, session) => {
    const db = tx.db as typeof defaultDb;
    const duplicate = await db.select({ id: migrationBatches.id }).from(migrationBatches).where(and(eq(migrationBatches.sourceFileHash, hash), eq(migrationBatches.profileKey, draft.profileKey))).limit(1);
    if (duplicate.length > 0) return { ok: false as const, error: "This workbook has already been staged for this adapter profile." };

    await db.insert(migrationBatches).values({ id: batchId, organizationName: draft.organizationName, flowType: draft.flowType, profileKey: draft.profileKey, openingDate: draft.openingDate, sourceFileName: file.name, sourceFileHash: hash, sourceFileUrl: sourcePath, status: blockingIssues > 0 ? "needs_review" : "staged", uploadedByUserId: session.userId });
    const rows = sourceRows(draft);
    if (rows.length > 0) await db.insert(migrationSourceRows).values(rows.map((row) => ({ batchId, sheetName: row.sheetName, sourceRowNumber: row.sourceRowNumber, rowKey: row.rowKey, phase: row.phase, rawData: row.value, normalizedData: row.value, validationErrors: null })));
    if (draft.issues.length > 0) await db.insert(migrationExceptions).values(draft.issues.map((issue) => ({ batchId, severity: issue.severity, code: issue.code, message: `${issue.message}${issue.sheet ? ` (${issue.sheet}${issue.row ? ` row ${issue.row}` : ""})` : ""}`, resolutionStatus: "open" })));
    return { ok: true as const, batchId, status: blockingIssues > 0 ? "needs_review" : "staged", blockingIssues, warningIssues, sourceRows: rows.length };
  });

  if (result.kind === "unauthenticated") return { ok: false, error: "Your session is no longer authenticated." };
  if (!result.value.ok) return result.value;
  return result.value;
}

export async function getMigrationSummary(batchId: string): Promise<MigrationSummaryResult> {
  const access = await canManageMigration();
  if (!access) return { ok: false, error: "You do not have permission to view migration review details." };

  const result = await withRlsTransaction(defaultRlsDeps, async (tx) => {
    const db = tx.db as typeof defaultDb;
    const [batch] = await db.select({ id: migrationBatches.id, status: migrationBatches.status, sourceFileName: migrationBatches.sourceFileName, openingDate: migrationBatches.openingDate }).from(migrationBatches).where(eq(migrationBatches.id, batchId)).limit(1);
    if (!batch) return { ok: false as const, error: "Migration batch not found." };
    const exceptions = await db.select({ id: migrationExceptions.id, severity: migrationExceptions.severity, code: migrationExceptions.code, message: migrationExceptions.message, resolutionStatus: migrationExceptions.resolutionStatus, resolutionNote: migrationExceptions.resolutionNote }).from(migrationExceptions).where(eq(migrationExceptions.batchId, batchId));
    return { ok: true as const, batch, exceptions };
  });

  if (result.kind === "unauthenticated") return { ok: false, error: "Your session is no longer authenticated." };
  return result.value;
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

function rowsByPhase<T>(rows: Array<{ phase: string; normalizedData: unknown }>, phase: string): T[] {
  return rows.filter((row) => row.phase === phase).map((row) => row.normalizedData as T);
}

export async function commitUbotMigration(batchId: string): Promise<{ ok: true; committedRows: number; batchId: string } | { ok: false; error: string }> {
  const access = await canManageMigration();
  if (!access) return { ok: false, error: "You do not have permission to commit a data migration." };

  const result = await withRlsTransaction(defaultRlsDeps, async (tx, session) => {
    const db = tx.db as typeof defaultDb;
    const [batch] = await db.select().from(migrationBatches).where(eq(migrationBatches.id, batchId)).limit(1);
    if (!batch) return { ok: false as const, error: "Migration batch not found." };
    if (batch.status === "committed") return { ok: true as const, committedRows: 0, batchId };
    if (batch.status === "needs_review") return { ok: false as const, error: "Resolve all blocking migration exceptions before committing." };

    const openExceptions = await db.select({ id: migrationExceptions.id }).from(migrationExceptions).where(and(eq(migrationExceptions.batchId, batchId), eq(migrationExceptions.resolutionStatus, "open"), eq(migrationExceptions.severity, "blocking"))).limit(1);
    if (openExceptions.length > 0) return { ok: false as const, error: "Resolve all blocking migration exceptions before committing." };

    const rows = await db.select({ phase: migrationSourceRows.phase, normalizedData: migrationSourceRows.normalizedData }).from(migrationSourceRows).where(eq(migrationSourceRows.batchId, batchId));
    const draftParties = rowsByPhase<UbotMigrationDraft["parties"][number]>(rows, "parties");
    const draftItems = rowsByPhase<UbotMigrationDraft["items"][number]>(rows, "items");
    const draftLocations = rowsByPhase<UbotMigrationDraft["locations"][number]>(rows, "locations");
    const draftBalances = rowsByPhase<UbotMigrationDraft["openingBalances"][number]>(rows, "opening_balances");

    const partyIds = new Map<string, string>();
    for (const party of draftParties) {
      const existing = await db.select({ id: parties.id }).from(parties).where(eq(parties.name, party.name)).limit(1);
      const partyId = existing[0]?.id ?? randomUUID();
      if (!existing[0]) await db.insert(parties).values({ id: partyId, code: `MIG-${party.name.replace(/[^A-Z0-9]+/gi, "-").slice(0, 40).toUpperCase()}`, name: party.name, address1: party.address1, address2: party.address2, paymentTerms: party.paymentTerms, isActive: party.active });
      partyIds.set(party.name, partyId);
      const existingRole = await db.select({ id: partyRoles.id }).from(partyRoles).where(and(eq(partyRoles.partyId, partyId), eq(partyRoles.role, party.role))).limit(1);
      if (!existingRole[0]) await db.insert(partyRoles).values({ partyId, role: party.role });
    }

    const itemIds = new Map<string, string>();
    for (const item of draftItems) {
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

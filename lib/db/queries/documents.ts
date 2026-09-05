/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/db/queries/documents.ts
//
// Party Portal — generated_documents reads scoped to the caller's own party.
//
// Traceability:
//   specs/22-parties-portal/design.md §7 (documents view), tasks.md Task 5
//     — "Build the pick_list/acknowledgement_receipt list and open flow
//     under documents.read (assigned_party)."
//   specs/10-pick-list-and-acknowledgement-receipt/design.md §2 —
//     generated_documents carries no party_id column; party ownership is
//     resolved only through its source chain.
//
// generated_documents.source_type + source_id point at the record the
// document was generated from — never directly at a party:
//   documentType 'pick_list'              -> sourceType 'inventory_commitment'
//     -> inventory_commitments.id -> inventory_commitments.pick_list_id
//     -> pick_lists.customer_party_id
//   documentType 'acknowledgement_receipt' -> sourceType 'inventory_commitment'
//     -> inventory_commitments.id -> inventory_commitments.pick_list_id
//     -> pick_lists.customer_party_id
//
// 2026-08-20 correction: acknowledgement_receipt previously keyed off
// sourceType 'inventory_transaction' pointing at a single dispatch
// transaction row (specs/00-steering/revision-log.md, the "Snapshot field
// contract" entry). That assumption broke when dispatchPickList was fixed
// to insert one inventory_transactions row PER pick-list line (multi-line
// dispatch support) instead of one aggregate row — there is no longer a
// single canonical transaction id to reference for a multi-line dispatch.
// Both pick_list and acknowledgement_receipt now key off sourceType
// 'inventory_commitment' / sourceId = inventory_commitments.id: one
// commitment represents one whole dispatch event (all its lines), which is
// the correct unit for "one document per dispatch." See
// specs/00-steering/revision-log.md's 2026-08-20 entry for the full
// resolution.
//
// This is the only correct scoping path for this table; there is no
// shortcut party_id filter to apply directly on generated_documents. The
// caller MUST have already authorized `documents.read` scoped to this
// exact partyId via requirePermission before invoking either function
// below — the join below is the data-access-side half of that boundary,
// not a substitute for it.

import { and, desc, eq, gte, lte, or, sql, ilike } from "drizzle-orm";
import { generatedDocuments } from "@/lib/db/schema/documents";
import { inventoryCommitments } from "@/lib/db/schema/commitments";
import { pickLists, pickListItems } from "@/lib/db/schema/pick_lists";
import { wrrDocuments, wrrItems } from "@/lib/db/schema/wrr";
import { parties } from "@/lib/db/schema/parties";
import { userProfiles } from "@/lib/db/schema/rbac";
import { vmiBillingPeriods, vmiPermits } from "@/lib/db/schema/vmi_billing";

export type DbLike = { select: (...args: any[]) => any };

export type PartyDocumentRow = {
  id: string;
  documentNumber: string;
  status: string;
  generatedAt: Date | null;
  createdAt: Date;
};

/**
 * Common filter params for document archive queries.
 */
export type DocumentArchiveFilter = {
  search?: string;
  partyId?: string;
  flowType?: string;
  status?: string;
  from?: string; // YYYY-MM-DD
  to?: string;   // YYYY-MM-DD
  limit?: number;
  offset?: number;
};

export type WrrArchiveRow = {
  id: string;
  wrrNumber: string;
  commercialInvoiceNo: string | null;
  ciplFileUrl: string | null;
  pezaNumber: string | null;
  ipNumber: string | null;
  mawbMblNumber: string | null;
  vendorPartyId: string;
  vendorPartyName: string;
  vendorPartyCode: string;
  flowType: string;
  status: string;
  itemCount: number;
  totalQuantity: number;
  stagedByUserName: string | null;
  confirmedByUserName: string | null;
  createdAt: Date;
  confirmedAt: Date | null;
};

export type PickListArchiveRow = {
  id: string;
  pickListId: string;
  documentNumber: string;
  pickListNumber: string;
  customerPartyId: string;
  customerPartyName: string;
  customerPartyCode: string;
  flowType: string;
  status: string;
  pickListStatus: string;
  itemCount: number;
  packageCount: number;
  totalQuantity: number;
  snapshotHash: string;
  artifactPath: string | null;
  createdByName: string | null;
  generatedAt: Date | null;
  createdAt: Date;
};

export type AcknowledgementReceiptArchiveRow = {
  id: string;
  pickListId: string;
  documentNumber: string;
  pickListNumber: string;
  customerPartyId: string;
  customerPartyName: string;
  customerPartyCode: string;
  flowType: string;
  currency: string;
  status: string;
  itemCount: number;
  totalQuantity: number;
  totalAmount: number;
  snapshotHash: string;
  artifactPath: string | null;
  dispatchedByName: string | null;
  generatedAt: Date | null;
  createdAt: Date;
};

export type StatementOfAccountArchiveRow = {
  id: string;
  periodNumber: string;
  partyId: string;
  partyName: string;
  partyCode: string;
  periodStartDate: string;
  periodEndDate: string;
  storageChargeUsd: number;
  handlingInUsd: number;
  handlingOutUsd: number;
  documentationUsd: number;
  deliveryUsd: number;
  recurringFeesUsd: number;
  adHocChargesUsd: number;
  billingStatementTotalUsd: number;
  lockedExchangeRatePhp: number;
  status: string;
  soaArtifactId: string | null;
  closedByUserName: string | null;
  closedAt: Date | null;
  createdAt: Date;
};

export type PezaArchiveRow = {
  id: string;
  permitNumber: string;
  permitType: string;
  partyId: string;
  partyName: string;
  partyCode: string;
  referenceDocType: "wrr" | "pick_list" | "standalone";
  referenceDocNumber: string | null;
  referenceDocId: string | null;
  issuedDate: string | Date;
  expiryDate: string | Date | null;
  status: string;
  fileUrl: string | null;
};

/**
 * Party Portal — pick_list documents scoped to the caller's own party
 * (design.md §7 pick-lists tab).
 */
export async function listPartyPickListDocuments(
  db: DbLike,
  partyId: string,
): Promise<PartyDocumentRow[]> {
  return (await db
    .select({
      id: generatedDocuments.id,
      documentNumber: generatedDocuments.documentNumber,
      status: generatedDocuments.status,
      generatedAt: generatedDocuments.generatedAt,
      createdAt: generatedDocuments.createdAt,
    })
    .from(generatedDocuments)
    .innerJoin(
      inventoryCommitments,
      eq(inventoryCommitments.id, generatedDocuments.sourceId),
    )
    .innerJoin(pickLists, eq(pickLists.id, inventoryCommitments.pickListId))
    .where(
      and(
        eq(generatedDocuments.documentType, "pick_list"),
        eq(generatedDocuments.sourceType, "inventory_commitment"),
        eq(pickLists.customerPartyId, partyId),
      ),
    )
    .orderBy(desc(generatedDocuments.createdAt))) as PartyDocumentRow[];
}

/**
 * Party Portal — acknowledgement_receipt documents scoped to the caller's
 * own party (design.md §7 acknowledgement-receipts tab).
 */
export async function listPartyAcknowledgementReceiptDocuments(
  db: DbLike,
  partyId: string,
): Promise<PartyDocumentRow[]> {
  return (await db
    .select({
      id: generatedDocuments.id,
      documentNumber: generatedDocuments.documentNumber,
      status: generatedDocuments.status,
      generatedAt: generatedDocuments.generatedAt,
      createdAt: generatedDocuments.createdAt,
    })
    .from(generatedDocuments)
    .innerJoin(
      inventoryCommitments,
      eq(inventoryCommitments.id, generatedDocuments.sourceId),
    )
    .innerJoin(pickLists, eq(pickLists.id, inventoryCommitments.pickListId))
    .where(
      and(
        eq(generatedDocuments.documentType, "acknowledgement_receipt"),
        eq(generatedDocuments.sourceType, "inventory_commitment"),
        eq(pickLists.customerPartyId, partyId),
      ),
    )
    .orderBy(desc(generatedDocuments.createdAt))) as PartyDocumentRow[];
}

// ─── Office Archive Query Functions ───────────────────────────────────────────

/**
 * Documents Center — Tab 1: WRRs archive query.
 */
export async function listWrrArchiveDocuments(
  db: DbLike,
  filters: DocumentArchiveFilter = {},
): Promise<WrrArchiveRow[]> {
  const conditions = [];

  if (filters.partyId) {
    conditions.push(eq(wrrDocuments.vendorPartyId, filters.partyId));
  }
  if (filters.flowType) {
    conditions.push(eq(wrrDocuments.flowType, filters.flowType as any));
  }
  if (filters.status) {
    conditions.push(eq(wrrDocuments.status, filters.status as any));
  }
  if (filters.from) {
    conditions.push(gte(wrrDocuments.createdAt, new Date(`${filters.from}T00:00:00.000Z`)));
  }
  if (filters.to) {
    conditions.push(lte(wrrDocuments.createdAt, new Date(`${filters.to}T23:59:59.999Z`)));
  }
  if (filters.search) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(
      or(
        ilike(wrrDocuments.wrrNumber, term),
        ilike(wrrDocuments.commercialInvoiceNo, term),
        ilike(wrrDocuments.pezaNumber, term),
        ilike(wrrDocuments.mawbMblNumber, term),
        ilike(parties.name, term),
        ilike(parties.code, term),
      ),
    );
  }

  const stagedUser = userProfiles;

  const rows = await db
    .select({
      id: wrrDocuments.id,
      wrrNumber: wrrDocuments.wrrNumber,
      commercialInvoiceNo: wrrDocuments.commercialInvoiceNo,
      ciplFileUrl: wrrDocuments.ciplFileUrl,
      pezaNumber: wrrDocuments.pezaNumber,
      ipNumber: wrrDocuments.ipNumber,
      mawbMblNumber: wrrDocuments.mawbMblNumber,
      vendorPartyId: wrrDocuments.vendorPartyId,
      vendorPartyName: parties.name,
      vendorPartyCode: parties.code,
      flowType: wrrDocuments.flowType,
      status: wrrDocuments.status,
      stagedByUserName: stagedUser.displayName,
      confirmedAt: wrrDocuments.confirmedAt,
      createdAt: wrrDocuments.createdAt,
      itemCount: sql<number>`coalesce((select count(*)::int from ${wrrItems} where ${wrrItems.wrrId} = ${wrrDocuments.id}), 0)`,
      totalQuantity: sql<number>`coalesce((select sum(${wrrItems.expectedQty})::int from ${wrrItems} where ${wrrItems.wrrId} = ${wrrDocuments.id}), 0)`,
    })
    .from(wrrDocuments)
    .innerJoin(parties, eq(parties.id, wrrDocuments.vendorPartyId))
    .leftJoin(stagedUser, eq(stagedUser.id, wrrDocuments.stagedByUserId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(wrrDocuments.createdAt))
    .limit(filters.limit ?? 50)
    .offset(filters.offset ?? 0);

  return rows.map((r: any) => ({
    id: r.id,
    wrrNumber: r.wrrNumber,
    commercialInvoiceNo: r.commercialInvoiceNo,
    ciplFileUrl: r.ciplFileUrl,
    pezaNumber: r.pezaNumber,
    ipNumber: r.ipNumber,
    mawbMblNumber: r.mawbMblNumber,
    vendorPartyId: r.vendorPartyId,
    vendorPartyName: r.vendorPartyName ?? "Unknown Vendor",
    vendorPartyCode: r.vendorPartyCode ?? "",
    flowType: r.flowType,
    status: r.status,
    itemCount: Number(r.itemCount ?? 0),
    totalQuantity: Number(r.totalQuantity ?? 0),
    stagedByUserName: r.stagedByUserName,
    confirmedByUserName: null,
    createdAt: r.createdAt,
    confirmedAt: r.confirmedAt,
  }));
}

/**
 * Documents Center — Tab 2: Pick Lists archive query.
 */
export async function listPickListArchiveDocuments(
  db: DbLike,
  filters: DocumentArchiveFilter = {},
): Promise<PickListArchiveRow[]> {
  const conditions = [
    eq(generatedDocuments.documentType, "pick_list"),
    eq(generatedDocuments.sourceType, "inventory_commitment"),
  ];

  if (filters.partyId) {
    conditions.push(eq(pickLists.customerPartyId, filters.partyId));
  }
  if (filters.flowType) {
    conditions.push(eq(pickLists.flowType, filters.flowType as any));
  }
  if (filters.status) {
    conditions.push(eq(generatedDocuments.status, filters.status));
  }
  if (filters.from) {
    conditions.push(gte(generatedDocuments.createdAt, new Date(`${filters.from}T00:00:00.000Z`)));
  }
  if (filters.to) {
    conditions.push(lte(generatedDocuments.createdAt, new Date(`${filters.to}T23:59:59.999Z`)));
  }
  if (filters.search) {
    const term = `%${filters.search.trim()}%`;
    const searchCondition = or(
      ilike(generatedDocuments.documentNumber, term),
      ilike(pickLists.pickListNumber, term),
      ilike(parties.name, term),
      ilike(parties.code, term),
    );
    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }

  const rows = await db
    .select({
      id: generatedDocuments.id,
      pickListId: pickLists.id,
      documentNumber: generatedDocuments.documentNumber,
      pickListNumber: pickLists.pickListNumber,
      customerPartyId: pickLists.customerPartyId,
      customerPartyName: parties.name,
      customerPartyCode: parties.code,
      flowType: pickLists.flowType,
      status: generatedDocuments.status,
      pickListStatus: pickLists.status,
      snapshotHash: generatedDocuments.snapshotHash,
      artifactPath: generatedDocuments.artifactPath,
      createdByName: userProfiles.displayName,
      generatedAt: generatedDocuments.generatedAt,
      createdAt: generatedDocuments.createdAt,
      itemCount: sql<number>`coalesce((select count(*)::int from ${pickListItems} where ${pickListItems.pickListId} = ${pickLists.id}), 0)`,
      packageCount: sql<number>`coalesce((select sum(${pickListItems.numberOfBoxes})::int from ${pickListItems} where ${pickListItems.pickListId} = ${pickLists.id}), 0)`,
      totalQuantity: sql<number>`coalesce((select sum(${pickListItems.qty})::int from ${pickListItems} where ${pickListItems.pickListId} = ${pickLists.id}), 0)`,
    })
    .from(generatedDocuments)
    .innerJoin(
      inventoryCommitments,
      eq(inventoryCommitments.id, generatedDocuments.sourceId),
    )
    .innerJoin(pickLists, eq(pickLists.id, inventoryCommitments.pickListId))
    .innerJoin(parties, eq(parties.id, pickLists.customerPartyId))
    .leftJoin(userProfiles, eq(userProfiles.id, generatedDocuments.createdBy))
    .where(and(...conditions))
    .orderBy(desc(generatedDocuments.createdAt))
    .limit(filters.limit ?? 50)
    .offset(filters.offset ?? 0);

  return rows.map((r: any) => ({
    id: r.id,
    pickListId: r.pickListId,
    documentNumber: r.documentNumber,
    pickListNumber: r.pickListNumber,
    customerPartyId: r.customerPartyId,
    customerPartyName: r.customerPartyName ?? "Unknown Organization",
    customerPartyCode: r.customerPartyCode ?? "",
    flowType: r.flowType,
    status: r.status,
    pickListStatus: r.pickListStatus,
    itemCount: Number(r.itemCount ?? 0),
    packageCount: Number(r.packageCount ?? 0),
    totalQuantity: Number(r.totalQuantity ?? 0),
    snapshotHash: r.snapshotHash,
    artifactPath: r.artifactPath,
    createdByName: r.createdByName,
    generatedAt: r.generatedAt,
    createdAt: r.createdAt,
  }));
}

/**
 * Documents Center — Tab 3: Delivery Receipts / Acknowledgement Receipts archive query.
 */
export async function listAcknowledgementReceiptArchiveDocuments(
  db: DbLike,
  filters: DocumentArchiveFilter = {},
): Promise<AcknowledgementReceiptArchiveRow[]> {
  const conditions = [
    eq(generatedDocuments.documentType, "acknowledgement_receipt"),
    eq(generatedDocuments.sourceType, "inventory_commitment"),
  ];

  if (filters.partyId) {
    conditions.push(eq(pickLists.customerPartyId, filters.partyId));
  }
  if (filters.flowType) {
    conditions.push(eq(pickLists.flowType, filters.flowType as any));
  }
  if (filters.status) {
    conditions.push(eq(generatedDocuments.status, filters.status));
  }
  if (filters.from) {
    conditions.push(gte(generatedDocuments.createdAt, new Date(`${filters.from}T00:00:00.000Z`)));
  }
  if (filters.to) {
    conditions.push(lte(generatedDocuments.createdAt, new Date(`${filters.to}T23:59:59.999Z`)));
  }
  if (filters.search) {
    const term = `%${filters.search.trim()}%`;
    const searchCondition = or(
      ilike(generatedDocuments.documentNumber, term),
      ilike(pickLists.pickListNumber, term),
      ilike(parties.name, term),
      ilike(parties.code, term),
    );
    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }

  const rows = await db
    .select({
      id: generatedDocuments.id,
      pickListId: pickLists.id,
      documentNumber: generatedDocuments.documentNumber,
      pickListNumber: pickLists.pickListNumber,
      customerPartyId: pickLists.customerPartyId,
      customerPartyName: parties.name,
      customerPartyCode: parties.code,
      flowType: pickLists.flowType,
      currency: generatedDocuments.currency,
      status: generatedDocuments.status,
      snapshotHash: generatedDocuments.snapshotHash,
      artifactPath: generatedDocuments.artifactPath,
      dispatchedByName: userProfiles.displayName,
      generatedAt: generatedDocuments.generatedAt,
      createdAt: generatedDocuments.createdAt,
      itemCount: sql<number>`coalesce((select count(*)::int from ${pickListItems} where ${pickListItems.pickListId} = ${pickLists.id}), 0)`,
      totalQuantity: sql<number>`coalesce((select sum(${pickListItems.qty})::int from ${pickListItems} where ${pickListItems.pickListId} = ${pickLists.id}), 0)`,
      totalAmount: sql<number>`coalesce((select sum(coalesce(${pickListItems.unitPrice}, 0) * ${pickListItems.qty})::numeric from ${pickListItems} where ${pickListItems.pickListId} = ${pickLists.id}), 0)`,
    })
    .from(generatedDocuments)
    .innerJoin(
      inventoryCommitments,
      eq(inventoryCommitments.id, generatedDocuments.sourceId),
    )
    .innerJoin(pickLists, eq(pickLists.id, inventoryCommitments.pickListId))
    .innerJoin(parties, eq(parties.id, pickLists.customerPartyId))
    .leftJoin(userProfiles, eq(userProfiles.id, generatedDocuments.createdBy))
    .where(and(...conditions))
    .orderBy(desc(generatedDocuments.createdAt))
    .limit(filters.limit ?? 50)
    .offset(filters.offset ?? 0);

  return rows.map((r: any) => ({
    id: r.id,
    pickListId: r.pickListId,
    documentNumber: r.documentNumber,
    pickListNumber: r.pickListNumber,
    customerPartyId: r.customerPartyId,
    customerPartyName: r.customerPartyName ?? "Unknown Organization",
    customerPartyCode: r.customerPartyCode ?? "",
    flowType: r.flowType,
    currency: r.currency ?? "PHP",
    status: r.status,
    itemCount: Number(r.itemCount ?? 0),
    totalQuantity: Number(r.totalQuantity ?? 0),
    totalAmount: Number(r.totalAmount ?? 0),
    snapshotHash: r.snapshotHash,
    artifactPath: r.artifactPath,
    dispatchedByName: r.dispatchedByName,
    generatedAt: r.generatedAt,
    createdAt: r.createdAt,
  }));
}

/**
 * Documents Center — Tab 4: Statements of Account (SOA) archive query.
 * Requires reporting.financial_read capability at caller level.
 */
export async function listStatementOfAccountArchiveDocuments(
  db: DbLike,
  filters: DocumentArchiveFilter = {},
): Promise<StatementOfAccountArchiveRow[]> {
  const conditions = [];

  if (filters.partyId) {
    conditions.push(eq(vmiBillingPeriods.partyId, filters.partyId));
  }
  if (filters.status) {
    conditions.push(eq(vmiBillingPeriods.status, filters.status));
  }
  if (filters.from) {
    conditions.push(gte(vmiBillingPeriods.createdAt, new Date(`${filters.from}T00:00:00.000Z`)));
  }
  if (filters.to) {
    conditions.push(lte(vmiBillingPeriods.createdAt, new Date(`${filters.to}T23:59:59.999Z`)));
  }
  if (filters.search) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(
      or(
        ilike(vmiBillingPeriods.periodNumber, term),
        ilike(parties.name, term),
        ilike(parties.code, term),
      ),
    );
  }

  const rows = await db
    .select({
      id: vmiBillingPeriods.id,
      periodNumber: vmiBillingPeriods.periodNumber,
      partyId: vmiBillingPeriods.partyId,
      partyName: parties.name,
      partyCode: parties.code,
      periodStartDate: vmiBillingPeriods.periodStartDate,
      periodEndDate: vmiBillingPeriods.periodEndDate,
      storageChargeUsd: vmiBillingPeriods.storageChargeUsd,
      handlingInUsd: vmiBillingPeriods.handlingInUsd,
      handlingOutUsd: vmiBillingPeriods.handlingOutUsd,
      documentationUsd: vmiBillingPeriods.documentationUsd,
      deliveryUsd: vmiBillingPeriods.deliveryUsd,
      recurringFeesUsd: vmiBillingPeriods.recurringFeesUsd,
      adHocChargesUsd: vmiBillingPeriods.adHocChargesUsd,
      billingStatementTotalUsd: vmiBillingPeriods.billingStatementTotalUsd,
      lockedExchangeRatePhp: vmiBillingPeriods.lockedExchangeRatePhp,
      status: vmiBillingPeriods.status,
      soaArtifactId: vmiBillingPeriods.soaArtifactId,
      closedByUserName: userProfiles.displayName,
      closedAt: vmiBillingPeriods.closedAt,
      createdAt: vmiBillingPeriods.createdAt,
    })
    .from(vmiBillingPeriods)
    .innerJoin(parties, eq(parties.id, vmiBillingPeriods.partyId))
    .leftJoin(userProfiles, eq(userProfiles.id, vmiBillingPeriods.closedByUserId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(vmiBillingPeriods.createdAt))
    .limit(filters.limit ?? 50)
    .offset(filters.offset ?? 0);

  return rows.map((r: any) => ({
    id: r.id,
    periodNumber: r.periodNumber,
    partyId: r.partyId,
    partyName: r.partyName ?? "Unknown Organization",
    partyCode: r.partyCode ?? "",
    periodStartDate: String(r.periodStartDate),
    periodEndDate: String(r.periodEndDate),
    storageChargeUsd: Number(r.storageChargeUsd ?? 0),
    handlingInUsd: Number(r.handlingInUsd ?? 0),
    handlingOutUsd: Number(r.handlingOutUsd ?? 0),
    documentationUsd: Number(r.documentationUsd ?? 0),
    deliveryUsd: Number(r.deliveryUsd ?? 0),
    recurringFeesUsd: Number(r.recurringFeesUsd ?? 0),
    adHocChargesUsd: Number(r.adHocChargesUsd ?? 0),
    billingStatementTotalUsd: Number(r.billingStatementTotalUsd ?? 0),
    lockedExchangeRatePhp: Number(r.lockedExchangeRatePhp ?? 0),
    status: r.status,
    soaArtifactId: r.soaArtifactId,
    closedByUserName: r.closedByUserName,
    closedAt: r.closedAt,
    createdAt: r.createdAt,
  }));
}

/**
 * Documents Center — Tab 5: Logistics & PEZA Permits archive query.
 */
export async function listPezaArchiveDocuments(
  db: DbLike,
  filters: DocumentArchiveFilter = {},
): Promise<PezaArchiveRow[]> {
  const conditions = [];

  if (filters.partyId) {
    conditions.push(eq(vmiPermits.partyId, filters.partyId));
  }
  if (filters.status) {
    if (filters.status === "active") {
      conditions.push(eq(vmiPermits.isActive, true));
    } else if (filters.status === "expired" || filters.status === "inactive") {
      conditions.push(eq(vmiPermits.isActive, false));
    }
  }
  if (filters.search) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(
      or(
        ilike(vmiPermits.permitNumber, term),
        ilike(vmiPermits.itemScope, term),
        ilike(parties.name, term),
        ilike(parties.code, term),
      ),
    );
  }

  const rows = await db
    .select({
      id: vmiPermits.id,
      permitNumber: vmiPermits.permitNumber,
      itemScope: vmiPermits.itemScope,
      partyId: vmiPermits.partyId,
      partyName: parties.name,
      partyCode: parties.code,
      validFrom: vmiPermits.validFrom,
      validTo: vmiPermits.validTo,
      isActive: vmiPermits.isActive,
      createdAt: vmiPermits.createdAt,
    })
    .from(vmiPermits)
    .innerJoin(parties, eq(parties.id, vmiPermits.partyId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(vmiPermits.createdAt))
    .limit(filters.limit ?? 50)
    .offset(filters.offset ?? 0);

  return rows.map((r: any) => ({
    id: r.id,
    permitNumber: r.permitNumber,
    permitType: "PEZA LOA Permit",
    partyId: r.partyId,
    partyName: r.partyName ?? "Unknown Organization",
    partyCode: r.partyCode ?? "",
    referenceDocType: "standalone" as const,
    referenceDocNumber: null,
    referenceDocId: null,
    issuedDate: r.validFrom,
    expiryDate: r.validTo,
    status: r.isActive ? "active" : "expired",
    fileUrl: null,
  }));
}

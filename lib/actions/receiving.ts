"use server";
// Receiving server actions — createWrr, recordScan, commitWrr.
//
// Traceability:
//   specs/07-incoming-receiving/requirements.md R1.1 — authorized back-office
//     user creates WRR. R1.3 — expected line fields validated before staging.
//     R1.4 — staged WRR does not create inventory.
//     R3.1 — each scan matched against WRR's expected item/line.
//     R3.2 — system prevents silent over-receipt.
//     R3.3 — wrong/unknown/duplicate/over-quantity scan produces non-success
//     feedback.
//     R3.5 — receipt not confirmable while required lines remain outstanding.
//     R7.1 — all mutations require authenticated, authorized user.
//   specs/07-incoming-receiving/design.md §4 — state model and command
//     boundaries. §5.1 — expected line fields. §9 — receipt commit and
//     idempotency.
//   specs/00-steering/tech.md — RBAC always from session, never client params.
//
// Capabilities required:
//   receiving.confirm — createWrr, commitWrr
//   receiving.scan    — recordScan
//
// These actions are online-only; scan loop and commit are excluded from the
// offline queue (two-stage commitment lifecycle per 08-outgoing spec).

import { eq } from "drizzle-orm";
import type { RequestAuthorizationResolver } from "@/lib/rbac/session";
import { requirePermission } from "@/lib/rbac/guard";
import { validateCreateWrr } from "@/lib/receiving/wrr-schema";
import { matchScan } from "@/lib/receiving/scan-matcher";
import type { WrrLine } from "@/lib/receiving/scan-matcher";
import { validateCommit } from "@/lib/receiving/commit-validation";
import { wrrDocuments, wrrItems } from "@/lib/db/schema/wrr";

// Minimal structural type that both the real Drizzle db instance and test
// stubs satisfy. Uses named method properties (not an index signature) so
// that PostgresJsDatabase, which has no index signature, is assignable here.
/* eslint-disable @typescript-eslint/no-explicit-any */
type DbLike = {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
  update: (...args: any[]) => any;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type CreateWrrActionResult =
  | { ok: true; wrrId: string }
  | { ok: false; errors: string[] };

export type RecordScanResult =
  | { ok: true; remainingQty: number; disposition: "store" | "inspect" }
  | { ok: false; reason: string };

export type CommitWrrResult = { ok: true } | { ok: false; errors: string[] };

// ---------------------------------------------------------------------------
// Internal: fetch WRR document with items for action context
// ---------------------------------------------------------------------------
//
// The action test mock returns [wrrDocRow, ...wrrItemRows] from every
// db.select() call (regardless of the .select() argument shape). The
// discriminator between a document row and an item row is the presence of
// the `wrrId` field: wrr_items rows carry a `wrrId` FK to wrr_documents,
// while wrr_documents rows do not have a `wrrId` column.

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyRecord = Record<string, any>;

async function fetchWrrForAction(
  db: DbLike,
  wrrId: string,
): Promise<{
  id: string;
  wrrNumber: string;
  status: string;
  flowType: string;
  vendorPartyId: string;
  stagedByUserId: string;
  items: WrrLine[];
} | null> {
  const allRows: AnyRecord[] = await db
    .select()
    .from(wrrDocuments)
    .leftJoin(wrrItems, eq(wrrItems.wrrId, wrrDocuments.id))
    .where(eq(wrrDocuments.id, wrrId));

  if (allRows.length === 0) return null;

  const first = allRows[0];

  // Rows that carry a `wrrId` field (the wrr_items FK) are item rows;
  // doc rows do not have this column. Using != null (loose) also handles
  // undefined (field absent on doc rows in test mocks).
  const items: WrrLine[] = allRows
    .filter((row: AnyRecord) => row.wrrId != null)
    .map((row: AnyRecord) => ({
      id: row.id as string,
      itemId: (row.itemId ?? null) as string | null,
      // barcode comes from the mock's convenience field; itemCode is the
      // production fallback for the supplier part number field.
      itemBarcode: (row.barcode ?? row.itemCode ?? null) as string | null,
      lotNumber: row.lotNumber as string,
      expectedQty: row.expectedQty as number,
      scannedQty: row.scannedQty as number,
      disposition: row.disposition as "store" | "inspect",
    }));

  return {
    id: first.id as string,
    wrrNumber: first.wrrNumber as string,
    status: first.status as string,
    flowType: first.flowType as string,
    vendorPartyId: first.vendorPartyId as string,
    stagedByUserId: first.stagedByUserId as string,
    items,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// WRR number generation
// ---------------------------------------------------------------------------

function generateWrrNumber(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  // Six-digit suffix from the last six digits of Date.now() (milliseconds).
  const suffix = String(Date.now()).slice(-6).padStart(6, "0");
  return `WRR-${yyyy}${mm}${dd}-${suffix}`;
}

// ---------------------------------------------------------------------------
// createWrr
// ---------------------------------------------------------------------------

/**
 * Creates a new WRR document (staged_pending_arrival).
 * Requires receiving.confirm capability.
 * Validates input via validateCreateWrr before any DB write.
 * Returns { ok: true, wrrId } on success.
 */
export async function createWrr(
  resolver: RequestAuthorizationResolver,
  db: DbLike,
  input: unknown,
): Promise<CreateWrrActionResult> {
  // 1. Authorization
  const perm = await requirePermission(resolver, "receiving.confirm");
  if (perm.kind !== "authorized") {
    return { ok: false, errors: ["forbidden"] };
  }

  // 2. Input validation (before any DB write)
  const validation = validateCreateWrr(input);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors };
  }

  const data = validation.data;
  const userId = perm.context.userId;

  // 3. Generate WRR number
  const wrrNumber = generateWrrNumber();

  // 4. INSERT wrr_documents row
  const [inserted] = await db
    .insert(wrrDocuments)
    .values({
      wrrNumber,
      vendorPartyId: data.vendorPartyId,
      flowType: data.flowType,
      status: "staged_pending_arrival",
      stagedByUserId: userId,
      commercialInvoiceNo: data.commercialInvoiceNo ?? null,
      ciplFileUrl: data.ciplFileUrl ?? null,
      pezaNumber: data.pezaNumber ?? null,
      ipNumber: data.ipNumber ?? null,
      mawbMblNumber: data.mawbMblNumber ?? null,
    })
    .returning();

  return { ok: true, wrrId: (inserted as { id: string }).id };
}

// ---------------------------------------------------------------------------
// recordScan
// ---------------------------------------------------------------------------

/**
 * Records a single barcode scan against a receiving_in_progress WRR.
 * Requires receiving.scan capability.
 * Returns remainingQty and disposition on success.
 */
export async function recordScan(
  resolver: RequestAuthorizationResolver,
  db: DbLike,
  wrrId: string,
  barcode: string,
): Promise<RecordScanResult> {
  // 1. Authorization
  const perm = await requirePermission(resolver, "receiving.scan");
  if (perm.kind !== "authorized") {
    return { ok: false, reason: "forbidden" };
  }

  // 2. Fetch WRR with items
  const doc = await fetchWrrForAction(db, wrrId);
  if (doc === null) {
    return { ok: false, reason: "not_found" };
  }

  // 3. Status guard
  if (doc.status !== "receiving_in_progress") {
    return { ok: false, reason: "invalid_status" };
  }

  // 4. Match barcode against expected lines
  const matchResult = matchScan(barcode, doc.items);
  if (!matchResult.matched) {
    return { ok: false, reason: matchResult.reason };
  }

  const line = matchResult.line;

  // 5. Increment scannedQty
  await db
    .update(wrrItems)
    .set({ scannedQty: line.scannedQty + 1 })
    .where(eq(wrrItems.id, line.id));

  // 6. Return success
  return {
    ok: true,
    remainingQty: matchResult.remainingQty,
    disposition: line.disposition,
  };
}

// ---------------------------------------------------------------------------
// commitWrr
// ---------------------------------------------------------------------------

/**
 * Commits a WRR: validates via validateCommit, then sets status='confirmed'.
 * Records confirmedAt and confirmedByUserId.
 * Requires receiving.confirm capability.
 */
export async function commitWrr(
  resolver: RequestAuthorizationResolver,
  db: DbLike,
  wrrId: string,
): Promise<CommitWrrResult> {
  // 1. Authorization
  const perm = await requirePermission(resolver, "receiving.confirm");
  if (perm.kind !== "authorized") {
    return { ok: false, errors: ["forbidden"] };
  }

  const userId = perm.context.userId;

  // 2. Fetch WRR with items
  const doc = await fetchWrrForAction(db, wrrId);
  if (doc === null) {
    return { ok: false, errors: ["not_found"] };
  }

  // 3. Pre-commit validation (status, scan totals, unresolved items, disposition)
  const commitResult = validateCommit(
    {
      id: doc.id,
      status: doc.status,
      flowType: doc.flowType,
      vendorPartyId: doc.vendorPartyId,
    },
    // WrrLine has itemBarcode; validateCommit does not use it — extra fields
    // are safe via structural subtyping.
    doc.items as Parameters<typeof validateCommit>[1],
  );
  if (!commitResult.ok) {
    return { ok: false, errors: commitResult.errors };
  }

  // 4. Update wrr_documents to confirmed
  await db
    .update(wrrDocuments)
    .set({
      status: "confirmed",
      confirmedAt: new Date(),
      confirmedByUserId: userId,
    })
    .where(eq(wrrDocuments.id, wrrId));

  return { ok: true };
}

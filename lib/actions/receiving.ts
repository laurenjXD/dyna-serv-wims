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

import { and, eq } from "drizzle-orm";
import type { RequestAuthorizationResolver } from "@/lib/rbac/session";
import { requirePermission } from "@/lib/rbac/guard";
import { validateCreateWrr } from "@/lib/receiving/wrr-schema";
import { matchScan } from "@/lib/receiving/scan-matcher";
import type { WrrLine } from "@/lib/receiving/scan-matcher";
import { validateCommit } from "@/lib/receiving/commit-validation";
import { wrrDocuments, wrrItems } from "@/lib/db/schema/wrr";
import { lots } from "@/lib/db/schema/lots";
import { lotLocationBalances } from "@/lib/db/schema/lot_location_balances";
import { inventoryTransactions } from "@/lib/db/schema/transactions";
import { locations } from "@/lib/db/schema/locations";

// Minimal structural type that both the real Drizzle db instance and test
// stubs satisfy. Uses named method properties (not an index signature) so
// that PostgresJsDatabase, which has no index signature, is assignable here.
/* eslint-disable @typescript-eslint/no-explicit-any */
type DbLike = {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
  update: (...args: any[]) => any;
  transaction: (callback: (tx: DbLike) => Promise<unknown>) => Promise<unknown>;
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
// Drizzle returns nested left-join rows (`{ wrr_documents, wrr_items }`),
// while the action test double returns flat rows. Normalize both shapes here.

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
  commercialInvoiceNo: string | null;
  pezaNumber: string | null;
  ipNumber: string | null;
  items: WrrLine[];
} | null> {
  const allRows: AnyRecord[] = await db
    .select()
    .from(wrrDocuments)
    .leftJoin(wrrItems, eq(wrrItems.wrrId, wrrDocuments.id))
    .where(eq(wrrDocuments.id, wrrId));

  if (allRows.length === 0) return null;

  const first = (allRows[0].wrr_documents ?? allRows[0]) as AnyRecord;

  const items: WrrLine[] = allRows
    .map((row: AnyRecord) => (row.wrr_items ?? row) as AnyRecord)
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
      putawayLocationId: (row.putawayLocationId ?? null) as string | null,
    }));

  return {
    id: first.id as string,
    wrrNumber: first.wrrNumber as string,
    status: first.status as string,
    flowType: first.flowType as string,
    vendorPartyId: first.vendorPartyId as string,
    stagedByUserId: first.stagedByUserId as string,
    commercialInvoiceNo: (first.commercialInvoiceNo ?? null) as string | null,
    pezaNumber: (first.pezaNumber ?? null) as string | null,
    ipNumber: (first.ipNumber ?? null) as string | null,
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

  // 4. Stage the header and every expected line in one transaction. A WRR
  // without its line records can never safely reach the confirmation command.
  return (await db.transaction(async (tx) => {
    const [inserted] = await tx
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
      .returning({ id: wrrDocuments.id });

    await tx.insert(wrrItems).values(
      data.lines.map((line) => ({
        wrrId: inserted.id,
        itemId: line.itemId ?? null,
        itemCode: line.itemCode ?? null,
        customerItemCode: line.customerItemCode ?? null,
        lotNumber: line.lotNumber,
        expectedQty: line.expectedQty,
        unitCbm: String(line.unitCbm),
        uom: line.uom,
        disposition: line.disposition,
        putawayLocationId: line.putawayLocationId ?? null,
      })),
    );

    return { ok: true, wrrId: inserted.id } satisfies CreateWrrActionResult;
  })) as CreateWrrActionResult;
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
// startReceiving
// ---------------------------------------------------------------------------

/**
 * Transitions a WRR from staged_pending_arrival → receiving_in_progress.
 * Requires receiving.confirm capability.
 * Rejects if the WRR is already in progress, confirmed, or cancelled.
 */
export async function startReceiving(
  resolver: RequestAuthorizationResolver,
  db: DbLike,
  wrrId: string,
): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  // 1. Authorization
  const perm = await requirePermission(resolver, "receiving.confirm");
  if (perm.kind !== "authorized") {
    return { ok: false, errors: ["forbidden"] };
  }

  // 2. Fetch WRR
  const doc = await fetchWrrForAction(db, wrrId);
  if (doc === null) {
    return { ok: false, errors: ["not_found"] };
  }

  // 3. Status guard — only staged_pending_arrival may transition to in_progress
  if (doc.status !== "staged_pending_arrival") {
    return { ok: false, errors: ["invalid_status"] };
  }

  // 4. Transition status
  await db
    .update(wrrDocuments)
    .set({ status: "receiving_in_progress", updatedAt: new Date() })
    .where(eq(wrrDocuments.id, wrrId));

  return { ok: true };
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

  // Every read, status transition, and inventory write occurs through one
  // transaction. The conditional status update is the idempotency gate: only
  // the transaction that can move an in-progress WRR to confirmed may create
  // lots or ledger rows; retries receive the existing-state result instead.
  return (await db.transaction(async (tx) => {
    const doc = await fetchWrrForAction(tx, wrrId);
    if (doc === null) {
      return { ok: false, errors: ["not_found"] } satisfies CommitWrrResult;
    }

    const commitResult = validateCommit(
      {
        id: doc.id,
        status: doc.status,
        flowType: doc.flowType,
        vendorPartyId: doc.vendorPartyId,
      },
      doc.items as Parameters<typeof validateCommit>[1],
    );
    if (!commitResult.ok) {
      return { ok: false, errors: commitResult.errors } satisfies CommitWrrResult;
    }

    const selectedLocations = await resolveCommitLocations(tx, doc.items);
    if (!selectedLocations.ok) {
      return { ok: false, errors: selectedLocations.errors } satisfies CommitWrrResult;
    }

    const confirmed = await tx
      .update(wrrDocuments)
      .set({
        status: "confirmed",
        confirmedAt: new Date(),
        confirmedByUserId: userId,
        updatedAt: new Date(),
      })
      .where(and(
        eq(wrrDocuments.id, wrrId),
        eq(wrrDocuments.status, "receiving_in_progress"),
      ))
      .returning({ id: wrrDocuments.id });

    if (confirmed.length !== 1) {
      return { ok: false, errors: ["already_committed_or_invalid_status"] } satisfies CommitWrrResult;
    }

    for (const line of doc.items) {
      const locationId = selectedLocations.byLineId.get(line.id)!;
      const [lot] = await tx
        .insert(lots)
        .values({
          lotNumber: line.lotNumber,
          wrrItemId: line.id,
          itemId: line.itemId!,
          flowType: doc.flowType as "vmi" | "trading" | "supplies",
          ownerPartyId: doc.flowType === "vmi" ? doc.vendorPartyId : null,
          status: line.disposition === "store" ? "available" : "quarantined",
          pezaNumber: doc.pezaNumber,
          commercialInvoiceNo: doc.commercialInvoiceNo,
          ipNumber: doc.ipNumber,
        })
        .returning({ id: lots.id });

      await tx.insert(lotLocationBalances).values({
        lotId: lot.id,
        locationId,
        qtyReceived: line.scannedQty,
        qtyRemaining: line.scannedQty,
        qtyCommitted: 0,
      });

      await tx.insert(inventoryTransactions).values({
        // A WRR item UUID is globally unique and keeps the receipt reference
        // below the schema's 50-character limit, unlike concatenating two
        // full UUIDs. It also makes a retried commit deterministically refer
        // to the same physical line.
        transactionNumber: `RCV-${line.id}`,
        lotId: lot.id,
        itemId: line.itemId!,
        movementType: "receiving",
        toLocationId: locationId,
        qty: line.scannedQty,
        flowType: doc.flowType as "vmi" | "trading" | "supplies",
        commercialInvoiceNo: doc.commercialInvoiceNo,
        wrrId: doc.id,
        performedByUserId: userId,
      });
    }

    return { ok: true } satisfies CommitWrrResult;
  })) as CommitWrrResult;
}

async function resolveCommitLocations(
  db: DbLike,
  lines: WrrLine[],
): Promise<{ ok: true; byLineId: Map<string, string> } | { ok: false; errors: string[] }> {
  const byLineId = new Map<string, string>();
  const errors: string[] = [];

  for (const line of lines) {
    if (line.disposition === "store") {
      if (!line.putawayLocationId) {
        errors.push(`Line ${line.id} is missing its designated putaway location`);
        continue;
      }
      const rows = await db
        .select({ id: locations.id })
        .from(locations)
        .where(and(
          eq(locations.id, line.putawayLocationId),
          eq(locations.locationType, "storage"),
          eq(locations.isActive, true),
        ));
      if (rows.length !== 1) {
        errors.push(`Line ${line.id} references an inactive or non-storage putaway location`);
      } else {
        byLineId.set(line.id, rows[0].id as string);
      }
      continue;
    }

    const rows = await db
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.locationType, "inspection"), eq(locations.isActive, true)));
    if (rows.length !== 1) {
      errors.push("Exactly one active inspection location is required to commit inspect lines");
    } else {
      byLineId.set(line.id, rows[0].id as string);
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, byLineId };
}

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

import { and, eq, isNull } from "drizzle-orm";
import type { RequestAuthorizationResolver } from "@/lib/rbac/session";
import { requirePermission } from "@/lib/rbac/guard";
import { validateCreateWrr } from "@/lib/receiving/wrr-schema";
import { matchScan } from "@/lib/receiving/scan-matcher";
import type { WrrLine } from "@/lib/receiving/scan-matcher";
import { validateLineCommit } from "@/lib/receiving/commit-validation";
import type { CommitLocation } from "@/lib/receiving/commit-validation";
import { wrrDocuments, wrrItems, wrrItemUnitScans } from "@/lib/db/schema/wrr";
import { lots } from "@/lib/db/schema/lots";
import { lotLocationBalances } from "@/lib/db/schema/lot_location_balances";
import { inventoryTransactions } from "@/lib/db/schema/transactions";
import { locations } from "@/lib/db/schema/locations";
import { withRlsTransaction } from "@/lib/db/rls-transaction";
import type { RlsTransactionDeps } from "@/lib/db/rls-transaction";
import { rlsPool } from "@/lib/db/rls-pool";
import { getAuthenticatedSession } from "@/lib/auth/get-authenticated-session";

// Every action below binds its DB work to the caller's RLS-claimed
// transaction (specs/02-rbac-roles/design.md §6.3) rather than an
// unauthenticated plain connection. `requirePermission()` remains the
// app-layer capability gate (unchanged); `withRlsTransaction` additionally
// makes the underlying Postgres RLS policies the real, DB-level backstop.
const defaultRlsDeps: RlsTransactionDeps = { getAuthenticatedSession, pool: rlsPool };

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

export type CommitWrrLineResult = { ok: true } | { ok: false; errors: string[] };

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
  input: unknown,
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
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

  // 4. Stage the header and every expected line in one RLS-claimed
  // transaction. A WRR without its line records can never safely reach the
  // confirmation command.
  const rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;

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
      .returning({ id: wrrDocuments.id });

    await db.insert(wrrItems).values(
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
  });

  if (rlsResult.kind === "unauthenticated") {
    return { ok: false, errors: ["forbidden"] };
  }
  return rlsResult.value;
}

// ---------------------------------------------------------------------------
// recordScan
// ---------------------------------------------------------------------------

// Cheaply peeks at whether `barcode` parses as a wrr_item_unit JSON payload
// (Spec 18 §2.2), returning its wrr_item_id when so. Deliberately narrow/
// duplicated from scan-matcher.ts's own parsing rather than exported from
// there: matchScan stays a pure function with no DB access, while this
// action is the one place that needs to know *whether to query at all*
// before calling it — an ordinary (non-JSON) barcode must never trigger a
// wrr_item_unit_scans lookup.
function peekWrrItemUnitId(barcode: string): string | null {
  const trimmed = barcode.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed) as { type?: unknown; wrr_item_id?: unknown };
    if (parsed?.type === "wrr_item_unit" && typeof parsed?.wrr_item_id === "string") {
      return parsed.wrr_item_id;
    }
  } catch {
    // Not valid JSON — not a wrr_item_unit payload.
  }
  return null;
}

/**
 * Records a single barcode scan against a receiving_in_progress WRR.
 * Requires receiving.scan capability.
 * Returns remainingQty and disposition on success.
 */
export async function recordScan(
  resolver: RequestAuthorizationResolver,
  wrrId: string,
  barcode: string,
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<RecordScanResult> {
  // 1. Authorization
  const perm = await requirePermission(resolver, "receiving.scan");
  if (perm.kind !== "authorized") {
    return { ok: false, reason: "forbidden" };
  }
  const userId = perm.context.userId;

  const rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;

    // 2. Fetch WRR with items
    const doc = await fetchWrrForAction(db, wrrId);
    if (doc === null) {
      return { ok: false, reason: "not_found" } satisfies RecordScanResult;
    }

    // 3. Status guard
    if (doc.status !== "receiving_in_progress") {
      return { ok: false, reason: "invalid_status" } satisfies RecordScanResult;
    }

    // The QR printed in the WRR header contains the document number. It is a
    // document identifier, not a physical unit label, so reject it with an
    // actionable explanation instead of the misleading "unknown item" state.
    if (barcode.trim() === doc.wrrNumber) {
      return { ok: false, reason: "wrr_document_qr" } satisfies RecordScanResult;
    }

    // 3a. Per-unit duplicate detection (Spec 18 §2.2): only when the barcode
    // itself parses as a wrr_item_unit payload do we even query
    // wrr_item_unit_scans — an ordinary barcode never triggers this lookup.
    let alreadyScannedUnitIds: Set<string> | undefined;
    const peekedWrrItemId = peekWrrItemUnitId(barcode);
    if (peekedWrrItemId !== null) {
      const unitScanRows = (await db
        .select({ unitId: wrrItemUnitScans.unitId })
        .from(wrrItemUnitScans)
        .where(eq(wrrItemUnitScans.wrrItemId, peekedWrrItemId))) as Array<{ unitId: string }>;
      alreadyScannedUnitIds = new Set(unitScanRows.map((row) => row.unitId));
    }

    // 4. Match barcode against expected lines
    const matchResult = matchScan(barcode, doc.items, undefined, alreadyScannedUnitIds);
    if (!matchResult.matched) {
      return { ok: false, reason: matchResult.reason } satisfies RecordScanResult;
    }

    const line = matchResult.line;

    // 5. Increment scannedQty
    await db
      .update(wrrItems)
      .set({ scannedQty: line.scannedQty + 1 })
      .where(eq(wrrItems.id, line.id));

    // 5a. Persist the per-unit scan record for a successful wrr_item_unit
    // match, in the same transaction as the scannedQty increment above —
    // both succeed or both roll back together.
    if (matchResult.unitId) {
      await db.insert(wrrItemUnitScans).values({
        wrrItemId: line.id,
        unitId: matchResult.unitId,
        scannedByUserId: userId,
      });
    }

    // 6. Return success
    return {
      ok: true,
      remainingQty: matchResult.remainingQty,
      disposition: line.disposition,
    } satisfies RecordScanResult;
  });

  if (rlsResult.kind === "unauthenticated") {
    return { ok: false, reason: "forbidden" };
  }
  return rlsResult.value;
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
  wrrId: string,
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  // 1. Authorization
  const perm = await requirePermission(resolver, "receiving.confirm");
  if (perm.kind !== "authorized") {
    return { ok: false, errors: ["forbidden"] };
  }

  const rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;

    // 2. Fetch WRR
    const doc = await fetchWrrForAction(db, wrrId);
    if (doc === null) {
      return { ok: false as const, errors: ["not_found"] };
    }

    // 3. Status guard — only staged_pending_arrival may transition to in_progress
    if (doc.status !== "staged_pending_arrival") {
      return { ok: false as const, errors: ["invalid_status"] };
    }

    // 4. Transition status
    await db
      .update(wrrDocuments)
      .set({ status: "receiving_in_progress", updatedAt: new Date() })
      .where(eq(wrrDocuments.id, wrrId));

    return { ok: true as const };
  });

  if (rlsResult.kind === "unauthenticated") {
    return { ok: false, errors: ["forbidden"] };
  }
  return rlsResult.value;
}

// ---------------------------------------------------------------------------
// commitWrrLine
// ---------------------------------------------------------------------------

/**
 * Commits a single WRR line: validates via validateLineCommit against the
 * staff-supplied location, then atomically posts that line's lot, location
 * balance, and receiving ledger row. Once every line on the WRR has
 * committed, the WRR transitions to 'confirmed'; until then it remains
 * 'receiving_in_progress'. Requires receiving.confirm capability.
 *
 * Per-line idempotency: wrr_items.committed_at is the gate. A retry on an
 * already-committed line observes the existing successful outcome instead of
 * re-inserting lots/balances/transactions (R7.5).
 *
 * See specs/07-incoming-receiving/design.md §9 (Reversed 2026-08-10).
 */
export async function commitWrrLine(
  resolver: RequestAuthorizationResolver,
  wrrId: string,
  wrrItemId: string,
  params: { locationId: string },
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<CommitWrrLineResult> {
  // 1. Authorization
  const perm = await requirePermission(resolver, "receiving.confirm");
  if (perm.kind !== "authorized") {
    return { ok: false, errors: ["forbidden"] };
  }

  const userId = perm.context.userId;

  // Every read, validation, conditional claim, and inventory write for this
  // one line occurs through one RLS-claimed transaction. The conditional
  // UPDATE on committed_at IS NULL is the idempotency gate: only the
  // transaction that can claim the null-to-timestamp transition may create
  // this line's inventory rows; retries observe the existing successful
  // result instead.
  const rlsResult = await withRlsTransaction(rlsDeps, async (rlsTx) => {
    const tx = rlsTx.db as DbLike;
    const doc = await fetchWrrForAction(tx, wrrId);
    if (doc === null) {
      return { ok: false, errors: ["not_found"] } satisfies CommitWrrLineResult;
    }

    const line = doc.items.find((item) => item.id === wrrItemId);
    if (!line) {
      return { ok: false, errors: ["not_found"] } satisfies CommitWrrLineResult;
    }

    // Idempotency short-circuit (R7.5): once a line has committed, its own
    // committed_at is authoritative on its own, independent of the WRR's
    // current status (which may have already advanced to 'confirmed' once
    // every line committed). Re-validating against the now-'confirmed' WRR
    // status would incorrectly reject an already-successful retry.
    const existingRows = await tx
      .select({ committedAt: wrrItems.committedAt })
      .from(wrrItems)
      .where(eq(wrrItems.id, wrrItemId));
    if (existingRows.length === 1 && existingRows[0].committedAt !== null) {
      return { ok: true } satisfies CommitWrrLineResult;
    }

    const locationRows = await tx
      .select({
        id: locations.id,
        isActive: locations.isActive,
        locationType: locations.locationType,
      })
      .from(locations)
      .where(eq(locations.id, params.locationId));
    const location: CommitLocation | null =
      locationRows.length === 1
        ? {
            id: locationRows[0].id as string,
            isActive: locationRows[0].isActive as boolean,
            locationType: locationRows[0].locationType as string,
          }
        : null;

    const validation = validateLineCommit(
      {
        id: doc.id,
        status: doc.status,
        flowType: doc.flowType,
        vendorPartyId: doc.vendorPartyId,
      },
      line,
      location,
    );
    if (!validation.ok) {
      return { ok: false, errors: validation.errors } satisfies CommitWrrLineResult;
    }

    // Conditional claim: only the caller who flips committed_at from NULL to
    // now() may post this line's inventory rows below.
    const claimed = await tx
      .update(wrrItems)
      .set({
        committedAt: new Date(),
        ...(line.disposition === "store" ? { putawayLocationId: params.locationId } : {}),
      })
      .where(and(eq(wrrItems.id, wrrItemId), isNull(wrrItems.committedAt)))
      .returning({ id: wrrItems.id });

    if (claimed.length === 1) {
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
        locationId: params.locationId,
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
        toLocationId: params.locationId,
        qty: line.scannedQty,
        flowType: doc.flowType as "vmi" | "trading" | "supplies",
        commercialInvoiceNo: doc.commercialInvoiceNo,
        wrrId: doc.id,
        performedByUserId: userId,
      });
    }
    // If claimed.length === 0, this line was already committed by a prior
    // call — idempotent retry; nothing more to post for this line.

    // Re-evaluate WRR-level completion: flip to 'confirmed' only once every
    // line on this WRR has committed_at set. Left as receiving_in_progress
    // otherwise (no intermediate status value is introduced).
    const allLines = await tx
      .select({ id: wrrItems.id, committedAt: wrrItems.committedAt })
      .from(wrrItems)
      .where(eq(wrrItems.wrrId, wrrId));
    const allCommitted =
      allLines.length > 0 &&
      allLines.every((l: { committedAt: Date | null }) => l.committedAt !== null);

    if (allCommitted) {
      await tx
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
        ));
    }

    return { ok: true } satisfies CommitWrrLineResult;
  });

  if (rlsResult.kind === "unauthenticated") {
    return { ok: false, errors: ["forbidden"] };
  }
  return rlsResult.value;
}

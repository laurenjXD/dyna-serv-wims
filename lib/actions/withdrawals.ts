"use server";
// Withdrawal server actions — commitWithdrawal, dispatchPickList,
// listOutgoingLedger.
//
// Traceability:
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/requirements.md
//     R1.3 — pick-list generation SHALL validate item_code_is_provisional
//     R5.1 — commitment SHALL be an explicit, authorized online server command
//     R5.2 — command SHALL atomically revalidate selected quantities, stock,
//             lot eligibility/order, existing commitments, and party/flow scope
//     R5.3 — on success system SHALL reserve selected quantities and generate
//             the operational pick_list
//     R7.5 — final dispatch confirmation SHALL atomically verify commitment
//             and scans, decrement authoritative inventory, release committed
//             quantity, transition pick list, and insert immutable transaction
//     R7.6 — duplicate/lost-response SHALL return original outcome, never
//             decrement inventory twice
//     R9.1 — Outgoing Ledger SHALL be a filtered view of authoritative
//             inventory_transactions, primarily movement_type = 'pick'
//     R10.1 — capability checks from current server session, never client params
//     R10.2 — client-supplied values SHALL NOT establish authorization
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/design.md
//     §6 — Stage 1 commitment transaction
//     §7 — Stage 2 physical execution and dispatch transaction
//     §9 — Outgoing ledger design
//   specs/02-rbac-roles/design.md §3.2 — capability names:
//     withdrawal.request, withdrawal.execute, withdrawal.view
//   specs/00-steering/tech.md — RBAC always from session, never client params.

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import type { RequestAuthorizationResolver } from "@/lib/rbac/session";
import { requirePermission } from "@/lib/rbac/guard";
import { validateWithdrawal } from "@/lib/withdrawal/withdrawal-validator";
import { allocate, checkProvisionalItemCodes } from "@/lib/withdrawal/allocation";
import { pickLists, pickListItems } from "@/lib/db/schema/pick_lists";
import { lotLocationBalances } from "@/lib/db/schema/lot_location_balances";
import { lots } from "@/lib/db/schema/lots";
import { items } from "@/lib/db/schema/items";
import { locations } from "@/lib/db/schema/locations";
import {
  inventoryCommitments,
  inventoryCommitmentLines,
} from "@/lib/db/schema/commitments";
import { inventoryTransactions } from "@/lib/db/schema/transactions";
import { generatedDocuments } from "@/lib/db/schema/documents";
import { approvalRequests } from "@/lib/db/schema/approvals";
import { inventoryUnits } from "@/lib/db/schema/inventory_units";
import { parseWrrUnitPayload } from "@/lib/barcode/wrr-unit";
import {
  listOutgoingLedger as queryListOutgoingLedger,
  type OutgoingLedgerRow,
} from "@/lib/db/queries/withdrawals";
import { withRlsTransaction } from "@/lib/db/rls-transaction";
import type {
  RlsTransactionDeps,
  RlsTransactionResult,
} from "@/lib/db/rls-transaction";
import { rlsPool } from "@/lib/db/rls-pool";
import { getAuthenticatedSession } from "@/lib/auth/get-authenticated-session";

const defaultRlsDeps: RlsTransactionDeps = {
  getAuthenticatedSession,
  pool: rlsPool,
};

// Minimal structural type that both the real Drizzle db instance and test
// stubs satisfy. Uses named method properties (not an index signature) so
// that PostgresJsDatabase, which has no index signature, is assignable here.
/* eslint-disable @typescript-eslint/no-explicit-any */
type DbLike = {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
  update: (...args: any[]) => any;
  execute?: (...args: any[]) => any;
};

type AnyRecord = Record<string, any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

function hashSnapshot(data: unknown): string {
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

// Thrown from inside dispatchPickList's withRlsTransaction callback when the
// lot_location_balances CAS-guard update (see that update's own comment,
// below) affects zero rows -- i.e. a concurrent dispatch of a DIFFERENT pick
// list already changed the same balance row between this line's SELECT and
// this UPDATE, so the optimistic-concurrency WHERE clause no longer matches.
//
// Thrown (not returned) so it propagates through withRlsTransaction's
// guaranteed catch/rollback/rethrow (lib/db/rls-transaction.ts) exactly like
// any other mid-loop failure -- the whole transaction rolls back, no partial
// pick_list/commitment/ledger state is left behind. dispatchPickList's own
// try/catch around the withRlsTransaction call (below) is the only place
// that recognizes this specific error type and translates it into a named,
// recoverable { ok: false, errors: ["concurrent_modification"] } result
// distinct from the generic thrown-error case (which continues to reject
// the whole dispatchPickList call, per that path's existing contract).
class ConcurrentModificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConcurrentModificationError";
  }
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type CommitWithdrawalResult =
  | { ok: true; pickListId: string }
  | { ok: false; errors: string[] };

export type RequestFifoOverrideResult =
  | { ok: true; requestId: string; requestNumber: string }
  | { ok: false; errors: string[] };

export type DispatchPickListResult =
  | { ok: true }
  | { ok: false; errors: string[] };

export type MarkPickListPickedResult =
  | { ok: true }
  | { ok: false; errors: string[] };

export type SelectPickUnitResult =
  | { ok: true; selectedCount: number; requiredCount: number }
  | { ok: false; errors: string[] };

export type ListOutgoingLedgerResult =
  | { rows: OutgoingLedgerRow[]; total: number }
  | { ok: false; errors: string[] };

/**
 * Creates a bounded FIFO/FEFO override request for one exact pallet/location.
 * No stock is reserved here. A later Stage 1 command must consume an approved,
 * unexpired decision and revalidate the balance version atomically.
 */
export async function requestFifoOverride(
  resolver: RequestAuthorizationResolver,
  input: unknown,
  reason: string,
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<RequestFifoOverrideResult> {
  const permission = await requirePermission(resolver, "fifo_override.request");
  if (permission.kind !== "authorized") return { ok: false, errors: ["forbidden"] };

  const validation = validateWithdrawal(input);
  if (!validation.ok) return { ok: false, errors: validation.errors };
  const data = validation.data;
  const trimmedReason = reason.trim();
  if (trimmedReason.length < 10) return { ok: false, errors: ["override_reason_too_short"] };
  if (data.lines.length !== 1) return { ok: false, errors: ["override_single_pallet_required"] };

  try {
    const result = await withRlsTransaction(rlsDeps, async (tx) => {
      const database = tx.db as DbLike;
      const requested = data.lines[0];
      const rows = (await database
        .select({
          balanceId: lotLocationBalances.id,
          allocationVersion: lotLocationBalances.version,
          qtyRemaining: lotLocationBalances.qtyRemaining,
          qtyCommitted: lotLocationBalances.qtyCommitted,
          itemId: items.id,
          itemCode: items.code,
          defaultSupplierPartyId: items.defaultSupplierPartyId,
          isPerishable: items.isPerishable,
          lotId: lots.id,
          lotNumber: lots.lotNumber,
          lotStatus: lots.status,
          lotFlowType: lots.flowType,
          expiryDate: lots.expiryDate,
          receivedAt: lots.createdAt,
          locationId: locations.id,
          locationLabel: locations.label,
        })
        .from(lotLocationBalances)
        .innerJoin(lots, eq(lots.id, lotLocationBalances.lotId))
        .innerJoin(items, eq(items.id, lots.itemId))
        .innerJoin(locations, eq(locations.id, lotLocationBalances.locationId))
        .where(and(
          eq(lots.itemId, requested.itemId),
          eq(lots.status, "available"),
          eq(lots.flowType, data.flowType),
          sql`${lotLocationBalances.qtyRemaining} - ${lotLocationBalances.qtyCommitted} > 0`,
        ))) as AnyRecord[];

      const selected = rows.find((row) =>
        row.lotId === requested.lotId && row.locationId === requested.locationId,
      );
      if (!selected || selected.defaultSupplierPartyId !== data.partyId) {
        throw new Error("unable_to_reserve_stock");
      }
      const available = selected.qtyRemaining - selected.qtyCommitted;
      if (requested.qty > available) throw new Error("unable_to_reserve_stock");

      const standard = allocate(rows.map((row) => ({
        lotId: row.lotId,
        locationId: row.locationId,
        lotStatus: row.lotStatus,
        qtyRemaining: row.qtyRemaining,
        qtyCommitted: row.qtyCommitted,
        receivedAt: row.receivedAt,
        expiryDate: row.expiryDate ? new Date(`${row.expiryDate}T00:00:00.000Z`) : null,
      })), requested.qty, selected.isPerishable);
      if (!standard.ok) throw new Error("unable_to_reserve_stock");
      if (standard.lines.length === 1 &&
          standard.lines[0].lotId === requested.lotId &&
          standard.lines[0].locationId === requested.locationId) {
        throw new Error("override_not_required");
      }

      const now = new Date();
      const [created] = await database.insert(approvalRequests).values({
        idempotencyKey: data.idempotencyKey ?? randomUUID(),
        approvalType: "fifo_override",
        requestedAction: "override_fifo_allocation",
        targetResourceType: "lot_location_balance",
        targetResourceId: selected.balanceId,
        targetSnapshot: {
          item_id: selected.itemId,
          item_code: selected.itemCode,
          lot_id: selected.lotId,
          lot_number: selected.lotNumber,
          location_id: selected.locationId,
          location_code: selected.locationLabel,
          requested_qty: String(requested.qty),
          available_qty_at_request: String(available),
          flow_type: data.flowType,
          actor_user_id: permission.context.userId,
          reason: trimmedReason,
          allocation_version: selected.allocationVersion,
          requested_at: now.toISOString(),
        },
        partyId: data.partyId,
        requesterUserId: permission.context.userId,
        reason: trimmedReason,
        expiryAt: new Date(now.getTime() + 30 * 60 * 1000),
        sourceCommand: "requestFifoOverride",
        sourceReference: selected.balanceId,
      }).returning({ id: approvalRequests.id, requestNumber: approvalRequests.requestNumber });

      return created as { id: string; requestNumber: string };
    });
    if (result.kind === "unauthenticated") return { ok: false, errors: ["forbidden"] };
    return { ok: true, requestId: result.value.id, requestNumber: result.value.requestNumber };
  } catch (error) {
    const code = error instanceof Error ? error.message : "override_request_failed";
    return { ok: false, errors: [code] };
  }
}

// ---------------------------------------------------------------------------
// commitWithdrawal — Stage 1
//
// Validates, checks provisional item codes, then inserts the pick_list,
// pick_list_items, inventory_commitments, and inventory_commitment_lines
// records and reserves each allocated lot/location balance in the same RLS
// transaction. Stage 1 never decrements qty_remaining.
//
// Requires withdrawal.request capability.
// Returns { ok: true, pickListId } on success.
// ---------------------------------------------------------------------------

export async function commitWithdrawal(
  resolver: RequestAuthorizationResolver,
  input: unknown,
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<CommitWithdrawalResult> {
  // Step 1: Authorization — pick_list.generate is required (design.md §6 step 1).
  // 2026-08-08: was "withdrawal.request", an unseeded, unjustified capability
  // that contradicted 05's explicit no-withdrawal-model rule — see
  // outgoing-ledger/page.tsx's note and revision-log.md.
  const perm = await requirePermission(resolver, "pick_list.generate");
  if (perm.kind !== "authorized") {
    return { ok: false, errors: ["forbidden"] };
  }

  const userId = perm.context.userId;

  // Step 2: Input validation (before any DB write — design.md §6 step 3)
  const validation = validateWithdrawal(input);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors };
  }

  const data = validation.data;

  // Step 3: Provisional item code gate (design.md §6 step 4)
  // Must run before any DB write; aborts entire generation if any line is provisional.
  const provisionalLines = data.lines.map((l) => ({
    itemId: l.itemId,
    itemCodeIsProvisional: l.itemCodeIsProvisional === true,
  }));

  const provisionalCheck = checkProvisionalItemCodes(provisionalLines);
  if (!provisionalCheck.ok) {
    return { ok: false, errors: ["provisional_item_code"] };
  }

  let rlsResult;
  try {
    rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;

    // The browser may suggest a quantity, but it must never choose the lots
    // that will be reserved. Rebuild each item's FIFO/FEFO allocation against
    // the current authoritative balances inside this transaction.
    const verifiedLines: Array<AnyRecord> = [];
    const overridePickListId = data.approvalRequestId ? randomUUID() : null;
    if (data.approvalRequestId && data.lines.length !== 1) {
      throw new Error("approval_mismatch");
    }
    const requestedQtyByItem = new Map<string, number>();
    for (const line of data.lines) {
      requestedQtyByItem.set(
        line.itemId,
        (requestedQtyByItem.get(line.itemId) ?? 0) + line.qty,
      );
    }

    for (const [itemId, requestedQty] of requestedQtyByItem) {
      const rows = (await db
        .select({
          balanceId: lotLocationBalances.id,
          qtyRemaining: lotLocationBalances.qtyRemaining,
          qtyCommitted: lotLocationBalances.qtyCommitted,
          allocationVersion: lotLocationBalances.version,
          itemId: items.id,
          itemCode: items.code,
          itemDescription: items.description,
          customerItemCode: items.customerItemCode,
          dsgcItemNumber: items.dsgcItemNumber,
          supplierItemCode: items.supplierItemCode,
          defaultSupplierPartyId: items.defaultSupplierPartyId,
          isPerishable: items.isPerishable,
          spq: items.spq,
          lotId: lots.id,
          lotNumber: lots.lotNumber,
          lotStatus: lots.status,
          lotFlowType: lots.flowType,
          receivedAt: lots.createdAt,
          expiryDate: lots.expiryDate,
          locationId: locations.id,
          locationLabel: locations.label,
        })
        .from(lotLocationBalances)
        .innerJoin(lots, eq(lots.id, lotLocationBalances.lotId))
        .innerJoin(items, eq(items.id, lots.itemId))
        .innerJoin(locations, eq(locations.id, lotLocationBalances.locationId))
        .where(and(
          eq(lots.itemId, itemId),
          eq(lots.status, "available"),
          eq(lots.flowType, data.flowType),
          sql`${lotLocationBalances.qtyRemaining} - ${lotLocationBalances.qtyCommitted} > 0`,
        ))
        .orderBy(asc(lots.expiryDate), asc(lots.createdAt))) as AnyRecord[];

      const item = rows[0];
      if (!item || item.defaultSupplierPartyId !== data.partyId) {
        throw new Error("unable_to_reserve_stock");
      }
      const itemCodeIsProvisional =
        (data.flowType === "trading" || data.flowType === "supplies")
          ? !item.dsgcItemNumber
          : !item.supplierItemCode;
      if (itemCodeIsProvisional) {
        throw new Error("provisional_item_code");
      }

      if (data.approvalRequestId) {
        const requestedLine = data.lines[0];
        const selected = rows.find((row) =>
          row.lotId === requestedLine.lotId && row.locationId === requestedLine.locationId,
        );
        if (!selected || requestedQty !== requestedLine.qty ||
            selected.qtyRemaining - selected.qtyCommitted < requestedQty || !db.execute) {
          throw new Error("approval_mismatch");
        }

        await db.execute(sql`
          select public.consume_fifo_override_approval(
            ${data.approvalRequestId}::uuid,
            ${itemId}::uuid,
            ${selected.lotId}::uuid,
            ${selected.locationId}::uuid,
            ${data.partyId}::uuid,
            ${requestedQty}::integer,
            ${data.flowType}::public.flow_type,
            ${overridePickListId}::uuid
          )
        `);
        verifiedLines.push({ ...selected, qty: requestedQty });
        continue;
      }

      const allocation = allocate(
        rows.map((row) => ({
          lotId: row.lotId,
          locationId: row.locationId,
          lotStatus: row.lotStatus,
          qtyRemaining: row.qtyRemaining,
          qtyCommitted: row.qtyCommitted,
          receivedAt: row.receivedAt,
          expiryDate: row.expiryDate ? new Date(`${row.expiryDate}T00:00:00.000Z`) : null,
        })),
        requestedQty,
        item.isPerishable,
      );
      if (!allocation.ok) {
        throw new Error("unable_to_reserve_stock");
      }

      // A Pick Lists-tab draft names the exact lot/location rows the operator
      // reviewed. It may only commit those sources directly when they are the
      // current FIFO/FEFO allocation; a different source remains an approval
      // path and is never silently substituted or reserved.
      const requestedBySource = new Map<string, number>();
      for (const requestedLine of data.lines.filter((line) => line.itemId === itemId)) {
        const key = `${requestedLine.lotId}:${requestedLine.locationId}`;
        requestedBySource.set(key, (requestedBySource.get(key) ?? 0) + requestedLine.qty);
      }
      const allocatedBySource = new Map<string, number>();
      for (const allocatedLine of allocation.lines) {
        const key = `${allocatedLine.lotId}:${allocatedLine.locationId}`;
        allocatedBySource.set(key, (allocatedBySource.get(key) ?? 0) + allocatedLine.qtyAllocated);
      }
      const sourceSelectionMatchesPlan =
        requestedBySource.size === allocatedBySource.size &&
        [...allocatedBySource.entries()].every(([key, qty]) => requestedBySource.get(key) === qty);
      if (data.enforceSourceSelection && !sourceSelectionMatchesPlan) {
        throw new Error("fifo_override_required");
      }

      for (const allocatedLine of allocation.lines) {
        const source = rows.find(
          (row) =>
            row.lotId === allocatedLine.lotId &&
            row.locationId === allocatedLine.locationId,
        );
        if (!source) throw new Error("unable_to_reserve_stock");
        verifiedLines.push({ ...source, qty: allocatedLine.qtyAllocated });
      }
    }

    // Step 4: Insert pick_list record (design.md §6 step 6)
    // TODO: consume pricing snapshot from 13/12 before finalizing pick_list_items.
    const pickListNumber = `PL-${Date.now()}`;

    const [insertedPickList] = await db
      .insert(pickLists)
      .values({
        ...(overridePickListId ? { id: overridePickListId } : {}),
        pickListNumber,
        customerPartyId: data.partyId,
        flowType: data.flowType,
        status: "allocated",
      })
      .returning();

    const pickListId = (insertedPickList as { id: string }).id;

    // Commitment TTL — 24 hours from creation, computed server-side (design.md
    // §6; revision-log.md "Pick-list expiry enforcement: Option C"; Product
    // Owner decision). A client-supplied expiresAt on the input, if present,
    // is never read here — it has no effect on this computed value.
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const [insertedCommitment] = await db
      .insert(inventoryCommitments)
      .values({
        commitmentNumber: `CMT-${Date.now()}`,
        pickListId,
        status: "active",
        expiresAt,
        createdByUserId: userId,
      })
      .returning();
    const commitmentId = (insertedCommitment as { id: string }).id;

    // Insert a pick-list snapshot then reserve precisely the same lot/location
    // row. The conditional update protects the qty_committed <= qty_remaining
    // invariant under concurrent requests.
    for (const line of verifiedLines) {
      const [insertedPickListItem] = await db
        .insert(pickListItems)
        .values({
          pickListId,
          itemId: line.itemId,
          itemCode: line.itemCode,
          customerItemCode: line.customerItemCode,
          itemDescription: line.itemDescription,
          lotId: line.lotId,
          lotNumber: line.lotNumber,
          locationId: line.locationId,
          locationLabel: line.locationLabel,
          qty: line.qty,
          spq: line.spq,
          // Pick-list quantities are entered and reserved as physical boxes.
          // SPQ describes pieces per box for display/reporting; it must not
          // reduce the number of QR-labelled boxes required at dispatch.
          numberOfBoxes: line.qty,
        })
        .returning();
      const pickListItemId = (insertedPickListItem as { id: string }).id;

      const reserved = await db
        .update(lotLocationBalances)
        .set({
          qtyCommitted: sql`${lotLocationBalances.qtyCommitted} + ${line.qty}`,
          version: sql`${lotLocationBalances.version} + 1`,
          updatedAt: new Date(),
        })
        .where(and(
          eq(lotLocationBalances.id, line.balanceId),
          sql`${lotLocationBalances.qtyRemaining} - ${lotLocationBalances.qtyCommitted} >= ${line.qty}`,
        ))
        .returning({ id: lotLocationBalances.id });

      if (reserved.length !== 1) {
        throw new Error("insufficient_stock");
      }

      await db
        .insert(inventoryCommitmentLines)
        .values({
          commitmentId,
          pickListItemId,
          lotLocationBalanceId: reserved[0].id,
          qtyCommitted: line.qty,
          qtyExecuted: 0,
          status: "active",
        })
        .returning();
    }

    // Step 8: Document generation trigger — spec 10 (design.md §6 step 7).
    // Intentionally outside the commitment transaction; failure must not roll back
    // the inventory reservation. generate_document_number acquires a row-level
    // lock on document_number_sequences so the sequence is atomic.
    try {
      const numRows = (await db.execute!(
        sql`SELECT generate_document_number('pick_list')`,
      )) as Array<{ generate_document_number: string }>;
      const documentNumber = numRows[0].generate_document_number;
      await db
        .insert(generatedDocuments)
        .values({
          documentType: "pick_list",
          documentNumber,
          templateVersion: "1.0",
          sourceType: "inventory_commitment",
          sourceId: commitmentId,
          snapshotHash: hashSnapshot({ pickListId, commitmentId, lines: data.lines }),
          status: "pending",
          systemExecutor: "commitWithdrawal",
        });
    } catch {
      // Non-fatal — visual/print generation failing does not undo the stock reservation.
    }

    // Return authoritative pick-list reference (design.md §6 step 7)
    return { ok: true, pickListId } as const;
    });
  } catch (error) {
    console.error("Pick-list reservation failed", error);
    const message = error instanceof Error ? error.message : "";
    const approvalError = [
      "approval_unavailable",
      "approval_mismatch",
      "approval_stale",
      "approval_consumed",
      "approval_forbidden",
    ].find((code) => message.includes(code));
    return {
      ok: false,
      errors: [
        message === "provisional_item_code"
          ? "provisional_item_code"
          : approvalError ?? "unable_to_reserve_stock",
      ],
    };
  }

  if (rlsResult.kind === "unauthenticated") {
    return { ok: false, errors: ["forbidden"] };
  }
  return rlsResult.value;
}

// ---------------------------------------------------------------------------
// Exact physical-box selection
// ---------------------------------------------------------------------------

function unitIdFromScan(rawBarcode: string): string | null {
  const parsed = parseWrrUnitPayload(rawBarcode);
  if (parsed) return parsed.unit_id;

  const trimmed = rawBarcode.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)
    ? trimmed.toLowerCase()
    : null;
}

/** Records one exact physical box scan for one exact lot/location dispatch line. */
export async function selectPickUnit(
  resolver: RequestAuthorizationResolver,
  pickListId: string,
  pickListItemId: string,
  rawBarcode: string,
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<SelectPickUnitResult> {
  const perm = await requirePermission(resolver, "dispatch.execute");
  if (perm.kind !== "authorized") return { ok: false, errors: ["forbidden"] };

  const unitId = unitIdFromScan(rawBarcode);
  if (!unitId) return { ok: false, errors: ["invalid_box_qr"] };

  try {
    const rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
      const db = tx.db as DbLike;
      const lineRows = (await db
        .select({
          id: pickListItems.id,
          lotId: pickListItems.lotId,
          locationId: pickListItems.locationId,
          numberOfBoxes: pickListItems.numberOfBoxes,
          pickListStatus: pickLists.status,
        })
        .from(pickListItems)
        .innerJoin(pickLists, eq(pickLists.id, pickListItems.pickListId))
        .where(and(eq(pickListItems.id, pickListItemId), eq(pickLists.id, pickListId)))
        .limit(1)) as AnyRecord[];

      if (lineRows.length === 0) return { ok: false as const, errors: ["line_not_found"] };
      const line = lineRows[0];
      if (line.pickListStatus !== "picked") {
        return { ok: false as const, errors: ["invalid_status"] };
      }

      const unitRows = (await db
        .select({
          id: inventoryUnits.id,
          lotId: inventoryUnits.lotId,
          locationId: inventoryUnits.locationId,
          status: inventoryUnits.status,
          pickListItemId: inventoryUnits.pickListItemId,
        })
        .from(inventoryUnits)
        .where(eq(inventoryUnits.unitId, unitId))
        .limit(1)) as AnyRecord[];

      if (unitRows.length === 0) return { ok: false as const, errors: ["box_not_found"] };
      const unit = unitRows[0];
      if (unit.lotId !== line.lotId) return { ok: false as const, errors: ["wrong_lot"] };
      if (unit.locationId !== line.locationId) {
        return { ok: false as const, errors: ["wrong_box_location"] };
      }
      if (unit.pickListItemId === pickListItemId && unit.status === "selected") {
        return { ok: false as const, errors: ["duplicate_box_scan"] };
      }
      if (unit.status !== "available" || unit.pickListItemId) {
        return { ok: false as const, errors: ["box_unavailable"] };
      }

      const selectedRows = (await db
        .select({ id: inventoryUnits.id })
        .from(inventoryUnits)
        .where(and(
          eq(inventoryUnits.pickListItemId, pickListItemId),
          eq(inventoryUnits.status, "selected"),
        ))) as AnyRecord[];
      const requiredCount = Number(line.numberOfBoxes);
      if (selectedRows.length >= requiredCount) {
        return { ok: false as const, errors: ["line_complete"] };
      }

      const updated = (await db
        .update(inventoryUnits)
        .set({ status: "selected", pickListItemId, updatedAt: new Date() })
        .where(and(eq(inventoryUnits.id, unit.id), eq(inventoryUnits.status, "available")))
        .returning({ id: inventoryUnits.id })) as AnyRecord[];
      if (updated.length !== 1) return { ok: false as const, errors: ["box_unavailable"] };

      return {
        ok: true as const,
        selectedCount: selectedRows.length + 1,
        requiredCount,
      };
    });

    if (rlsResult.kind === "unauthenticated") return { ok: false, errors: ["forbidden"] };
    return rlsResult.value;
  } catch (error) {
    console.error("Exact box selection failed", error);
    return { ok: false, errors: ["unable_to_select_box"] };
  }
}

/** Marks the non-scan physical staging step complete and advances to dispatch. */
export async function completeExactPick(
  resolver: RequestAuthorizationResolver,
  pickListId: string,
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<MarkPickListPickedResult> {
  const perm = await requirePermission(resolver, "pick_list.execute");
  if (perm.kind !== "authorized") return { ok: false, errors: ["forbidden"] };

  try {
    const rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
      const db = tx.db as DbLike;
      const headerRows = (await db
        .select({ status: pickLists.status })
        .from(pickLists)
        .where(eq(pickLists.id, pickListId))
        .limit(1)) as AnyRecord[];
      if (headerRows.length === 0) return { ok: false as const, errors: ["not_found"] };
      if (headerRows[0].status !== "allocated") {
        return { ok: false as const, errors: ["invalid_status"] };
      }

      const lineRows = (await db
        .select({ id: pickListItems.id })
        .from(pickListItems)
        .where(eq(pickListItems.pickListId, pickListId))) as Array<{ id: string }>;
      if (lineRows.length === 0) return { ok: false as const, errors: ["no_pick_lines"] };

      await db
        .update(pickLists)
        .set({ status: "picked", updatedAt: new Date() })
        .where(and(eq(pickLists.id, pickListId), eq(pickLists.status, "allocated")));
      return { ok: true as const };
    });

    if (rlsResult.kind === "unauthenticated") return { ok: false, errors: ["forbidden"] };
    return rlsResult.value;
  } catch (error) {
    console.error("Exact pick completion failed", error);
    return { ok: false, errors: ["unable_to_complete_pick"] };
  }
}

// ---------------------------------------------------------------------------
// markPickListPicked — Stage 1 floor completion marker
//
// Compatibility entry point for older callers. Browser-supplied line IDs do
// not establish physical identity; scans are recorded later at dispatch.
// ---------------------------------------------------------------------------

export async function markPickListPicked(
  resolver: RequestAuthorizationResolver,
  pickListId: string,
  _confirmedPickListItemIds: string[],
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<MarkPickListPickedResult> {
  return completeExactPick(resolver, pickListId, rlsDeps);
}

// ---------------------------------------------------------------------------
// dispatchPickList — Stage 2
//
// Verifies commitment, transitions pick_list to dispatched, updates commitment
// to executed, and inserts the immutable inventory_transactions pick row.
//
// Requires dispatch.execute capability.
// Returns { ok: false, errors: ['not_found'] } when the pick list is missing.
// Returns { ok: false, errors: ['already_dispatched'] } for idempotency guard.
// ---------------------------------------------------------------------------

export async function dispatchPickList(
  resolver: RequestAuthorizationResolver,
  pickListId: string,
  scannedPickListItemIds: string[],
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<DispatchPickListResult> {
  // Step 1: Authorization — dispatch.execute required (design.md §7).
  // 2026-08-08: was "withdrawal.execute" — see commitWithdrawal's note above.
  const perm = await requirePermission(resolver, "dispatch.execute");
  if (perm.kind !== "authorized") {
    return { ok: false, errors: ["forbidden"] };
  }

  const userId = perm.context.userId;

  // The whole withRlsTransaction call is wrapped so this function can
  // recognize the specific ConcurrentModificationError thrown by the
  // lot_location_balances CAS-guard update below (a lost race with a
  // concurrent dispatch of a different pick list) and translate it into a
  // named, recoverable result. withRlsTransaction itself has already rolled
  // the transaction back (its own guaranteed catch/rollback/rethrow) by the
  // time this catch runs — see that error class's own comment. Any other
  // thrown error (e.g. a genuine constraint violation) is not this
  // function's to interpret and is rethrown unchanged, preserving the
  // existing "mid-loop failure rejects the whole dispatchPickList call"
  // contract for every other failure mode.
  let rlsResult: RlsTransactionResult<DispatchPickListResult>;
  try {
    rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
      const db = tx.db as DbLike;

      // Step 2: Load pick list — verify it exists (design.md §7 dispatch disposition).
      // SELECT ... FOR UPDATE: without this, two genuinely concurrent
      // dispatchPickList calls for the SAME pick list can both read
      // status !== 'dispatched' before either commits, both pass the Step 3
      // idempotency guard below, and both proceed to write a second, duplicate
      // 'pick' inventory_transactions row — the atomic per-line balance guard
      // further down prevents stock from going negative, but does not prevent
      // that duplicate-ledger-row outcome on its own. The row lock serializes
      // this: the second call blocks until the first transaction's writes
      // (through Step 6's status transition to 'dispatched') commit or roll
      // back, then re-reads status = 'dispatched' and correctly hits the
      // idempotency guard instead of racing past it.
      const rows = (await db
        .select({
          id: pickLists.id,
          status: pickLists.status,
          customerPartyId: pickLists.customerPartyId,
          flowType: pickLists.flowType,
        })
        .from(pickLists)
        .where(eq(pickLists.id, pickListId))
        .limit(1)
        .for("update")) as AnyRecord[];

      if (rows.length === 0) {
        return { ok: false as const, errors: ["not_found"] };
      }

      const pickList = rows[0];

      // Step 3: Idempotency guard — duplicate/lost-response protection (R7.6)
      if (pickList.status === "dispatched") {
        return { ok: false as const, errors: ["already_dispatched"] };
      }
      // fix-it-felix (exact-box picking, spec 08 R3.3 2026-08-24): dispatch
      // may only proceed once the pick stage has been explicitly completed
      // (markPickListPicked / completeExactPick transitions status to
      // 'picked'), not merely "not yet dispatched" — this is what guarantees
      // the exact-box-count check below is checking a state that was
      // actually finalized, not a still-in-progress pick.
      if (pickList.status !== "picked") {
        return { ok: false as const, errors: ["pick_not_completed"] };
      }

      // Step 4a: Load pick_list_items — one row per requested line, iterated
      // below per design.md §7's per-line "for each affected row" framing.
      const items = (await db
        .select({
          id: pickListItems.id,
          itemId: pickListItems.itemId,
          lotId: pickListItems.lotId,
          locationId: pickListItems.locationId,
          qty: pickListItems.qty,
          numberOfBoxes: pickListItems.numberOfBoxes,
        })
        .from(pickListItems)
        .where(eq(pickListItems.pickListId, pickListId))) as AnyRecord[];

      // Step 4b: Load the parent inventory_commitments header for this pick
      // list (exactly one per pick list — see commitments.ts's unique
      // pick_list_id). expiresAt is loaded here for the reservation-state
      // recheck below.
      const commitmentRows = (await db
        .select({
          id: inventoryCommitments.id,
          status: inventoryCommitments.status,
          expiresAt: inventoryCommitments.expiresAt,
        })
        .from(inventoryCommitments)
        .where(eq(inventoryCommitments.pickListId, pickListId))
        .limit(1)) as AnyRecord[];

      const commitmentId = (commitmentRows[0] as { id?: string } | undefined)
        ?.id;

      // Invariant guard: commitWithdrawal (Stage 1) always creates exactly one
      // inventory_commitments row per pick_list before pick_list_items is
      // considered committable. If execution reaches this point — past the
      // not_found and already_dispatched guards above — a pick list with no
      // matching commitment row is a genuine data-integrity violation, not a
      // recoverable/optional case.
      if (!commitmentId) {
        return { ok: false as const, errors: ["commitment_not_found"] };
      }

      // Reservation-state recheck (design.md §7) — a commitment past its 24h
      // TTL is rejected here, in real time, rather than being allowed to
      // proceed to the physical dispatch writes below. This is the same
      // `expired` transition the nightly pg_cron sweep (expire_stale_commitments)
      // writes for commitments that are never attempted; this real-time path is
      // the primary enforcer, the sweep is the safety net (revision-log.md
      // "Pick-list expiry enforcement: Option C").
      const commitmentExpiresAt = commitmentRows[0].expiresAt as
        | Date
        | string
        | null;
      if (
        commitmentExpiresAt &&
        new Date(commitmentExpiresAt).getTime() < Date.now()
      ) {
        // Release every reserved balance back to its pre-reservation state —
        // stock never left the shelf, only the reservation is undone.
        for (const line of items) {
          const commitLineRows = (await db
            .select({
              id: inventoryCommitmentLines.id,
              balanceId: inventoryCommitmentLines.lotLocationBalanceId,
              qtyCommitted: inventoryCommitmentLines.qtyCommitted,
            })
            .from(inventoryCommitmentLines)
            .where(
              and(
                eq(inventoryCommitmentLines.commitmentId, commitmentId),
                eq(inventoryCommitmentLines.pickListItemId, line.id),
              ),
            )
            .limit(1)) as AnyRecord[];
          const commitLine = commitLineRows[0] as AnyRecord | undefined;
          if (!commitLine) continue;

          await db
            .update(lotLocationBalances)
            .set({
              qtyCommitted: sql`${lotLocationBalances.qtyCommitted} - ${commitLine.qtyCommitted}`,
              version: sql`${lotLocationBalances.version} + 1`,
              updatedAt: new Date(),
            })
            .where(and(
              eq(lotLocationBalances.id, commitLine.balanceId),
              sql`${lotLocationBalances.qtyCommitted} >= ${commitLine.qtyCommitted}`,
            ));

          await db
            .update(inventoryCommitmentLines)
            .set({ status: "expired", updatedAt: new Date() })
            .where(eq(inventoryCommitmentLines.id, commitLine.id));
        }

        await db
          .update(inventoryCommitments)
          .set({ status: "expired", releasedAt: new Date(), updatedAt: new Date() })
          .where(eq(inventoryCommitments.id, commitmentId));

        // No dispatch/pick transaction is written — the reservation is gone,
        // not executed.
        return { ok: false as const, errors: ["commitment_expired"] };
      }

      // Scan-evidence completeness (design.md §7, R7.2) — the caller must
      // have confirmed every committed line was physically scanned before
      // dispatch proceeds; a partial scan set is rejected outright rather
      // than dispatching only the confirmed lines.
      const scanned = new Set(scannedPickListItemIds);
      if (
        items.some((line) => !scanned.has(line.id)) ||
        scanned.size !== items.length
      ) {
        return { ok: false as const, errors: ["scan_evidence_incomplete"] };
      }

      // Exact-box-count completeness (fix-it-felix, spec 08 R3.3 2026-08-24):
      // scan evidence above confirms every LINE was addressed; this confirms
      // the RIGHT NUMBER of specific physical boxes (durable inventory_units
      // rows) was selected for each line during picking — a line with
      // numberOfBoxes = 3 must have exactly 3 'selected' inventory_units rows
      // pointing at its pick_list_item_id, no more, no fewer.
      const selectedUnitRows = (await db
        .select({ pickListItemId: inventoryUnits.pickListItemId })
        .from(inventoryUnits)
        .where(and(
          inArray(inventoryUnits.pickListItemId, items.map((line) => line.id)),
          eq(inventoryUnits.status, "selected"),
        ))) as Array<{ pickListItemId: string | null }>;
      const selectedCounts = new Map<string, number>();
      for (const row of selectedUnitRows) {
        if (row.pickListItemId) {
          selectedCounts.set(
            row.pickListItemId,
            (selectedCounts.get(row.pickListItemId) ?? 0) + 1,
          );
        }
      }
      if (
        items.some(
          (line) => (selectedCounts.get(line.id) ?? 0) !== line.numberOfBoxes,
        )
      ) {
        return { ok: false as const, errors: ["scan_evidence_incomplete"] };
      }

      const insertedTransactions: AnyRecord[] = [];

      // Steps 1-3, 5 (design.md §7): for each pick_list_items line, atomically
      // decrement the affected lot_location_balances row, transition its
      // inventory_commitment_line to 'executed', and insert one immutable
      // inventory_transactions 'pick' row carrying that line's own real data
      // (never a placeholder/aggregate row).
      for (let i = 0; i < items.length; i++) {
        const line = items[i];

        // Resolve the affected lot_location_balances row for this line.
        const balanceRows = (await db
          .select({
            id: lotLocationBalances.id,
            qtyRemaining: lotLocationBalances.qtyRemaining,
            qtyCommitted: lotLocationBalances.qtyCommitted,
          })
          .from(lotLocationBalances)
          .where(
            and(
              eq(lotLocationBalances.lotId, line.lotId),
              eq(lotLocationBalances.locationId, line.locationId),
            ),
          )
          .limit(1)) as AnyRecord[];
        const balance = balanceRows[0] as AnyRecord;

        // Resolve the matching inventory_commitment_line for this pick_list_item.
        // commitmentId is guaranteed resolved here — see the invariant guard above.
        const commitLineRows = (await db
          .select({ id: inventoryCommitmentLines.id })
          .from(inventoryCommitmentLines)
          .where(
            and(
              eq(inventoryCommitmentLines.commitmentId, commitmentId),
              eq(inventoryCommitmentLines.pickListItemId, line.id),
            ),
          )
          .limit(1)) as AnyRecord[];
        const commitLine = commitLineRows[0] as AnyRecord;

        // Step 1: decrement qty_remaining by the executed quantity.
        // Step 2: decrement qty_committed by the same quantity (releases the
        // reservation) — both on the same lot_location_balances row, in the
        // same atomic transaction as every other line's work.
        //
        // Optimistic-concurrency guard: the WHERE clause re-asserts the exact
        // qty_remaining/qty_committed values just read, so if another
        // transaction already changed this row in between (a concurrent
        // dispatch of a DIFFERENT pick list drawing the same lot/location —
        // not serialized by the pick_lists row lock above, which only
        // protects against two dispatches of the SAME pick list), Postgres's
        // row-level locking makes this UPDATE block until that transaction
        // commits, then re-evaluate this WHERE clause against the
        // now-committed row — which no longer matches, so this UPDATE safely
        // affects zero rows instead of silently overwriting the other
        // transaction's decrement (a lost update).
        //
        // An UPDATE with no `.returning()` chained resolves (real postgres-js
        // driver) to an array-like carrying the driver's own `.count` of
        // affected rows. Zero rows affected without a thrown error is a lost
        // race, not a genuine success — thrown here so the whole transaction
        // rolls back via withRlsTransaction's guaranteed catch, translated by
        // this function's own try/catch (below) into a named
        // { ok: false, errors: ["concurrent_modification"] } result.
        const balanceUpdateResult = await db
          .update(lotLocationBalances)
          .set({
            qtyRemaining: balance.qtyRemaining - line.qty,
            qtyCommitted: balance.qtyCommitted - line.qty,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(lotLocationBalances.id, balance.id),
              eq(lotLocationBalances.qtyRemaining, balance.qtyRemaining),
              eq(lotLocationBalances.qtyCommitted, balance.qtyCommitted),
            ),
          );

        const balanceUpdateAffectedCount = (
          balanceUpdateResult as { count?: number } | undefined
        )?.count;

        if (balanceUpdateAffectedCount === 0) {
          throw new ConcurrentModificationError(
            `lot_location_balances CAS guard matched zero rows for balance id ` +
              `${balance.id} (lost race with a concurrent dispatch of a ` +
              `different pick list touching the same balance row)`,
          );
        }

        // Step 3: transition the inventory_commitment_line to 'executed' and
        // set qty_executed to the executed quantity.
        await db
          .update(inventoryCommitmentLines)
          .set({
            status: "executed",
            qtyExecuted: line.qty,
            updatedAt: new Date(),
          })
          .where(eq(inventoryCommitmentLines.id, commitLine.id));

        // fix-it-felix (exact-box picking): the specific physical boxes
        // selected for this line during picking are now physically leaving
        // the warehouse — transition their durable inventory_units rows from
        // 'selected' to 'dispatched', closing out the per-box lifecycle this
        // same transaction's exact-box-count check above required.
        await db
          .update(inventoryUnits)
          .set({ status: "dispatched", updatedAt: new Date() })
          .where(and(
            eq(inventoryUnits.pickListItemId, line.id),
            eq(inventoryUnits.status, "selected"),
          ));

        // Step 5: insert the immutable inventory_transactions pick row for
        // this line. pick_list_id is the symmetric link to the customer party
        // per design.md §7.
        const transactionNumber = `TXN-${Date.now()}-${i}`;
        const [insertedTransaction] = (await db
          .insert(inventoryTransactions)
          .values({
            transactionNumber,
            lotId: line.lotId,
            itemId: line.itemId,
            movementType: "pick",
            fromLocationId: line.locationId,
            qty: line.qty,
            flowType: pickList.flowType,
            pickListId,
            performedByUserId: userId,
          })
          .returning()) as AnyRecord[];

        insertedTransactions.push(insertedTransaction);
      }

      // Step 4: transition the inventory_commitments header to 'executed' and
      // stamp completed_at, once every line above has been executed.
      await db
        .update(inventoryCommitments)
        .set({
          status: "executed",
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(inventoryCommitments.id, commitmentId));

      // Step 6: transition the pick_list to 'dispatched' (design.md §7 step 6).
      // This intentionally happens only after every line above has succeeded —
      // a mid-loop failure above must never leave a partially-dispatched
      // pick_list status; the guaranteed rollback in withRlsTransaction is what
      // makes the whole per-line loop atomic.
      await db
        .update(pickLists)
        .set({ status: "dispatched", updatedAt: new Date() })
        .where(eq(pickLists.id, pickListId));

      // Step 7: Document generation trigger — spec 10 (design.md §7 step 7).
      // Intentionally outside the dispatch transaction; failure must not roll back
      // the stock movement. sourceType/sourceId use inventory_transactions.id
      // (the dispatched pick movement), per 10/design.md's resolved source
      // reference contract for the acknowledgement receipt — the last line's
      // transaction stands in for the whole dispatch event; the full set of
      // transaction ids is still captured in the snapshot hash below for audit.
      try {
        const lastTransaction = insertedTransactions[insertedTransactions.length - 1] as
          | { id: string }
          | undefined;
        if (!lastTransaction) throw new Error("missing_dispatch_transaction");
        const transactionId = lastTransaction.id;
        const numRows = (await db.execute!(
          sql`SELECT generate_document_number('acknowledgement_receipt')`,
        )) as Array<{ generate_document_number: string }>;
        const documentNumber = numRows[0].generate_document_number;
        await db
          .insert(generatedDocuments)
          .values({
            documentType: "acknowledgement_receipt",
            documentNumber,
            templateVersion: "1.0",
            sourceType: "inventory_transaction",
            sourceId: transactionId,
            snapshotHash: hashSnapshot({
              pickListId,
              commitmentId,
              transactionIds: insertedTransactions.map(
                (t) => (t as { id: string }).id,
              ),
            }),
            status: "pending",
            systemExecutor: "dispatchPickList",
          });
      } catch {
        // Non-fatal — document generation failure does not roll back the stock movement.
      }

      return { ok: true as const };
    });
  } catch (error) {
    if (error instanceof ConcurrentModificationError) {
      return { ok: false, errors: ["concurrent_modification"] };
    }
    console.error("Pick-list dispatch failed", error);
    return { ok: false, errors: ["dispatch_stock_conflict"] };
  }

  if (rlsResult.kind === "unauthenticated") {
    return { ok: false, errors: ["forbidden"] };
  }
  return rlsResult.value;
}

// ---------------------------------------------------------------------------
// listOutgoingLedger — read-only action wrapper
//
// Requires pick_list.read capability.
// Delegates data fetching to the query layer.
// ---------------------------------------------------------------------------

export async function listOutgoingLedger(
  resolver: RequestAuthorizationResolver,
  opts: { limit: number; offset: number },
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<ListOutgoingLedgerResult> {
  // Authorization — pick_list.read required (R9.1, R10.1).
  // 2026-08-08: was "withdrawal.view" — see commitWithdrawal's note above.
  const perm = await requirePermission(resolver, "pick_list.read");
  if (perm.kind !== "authorized") {
    return { ok: false, errors: ["forbidden"] };
  }

  const rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;
    // Delegate to query layer
    const { rows, total } = await queryListOutgoingLedger(db, opts);
    return { rows, total };
  });

  if (rlsResult.kind === "unauthenticated") {
    return { ok: false, errors: ["forbidden"] };
  }
  return rlsResult.value;
}

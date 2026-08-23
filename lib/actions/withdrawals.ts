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
import type { RlsTransactionDeps } from "@/lib/db/rls-transaction";
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

    const [insertedCommitment] = await db
      .insert(inventoryCommitments)
      .values({
        commitmentNumber: `CMT-${Date.now()}`,
        pickListId,
        status: "active",
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
          numberOfBoxes: Math.ceil(line.qty / line.spq),
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

/** Selects one exact physical box for one exact lot/location pick line. */
export async function selectPickUnit(
  resolver: RequestAuthorizationResolver,
  pickListId: string,
  pickListItemId: string,
  rawBarcode: string,
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<SelectPickUnitResult> {
  const perm = await requirePermission(resolver, "pick_list.execute");
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
      if (line.pickListStatus !== "allocated") {
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

/** Advances to dispatch only after every line has its required physical boxes. */
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
        .select({ id: pickListItems.id, numberOfBoxes: pickListItems.numberOfBoxes })
        .from(pickListItems)
        .where(eq(pickListItems.pickListId, pickListId))) as Array<{
          id: string;
          numberOfBoxes: number;
        }>;
      if (lineRows.length === 0) return { ok: false as const, errors: ["no_pick_lines"] };

      const selectedRows = (await db
        .select({ pickListItemId: inventoryUnits.pickListItemId })
        .from(inventoryUnits)
        .where(and(
          inArray(inventoryUnits.pickListItemId, lineRows.map((line) => line.id)),
          eq(inventoryUnits.status, "selected"),
        ))) as Array<{ pickListItemId: string | null }>;
      const selectedCounts = new Map<string, number>();
      for (const row of selectedRows) {
        if (row.pickListItemId) {
          selectedCounts.set(row.pickListItemId, (selectedCounts.get(row.pickListItemId) ?? 0) + 1);
        }
      }
      if (lineRows.some((line) => (selectedCounts.get(line.id) ?? 0) !== line.numberOfBoxes)) {
        return { ok: false as const, errors: ["box_scans_incomplete"] };
      }

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
// Compatibility entry point for older callers. Browser-supplied line IDs no
// longer count as physical evidence; completion delegates to the durable
// exact-box validation above.
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

  let rlsResult;
  try {
    rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;

    // Step 2: Load pick list — verify it exists (design.md §7 dispatch disposition)
    const rows = (await db
      .select({
        id: pickLists.id,
        status: pickLists.status,
        customerPartyId: pickLists.customerPartyId,
        flowType: pickLists.flowType,
      })
      .from(pickLists)
      .where(eq(pickLists.id, pickListId))
      .limit(1)) as AnyRecord[];

    if (rows.length === 0) {
      return { ok: false as const, errors: ["not_found"] };
    }

    const pickList = rows[0];

    // Step 3: Idempotency guard — duplicate/lost-response protection (R7.6)
    if (pickList.status === "dispatched") {
      return { ok: false as const, errors: ["already_dispatched"] };
    }
    if (pickList.status !== "picked") {
      return { ok: false as const, errors: ["pick_not_completed"] };
    }

    // Step 4: Re-load the active reservation lines. These, not browser state,
    // are the authoritative instructions for a dispatch.
    const commitmentLines = (await db
      .select({
        commitmentId: inventoryCommitments.id,
        commitmentStatus: inventoryCommitments.status,
        commitmentLineId: inventoryCommitmentLines.id,
        commitmentLineStatus: inventoryCommitmentLines.status,
        qtyCommitted: inventoryCommitmentLines.qtyCommitted,
        balanceId: inventoryCommitmentLines.lotLocationBalanceId,
        pickListItemId: pickListItems.id,
        itemId: pickListItems.itemId,
        lotId: pickListItems.lotId,
        locationId: pickListItems.locationId,
      })
      .from(inventoryCommitments)
      .innerJoin(
        inventoryCommitmentLines,
        eq(inventoryCommitmentLines.commitmentId, inventoryCommitments.id),
      )
      .innerJoin(
        pickListItems,
        eq(pickListItems.id, inventoryCommitmentLines.pickListItemId),
      )
      .where(eq(inventoryCommitments.pickListId, pickListId))) as AnyRecord[];

    if (
      commitmentLines.length === 0 ||
      commitmentLines.some((line) =>
        line.commitmentStatus !== "active" || line.commitmentLineStatus !== "active",
      )
    ) {
      return { ok: false as const, errors: ["invalid_commitment"] };
    }

    const scanned = new Set(scannedPickListItemIds);
    if (
      commitmentLines.some((line) => !scanned.has(line.pickListItemId)) ||
      scanned.size !== commitmentLines.length
    ) {
      return { ok: false as const, errors: ["scan_evidence_incomplete"] };
    }

    let lastTransactionId: string | null = null;
    for (const line of commitmentLines) {
      // Both decrement and release happen in the same guarded write. A stale
      // reservation cannot create a movement or take stock below zero.
      const updatedBalances = await db
        .update(lotLocationBalances)
        .set({
          qtyRemaining: sql`${lotLocationBalances.qtyRemaining} - ${line.qtyCommitted}`,
          qtyCommitted: sql`${lotLocationBalances.qtyCommitted} - ${line.qtyCommitted}`,
          version: sql`${lotLocationBalances.version} + 1`,
          updatedAt: new Date(),
        })
        .where(and(
          eq(lotLocationBalances.id, line.balanceId),
          sql`${lotLocationBalances.qtyRemaining} >= ${line.qtyCommitted}`,
          sql`${lotLocationBalances.qtyCommitted} >= ${line.qtyCommitted}`,
        ))
        .returning({ id: lotLocationBalances.id });

      if (updatedBalances.length !== 1) {
        throw new Error("dispatch_stock_conflict");
      }

      await db
        .update(inventoryCommitmentLines)
        .set({
          qtyExecuted: line.qtyCommitted,
          status: "executed",
          updatedAt: new Date(),
        })
        .where(eq(inventoryCommitmentLines.id, line.commitmentLineId));

      await db
        .update(inventoryUnits)
        .set({ status: "dispatched", updatedAt: new Date() })
        .where(and(
          eq(inventoryUnits.pickListItemId, line.pickListItemId),
          eq(inventoryUnits.status, "selected"),
        ));

      const [transaction] = (await db
        .insert(inventoryTransactions)
        .values({
          // transaction_number is varchar(50). Date.now() plus the first UUID
          // segment is sufficiently unique for this per-line dispatch while
          // remaining safely within the persisted business identifier limit.
          transactionNumber: `TXN-${Date.now()}-${line.commitmentLineId.slice(0, 8)}`,
          lotId: line.lotId,
          itemId: line.itemId,
          movementType: "pick",
          qty: line.qtyCommitted,
          fromLocationId: line.locationId,
          flowType: pickList.flowType,
          pickListId,
          performedByUserId: userId,
        })
        .returning()) as AnyRecord[];
      lastTransactionId = transaction.id;
    }

    await db
      .update(inventoryCommitments)
      .set({ status: "executed", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(inventoryCommitments.id, commitmentLines[0].commitmentId));

    // The status transition comes after all balance and ledger writes, so an
    // Active Pick never disappears before its inventory movement is durable.
    await db
      .update(pickLists)
      .set({ status: "dispatched", updatedAt: new Date() })
      .where(eq(pickLists.id, pickListId));

    // Step 7: Document generation trigger — spec 10 (design.md §7 step 7).
    // Intentionally outside the dispatch transaction; failure must not roll back
    // the stock movement.
    try {
      const transactionId = lastTransactionId;
      if (!transactionId) throw new Error("missing_dispatch_transaction");
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
          snapshotHash: hashSnapshot({ pickListId, transactionId }),
          status: "pending",
          systemExecutor: "dispatchPickList",
        });
    } catch {
      // Non-fatal — document generation failure does not roll back the stock movement.
    }

    return { ok: true as const };
    });
  } catch (error) {
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

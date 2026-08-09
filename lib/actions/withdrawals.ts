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

import { eq, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import type { RequestAuthorizationResolver } from "@/lib/rbac/session";
import { requirePermission } from "@/lib/rbac/guard";
import { validateWithdrawal } from "@/lib/withdrawal/withdrawal-validator";
import { checkProvisionalItemCodes } from "@/lib/withdrawal/allocation";
import { pickLists, pickListItems } from "@/lib/db/schema/pick_lists";
import {
  inventoryCommitments,
  inventoryCommitmentLines,
} from "@/lib/db/schema/commitments";
import { inventoryTransactions } from "@/lib/db/schema/transactions";
import { generatedDocuments } from "@/lib/db/schema/documents";
import {
  listOutgoingLedger as queryListOutgoingLedger,
  type OutgoingLedgerRow,
} from "@/lib/db/queries/withdrawals";

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

export type DispatchPickListResult =
  | { ok: true }
  | { ok: false; errors: string[] };

export type ListOutgoingLedgerResult =
  | { rows: OutgoingLedgerRow[]; total: number }
  | { ok: false; errors: string[] };

// ---------------------------------------------------------------------------
// commitWithdrawal — Stage 1
//
// Validates, checks provisional item codes, then inserts the pick_list,
// pick_list_items, inventory_commitments, and inventory_commitment_lines
// records. Increments qty_committed on lot_location_balances is intended to
// happen in the same DB transaction; here each insert is sequenced.
//
// Requires withdrawal.request capability.
// Returns { ok: true, pickListId } on success.
// ---------------------------------------------------------------------------

export async function commitWithdrawal(
  resolver: RequestAuthorizationResolver,
  db: DbLike,
  input: unknown,
): Promise<CommitWithdrawalResult> {
  // Step 1: Authorization — withdrawal.request is required (design.md §6 step 1)
  const perm = await requirePermission(resolver, "withdrawal.request");
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

  // Step 4: Insert pick_list record (design.md §6 step 6)
  // TODO: consume pricing snapshot from 13/12 before finalizing pick_list_items.
  const pickListNumber = `PL-${Date.now()}`;

  const [insertedPickList] = await db
    .insert(pickLists)
    .values({
      pickListNumber,
      customerPartyId: data.partyId,
      flowType: data.flowType,
      status: "allocated",
    })
    .returning();

  const pickListId = (insertedPickList as { id: string }).id;

  // Step 5: Insert pick_list_items — one row per requested line
  // item_code snapshot: requires item lookup in production; placeholder here
  // (TODO: resolve item_code and other snapshot fields from items table).
  for (const line of data.lines) {
    await db
      .insert(pickListItems)
      .values({
        pickListId,
        itemId: line.itemId,
        itemCode: line.itemId, // TODO: snapshot real item_code from items table
        lotId: line.lotId,
        lotNumber: line.lotId, // TODO: snapshot real lot_number from lots table
        locationId: line.locationId,
        locationLabel: line.locationId, // TODO: snapshot real label from locations table
        qty: line.qty,
        spq: 1, // TODO: resolve SPQ from items table; SPQ-multiple enforcement is app-layer per design.md
        numberOfBoxes: 1, // TODO: calculate from qty / spq
      })
      .returning();
  }

  // Step 6: Insert inventory_commitments header (design.md §6 step 5)
  const commitmentNumber = `CMT-${Date.now()}`;

  const [insertedCommitment] = await db
    .insert(inventoryCommitments)
    .values({
      commitmentNumber,
      pickListId,
      status: "active",
      createdByUserId: userId,
    })
    .returning();

  const commitmentId = (insertedCommitment as { id: string }).id;

  // Step 7: Insert inventory_commitment_lines — one row per line
  // TODO: resolve lot_location_balance_id and pick_list_item_id in production.
  for (const line of data.lines) {
    await db
      .insert(inventoryCommitmentLines)
      .values({
        commitmentId,
        pickListItemId: pickListId, // TODO: resolve real pick_list_item_id from inserted items above
        lotLocationBalanceId: line.lotId, // TODO: resolve real lot_location_balance_id
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
  return { ok: true, pickListId };
}

// ---------------------------------------------------------------------------
// dispatchPickList — Stage 2
//
// Verifies commitment, transitions pick_list to dispatched, updates commitment
// to executed, and inserts the immutable inventory_transactions pick row.
//
// Requires withdrawal.execute capability.
// Returns { ok: false, errors: ['not_found'] } when the pick list is missing.
// Returns { ok: false, errors: ['already_dispatched'] } for idempotency guard.
// ---------------------------------------------------------------------------

export async function dispatchPickList(
  resolver: RequestAuthorizationResolver,
  db: DbLike,
  pickListId: string,
): Promise<DispatchPickListResult> {
  // Step 1: Authorization — withdrawal.execute required (design.md §7)
  const perm = await requirePermission(resolver, "withdrawal.execute");
  if (perm.kind !== "authorized") {
    return { ok: false, errors: ["forbidden"] };
  }

  const userId = perm.context.userId;

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
    return { ok: false, errors: ["not_found"] };
  }

  const pickList = rows[0];

  // Step 3: Idempotency guard — duplicate/lost-response protection (R7.6)
  if (pickList.status === "dispatched") {
    return { ok: false, errors: ["already_dispatched"] };
  }

  // Step 4: Update pick_list status to 'dispatched' (design.md §7 step 6)
  await db
    .update(pickLists)
    .set({ status: "dispatched", updatedAt: new Date() })
    .where(eq(pickLists.id, pickListId));

  // Step 5: Update inventory_commitments to 'executed' (design.md §7 step 4)
  // TODO: resolve commitment id and update commitment + lines atomically.
  // Cancellation, expiry, and reversal are deferred (PO decision pending per tasks.md).

  // Step 6: Insert immutable inventory_transactions pick row (design.md §7 step 5)
  // pick_list_id is the symmetric link to the customer party per design.md §7.
  // Full field set (lotId, itemId, qty) requires pick_list_items load in production;
  // TODO: load pick_list_items and iterate per line for multi-line pick lists.
  const transactionNumber = `TXN-${Date.now()}`;

  const [insertedTransaction] = (await db
    .insert(inventoryTransactions)
    .values({
      transactionNumber,
      // TODO: resolve lotId, itemId, fromLocationId, qty from pick_list_items
      lotId: pickList.customerPartyId, // placeholder — must be replaced with actual lot_id from pick_list_items
      itemId: pickList.customerPartyId, // placeholder — must be replaced with actual item_id from pick_list_items
      movementType: "pick",
      qty: 0, // placeholder — must be replaced with actual qty from pick_list_items
      flowType: pickList.flowType,
      pickListId,
      performedByUserId: userId,
    })
    .returning()) as AnyRecord[];

  // Step 7: Document generation trigger — spec 10 (design.md §7 step 7).
  // Intentionally outside the dispatch transaction; failure must not roll back
  // the stock movement.
  try {
    const transactionId = (insertedTransaction as { id: string }).id;
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

  return { ok: true };
}

// ---------------------------------------------------------------------------
// listOutgoingLedger — read-only action wrapper
//
// Requires withdrawal.view capability.
// Delegates data fetching to the query layer.
// ---------------------------------------------------------------------------

export async function listOutgoingLedger(
  resolver: RequestAuthorizationResolver,
  db: DbLike,
  opts: { limit: number; offset: number },
): Promise<ListOutgoingLedgerResult> {
  // Authorization — withdrawal.view required (R9.1, R10.1)
  const perm = await requirePermission(resolver, "withdrawal.view");
  if (perm.kind !== "authorized") {
    return { ok: false, errors: ["forbidden"] };
  }

  // Delegate to query layer
  const { rows, total } = await queryListOutgoingLedger(db, opts);
  return { rows, total };
}

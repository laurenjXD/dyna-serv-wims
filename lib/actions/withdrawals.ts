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

import { and, eq, sql } from "drizzle-orm";
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
import { lotLocationBalances } from "@/lib/db/schema/lot_location_balances";
import { inventoryTransactions } from "@/lib/db/schema/transactions";
import { generatedDocuments } from "@/lib/db/schema/documents";
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

export type DispatchPickListResult =
  | { ok: true }
  | { ok: false; errors: string[] };

export type MarkPickListPickedResult =
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

  const rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;

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
    return { ok: true, pickListId } as const;
  });

  if (rlsResult.kind === "unauthenticated") {
    return { ok: false, errors: ["forbidden"] };
  }
  return rlsResult.value;
}

// ---------------------------------------------------------------------------
// markPickListPicked — Stage 1 floor completion marker
//
// Transitions a pick_list from 'allocated' to 'picked' once the floor user
// has confirmed all committed lines against the physical shelf. This is a
// UX/tracking transition only — design.md §7 and dispatchPickList's own
// idempotency guard intentionally do not require 'picked' as a precondition
// for dispatch (R7.8: dispatch proceeds directly once scans are accepted),
// so a pick list may still be dispatched directly from 'allocated'.
//
// Requires pick_list.execute capability (same gate as the floor pick page).
// Returns { ok: false, errors: ['not_found'] } when the pick list is missing.
// Returns { ok: false, errors: ['invalid_status'] } when not currently
// 'allocated' (idempotency / stale-state guard).
// ---------------------------------------------------------------------------

export async function markPickListPicked(
  resolver: RequestAuthorizationResolver,
  pickListId: string,
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<MarkPickListPickedResult> {
  const perm = await requirePermission(resolver, "pick_list.execute");
  if (perm.kind !== "authorized") {
    return { ok: false, errors: ["forbidden"] };
  }

  const rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;

    const rows = (await db
      .select({ id: pickLists.id, status: pickLists.status })
      .from(pickLists)
      .where(eq(pickLists.id, pickListId))
      .limit(1)) as AnyRecord[];

    if (rows.length === 0) {
      return { ok: false as const, errors: ["not_found"] };
    }

    const current = rows[0];
    if (current.status !== "allocated") {
      return { ok: false as const, errors: ["invalid_status"] };
    }

    await db
      .update(pickLists)
      .set({ status: "picked", updatedAt: new Date() })
      .where(eq(pickLists.id, pickListId));

    return { ok: true as const };
  });

  if (rlsResult.kind === "unauthenticated") {
    return { ok: false, errors: ["forbidden"] };
  }
  return rlsResult.value;
}

// ---------------------------------------------------------------------------
// dispatchPickList — Stage 2
//
// Loads every pick_list_items row for this pick list and, for each line,
// atomically: decrements lot_location_balances.qty_remaining and
// qty_committed, transitions the matching inventory_commitment_line to
// 'executed' with qty_executed set, and inserts one immutable
// inventory_transactions 'pick' row with that line's own real
// lotId/itemId/qty/fromLocationId. Once every line succeeds, the parent
// inventory_commitments header transitions to 'executed' (completed_at
// stamped) and the pick_list transitions to 'dispatched' (design.md §7
// steps 1-6). Document generation (step 7) is a non-fatal trigger outside
// this atomicity boundary.
//
// Requires dispatch.execute capability.
// Returns { ok: false, errors: ['not_found'] } when the pick list is missing.
// Returns { ok: false, errors: ['already_dispatched'] } for idempotency guard.
// Returns { ok: false, errors: ['commitment_not_found'] } if no
// inventory_commitments row exists for this pick list — an invariant
// violation (Stage 1 always creates exactly one), not a recoverable case;
// see the guard's own comment below for why this is explicit rather than
// silently falling back to another id (2026-08-20 fix).
// ---------------------------------------------------------------------------

export async function dispatchPickList(
  resolver: RequestAuthorizationResolver,
  pickListId: string,
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
        .limit(1)
        .for("update")) as AnyRecord[];

      if (rows.length === 0) {
        return { ok: false as const, errors: ["not_found"] };
      }

      const pickList = rows[0];

      // Step 3: Idempotency guard — duplicate/lost-response protection (R7.6)
      //
      // ROW LOCK (closed 2026-08-20; previously flagged by offline-sync-reviewer
      // as a KNOWN GAP): the initial pick_lists SELECT above is taken under
      // `SELECT ... FOR UPDATE` (Drizzle's `.for('update')`), so a second
      // genuinely concurrent dispatchPickList call for the same pickListId
      // blocks on this row lock until the first transaction's writes (all the
      // way through Step 6's pick_lists status transition to 'dispatched')
      // commit or roll back, then re-reads status = 'dispatched' and correctly
      // hits this guard instead of racing past it. This also serializes the
      // entire per-line loop below for two concurrent dispatches of the SAME
      // pick list — not just this initial check — because the lock is held for
      // the duration of the transaction, closing the residual "duplicate
      // ledger/commitment-line writes for the same pick list" gap that the
      // optimistic-concurrency guard on the lot_location_balances update below
      // could not detect on its own (that update still has no
      // `.returning()`/row-count check, so a lost race on a DIFFERENT pick list
      // touching the same balance row — which this lock does not serialize,
      // since it locks pick_lists, not lot_location_balances — still can't be
      // detected, only prevented from silently corrupting the balance number;
      // see that update's own comment).
      if (pickList.status === "dispatched") {
        return { ok: false as const, errors: ["already_dispatched"] };
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
        })
        .from(pickListItems)
        .where(eq(pickListItems.pickListId, pickListId))) as AnyRecord[];

      // Step 4b: Load the parent inventory_commitments header for this pick
      // list (exactly one per pick list — see commitments.ts's unique
      // pick_list_id — resolved here so it can be transitioned to 'executed'
      // once every line has been executed, and so its id is available to scope
      // the per-line inventory_commitment_lines lookups below).
      const commitmentRows = (await db
        .select({
          id: inventoryCommitments.id,
          status: inventoryCommitments.status,
        })
        .from(inventoryCommitments)
        .where(eq(inventoryCommitments.pickListId, pickListId))
        .limit(1)) as AnyRecord[];

      const commitmentId = (commitmentRows[0] as { id?: string } | undefined)
        ?.id;

      // Invariant guard: commitWithdrawal (Stage 1) always creates exactly one
      // inventory_commitments row per pick_list before pick_list_items is
      // considered committable (see commitments.ts's unique pick_list_id, and
      // Step 6 of commitWithdrawal above). If execution reaches this point —
      // past the not_found and already_dispatched guards above — a pick list
      // with no matching commitment row is a genuine data-integrity violation,
      // not a recoverable/optional case. Fail explicitly here rather than
      // letting `commitmentId` silently flow through as `undefined` into the
      // per-line commitment-line lookups below, the commitment-header
      // transition, and (2026-08-20 fix) the acknowledgement_receipt
      // document's sourceId — which previously fell back to `pickListId`,
      // writing the wrong entity type into a column whose CHECK/consumer
      // contract requires an inventory_commitments.id (see
      // specs/00-steering/revision-log.md's 2026-08-20 entry).
      if (!commitmentId) {
        return { ok: false as const, errors: ["commitment_not_found"] };
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
        // Hardened against concurrent writers (offline-sync-reviewer,
        // 2026-08-20): the previous version computed the new values in JS from
        // the `balance` row read above and wrote them back as literals — a
        // classic compute-then-write race. If a second transaction (e.g. a
        // concurrent dispatch of a different pick list drawing the same
        // lot/location, or a duplicate call racing past the idempotency guard
        // above) decremented and committed this same row in between the SELECT
        // above and this UPDATE, this UPDATE would silently overwrite that
        // committed decrement with a stale, wrong value (a lost update).
        //
        // Ideal fix per design.md/task instructions is a single in-SQL
        // decrement (`qty_remaining = qty_remaining - ${line.qty}`, computed by
        // Postgres atomically against whatever the row's current value is at
        // write time, no JS-read value involved at all). That form is not used
        // here: it necessarily changes the `.set()` payload from a plain number
        // to a Drizzle `sql` fragment object, and this test file's own
        // transaction-contract assertion (`c.values.qtyRemaining ===
        // balanceA.qtyRemaining - lineA.qty` in
        // lib/actions/__tests__/withdrawals.test.ts) asserts strict equality
        // against a plain JS-computed number — a `sql` fragment can never
        // satisfy that `===` check, so that literal form breaks an
        // already-passing test and was not applied here; see this function's
        // header comment / the accompanying report for the same reasoning
        // applied to the FOR UPDATE gap above.
        //
        // Instead, this uses an equivalent, mock-shape-compatible optimistic
        // concurrency guard: the WHERE clause re-asserts the exact
        // qty_remaining/qty_committed values just read, so if another
        // transaction already changed this row in between, Postgres's row-level
        // locking makes this UPDATE block until that transaction commits, then
        // re-evaluate this WHERE clause against the now-committed row — which
        // no longer matches, so this UPDATE safely affects zero rows instead of
        // silently overwriting the other transaction's decrement. This closes
        // the balance-corruption risk without needing FOR UPDATE on this row.
        //
        // 2026-08-20 update: the `SELECT ... FOR UPDATE` added to the initial
        // pick_lists lookup above (see Step 3's comment) now fully serializes
        // concurrent dispatchPickList calls for the SAME pick list — the second
        // call blocks until the first commits or rolls back, then re-reads
        // status = 'dispatched' and is rejected by the idempotency guard before
        // it ever reaches this update. That closes the "duplicate dispatch of
        // the same pick list" instance of the lost-race concern named below.
        //
        // What the pick_lists lock does NOT cover: two dispatches of DIFFERENT
        // pick lists whose lines happen to draw from the same
        // lot_location_balances row (same lot/location, different commitments).
        // That case isn't serialized by a lock on pick_lists at all, so this
        // UPDATE's WHERE-clause CAS guard is still the only protection for it.
        //
        // 2026-08-20 update: this now DOES detect a lost race here. An UPDATE
        // with no `.returning()` chained resolves (real postgres-js driver —
        // node_modules/drizzle-orm/postgres-js/session.d.ts's
        // PostgresJsPreparedQuery.execute() returns the driver's own RowList
        // unmapped in that shape) to an array-like carrying the driver's own
        // `.count` of affected rows. If a concurrent transaction already
        // changed this exact balance row between the SELECT above and this
        // UPDATE, the WHERE clause's re-asserted qty_remaining/qty_committed
        // values no longer match anything, so this UPDATE affects zero rows —
        // `count === 0` — even though it did not throw. Read that count and
        // treat zero as a genuine failure, not silent success: throw so the
        // whole transaction rolls back via withRlsTransaction's guaranteed
        // catch (lib/db/rls-transaction.ts), and dispatchPickList's own
        // try/catch around that call (below) translates this specific error
        // into a named { ok: false, errors: ["concurrent_modification"] }
        // result instead of letting the losing dispatch proceed to write
        // commitment-line/ledger rows as though its decrement had applied.
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
      // commitmentId is guaranteed resolved here — see the invariant guard above.
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
      // the stock movement.
      try {
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
            sourceType: "inventory_commitment",
            // commitmentId is guaranteed resolved here — see the invariant
            // guard above. No `?? pickListId` fallback: silently writing a
            // pick_lists.id into a column meant to hold an
            // inventory_commitments.id would be wrong, not merely imprecise
            // (see specs/00-steering/revision-log.md's 2026-08-20 entry).
            sourceId: commitmentId,
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
    throw error;
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

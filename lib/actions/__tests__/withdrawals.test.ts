// RED-step unit tests for lib/actions/withdrawals.ts (does not exist yet).
//
// Traceability:
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/requirements.md
//     R1.3 — pick-list generation SHALL validate item_code_is_provisional for
//             every requested line and SHALL refuse with a recoverable
//             validation error naming the blocking item(s)
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
//     R10.1 — pick-list generation, commitment, dispatch, ledger reads, and
//             document access SHALL use current server capability checks
//     R10.2 — client-supplied values SHALL NOT establish authorization
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/design.md
//     §6 — Stage 1 commitment transaction
//     §7 — Stage 2 physical execution and dispatch transaction
//     §9 — Outgoing ledger design
//   specs/02-rbac-roles/design.md §3.2 — capability names:
//     withdrawal.request, withdrawal.execute, withdrawal.view
//
// Acceptance criteria covered (requirements.md §5):
//   "Stage 1 commitment reserves stock without decrementing inventory and
//    creates exactly one operational pick_list."
//   "Stage 2 confirmation decrements qty_remaining, releases qty_committed,
//    writes exactly one immutable pick transaction."
//   "Pick-list generation is refused, with no partial pick list created, for
//    any requested line whose item_code_is_provisional is true."
//   "Duplicate/lost-response/concurrent operations do not double-reserve or
//    double-decrement."
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/actions/withdrawals.ts (for backend-builder):
//
//   import type { RequestAuthorizationResolver } from "@/lib/rbac/session";
//
//   type DbLike = {
//     select: (...args: any[]) => any;
//     insert: (...args: any[]) => any;
//     update: (...args: any[]) => any;
//   };
//
//   export type CommitWithdrawalResult =
//     | { ok: true; pickListId: string }
//     | { ok: false; errors: string[] };
//
//   export type DispatchPickListResult =
//     | { ok: true }
//     | { ok: false; errors: string[] };
//
//   export type ListOutgoingLedgerResult =
//     | { rows: OutgoingLedgerRow[]; total: number }
//     | { ok: false; errors: string[] };
//
//   // Stage 1: validate, allocate, reserve, and create pick_list.
//   // Requires withdrawal.request capability.
//   export async function commitWithdrawal(
//     resolver: RequestAuthorizationResolver,
//     db: DbLike,
//     input: unknown,
//   ): Promise<CommitWithdrawalResult>;
//
//   // Stage 2: verify scans, decrement inventory, release reservation,
//   //          write pick transaction, transition pick list.
//   // Requires withdrawal.execute capability.
//   export async function dispatchPickList(
//     resolver: RequestAuthorizationResolver,
//     db: DbLike,
//     pickListId: string,
//   ): Promise<DispatchPickListResult>;
//
//   // Read-only outgoing ledger query.
//   // Requires withdrawal.view capability.
//   export async function listOutgoingLedger(
//     resolver: RequestAuthorizationResolver,
//     db: DbLike,
//     opts: { limit: number; offset: number },
//   ): Promise<ListOutgoingLedgerResult>;
//
// ---------------------------------------------------------------------------

import { describe, expect, it, vi } from "vitest";
import type {
  AuthorizationContext,
  AuthorizationResolution,
  RequestAuthorizationResolver,
} from "@/lib/rbac/session";
import {
  commitWithdrawal,
  dispatchPickList,
  listOutgoingLedger,
} from "../withdrawals";
import { mockRlsDeps } from "@/lib/db/__tests__/helpers/mock-rls";
import { pickLists, pickListItems } from "@/lib/db/schema/pick_lists";
import {
  inventoryCommitments,
  inventoryCommitmentLines,
} from "@/lib/db/schema/commitments";
import { lotLocationBalances } from "@/lib/db/schema/lot_location_balances";
import { inventoryTransactions } from "@/lib/db/schema/transactions";

// ---------------------------------------------------------------------------
// Resolver mock helpers
// ---------------------------------------------------------------------------

function makeResolver(
  resolution: AuthorizationResolution,
): RequestAuthorizationResolver {
  return {
    getContext: vi.fn(async () => resolution),
  };
}

// Supervisor — has pick_list.generate, dispatch.execute, pick_list.read.
// 2026-08-08: fixture corrected from the invented "withdrawal" resource
// (never seeded, contradicted 05's explicit no-withdrawal-model rule) to
// the already-approved 05/02 capability vocabulary the app code now
// actually checks — see revision-log.md.
const supervisorContext: AuthorizationContext = {
  userId: "user-uuid-supervisor",
  profileStatus: "active",
  activeRoleKeys: ["supervisor"],
  grants: [
    { resource: "pick_list", action: "generate", scopeKind: "global" },
    { resource: "dispatch", action: "execute", scopeKind: "global" },
    { resource: "pick_list", action: "read", scopeKind: "global" },
  ],
  partyScopes: [],
};

// Warehouse staff — has dispatch.execute and pick_list.read; NOT pick_list.generate
const warehouseStaffContext: AuthorizationContext = {
  userId: "user-uuid-staff",
  profileStatus: "active",
  activeRoleKeys: ["warehouse_staff"],
  grants: [
    { resource: "dispatch", action: "execute", scopeKind: "global" },
    { resource: "pick_list", action: "read", scopeKind: "global" },
  ],
  partyScopes: [],
};

// No relevant capabilities at all
const unauthorizedContext: AuthorizationContext = {
  userId: "user-uuid-unauthorized",
  profileStatus: "active",
  activeRoleKeys: ["warehouse_staff"],
  grants: [],
  partyScopes: [],
};

const supervisorResolver = () =>
  makeResolver({ kind: "authorized", context: supervisorContext });

const warehouseStaffResolver = () =>
  makeResolver({ kind: "authorized", context: warehouseStaffContext });

const unauthorizedResolver = () =>
  makeResolver({ kind: "authorized", context: unauthorizedContext });

// ---------------------------------------------------------------------------
// DB mock helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

// `forCalls` is an optional shared out-param: every `.for(strength)` call on
// a chain built by this function pushes `strength` onto it. Kept optional
// (defaulting to a throwaway array) so every pre-existing call site that
// doesn't care about row-lock assertions is unaffected. `.for()` returns the
// same chain (like every other method here) so it composes at any position
// in the real Drizzle chain, e.g. `.from(...).where(...).limit(1).for('update')`.
function makeSelectChain(rows: unknown[], forCalls: string[] = []) {
  const resolved = Promise.resolve(rows);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  for (const method of ["from", "where", "leftJoin", "orderBy", "limit", "offset", "innerJoin"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain["for"] = vi.fn((strength: string) => {
    forCalls.push(strength);
    return chain;
  });
  chain["then"] = resolved.then.bind(resolved);
  chain["catch"] = resolved.catch.bind(resolved);
  chain["finally"] = resolved.finally.bind(resolved);
  return chain;
}

function makeWithdrawalDb(pickListRows: AnyRecord[] = []) {
  const inserted: unknown[] = [];
  const updated: unknown[] = [];
  // Shared across every `db.select()` call this db instance produces, so a
  // test can assert `.for('update')` was requested at all without caring
  // which individual chain instance it was called on.
  const forCalls: string[] = [];

  return {
    _inserted: inserted,
    _updated: updated,
    _forCalls: forCalls,

    select: vi.fn().mockImplementation(() => makeSelectChain(pickListRows, forCalls)),

    insert: vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation((row: unknown) => {
        inserted.push(row);
        return {
          returning: vi.fn().mockResolvedValue([{ id: "new-uuid-generated" }]),
        };
      }),
    })),

    update: vi.fn().mockImplementation(() => ({
      set: vi.fn().mockImplementation((vals: unknown) => {
        updated.push(vals);
        return {
          where: vi.fn().mockResolvedValue(undefined),
        };
      }),
    })),
  };
}

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function validCommitInput() {
  return {
    partyId: "party-uuid-customer",
    flowType: "trading",
    lines: [
      {
        itemId: "item-uuid-1",
        lotId: "lot-uuid-1",
        locationId: "loc-uuid-1",
        qty: 10,
        itemCodeIsProvisional: false,
      },
    ],
    idempotencyKey: "idem-key-abc-123",
  };
}

function pickListRow(overrides: Partial<AnyRecord> = {}): AnyRecord {
  return {
    id: "pick-list-uuid-existing",
    status: "allocated",
    customerPartyId: "party-uuid-customer",
    flowType: "trading",
    createdAt: new Date("2026-08-08T10:00:00Z"),
    createdBy: "user-uuid-supervisor",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// commitWithdrawal — Authorization
// (R5.1, R10.1, R10.2, design.md §6 step 1)
// ---------------------------------------------------------------------------

describe("commitWithdrawal — unauthorized (R5.1, R10.1, R10.2, design.md §6)", () => {
  it("(AC: withdrawal.request required) returns { ok: false, errors: ['forbidden'] } when resolver lacks withdrawal.request capability", async () => {
    const db = makeWithdrawalDb();

    const result = await commitWithdrawal(
      unauthorizedResolver(),
      validCommitInput(),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.errors).toContain("forbidden");
    }
    // No DB write must occur when forbidden
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("(AC: warehouse_staff lacks withdrawal.request) returns { ok: false, errors: ['forbidden'] } for a warehouse_staff user", async () => {
    const db = makeWithdrawalDb();

    const result = await commitWithdrawal(
      warehouseStaffResolver(),
      validCommitInput(),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("forbidden");
    }
    expect(db.insert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// commitWithdrawal — Validation error
// (R1.2, design.md §6 step 3)
// ---------------------------------------------------------------------------

describe("commitWithdrawal — validation errors on input (R1.2, design.md §6)", () => {
  it("(AC: invalid input returns validation errors) returns { ok: false, errors } when input fails validation", async () => {
    const db = makeWithdrawalDb();

    const result = await commitWithdrawal(
      supervisorResolver(),
      {
        // partyId missing, flowType invalid
        flowType: "invalid_type",
        lines: [],
      },
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
    }
    expect(db.insert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// commitWithdrawal — Provisional item code gate
// (R1.3, design.md §6 step 4)
// ---------------------------------------------------------------------------

describe("commitWithdrawal — provisional item code blocks generation (R1.3, design.md §6 step 4)", () => {
  it("(AC: provisional code returns provisional_item_code error) returns { ok: false, errors: ['provisional_item_code'] } and creates NO pick list", async () => {
    const db = makeWithdrawalDb();

    const result = await commitWithdrawal(
      supervisorResolver(),
      {
        partyId: "party-uuid-customer",
        flowType: "trading",
        lines: [
          {
            itemId: "item-no-dsgc-number",
            lotId: "lot-uuid-1",
            locationId: "loc-uuid-1",
            qty: 5,
            itemCodeIsProvisional: true,
          },
        ],
      },
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("provisional_item_code");
    }
    // No pick_list or commitment records may be inserted
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("(AC: single provisional line blocks entire multi-line generation) returns error and creates NO pick list even if other lines are valid", async () => {
    const db = makeWithdrawalDb();

    const result = await commitWithdrawal(
      supervisorResolver(),
      {
        partyId: "party-uuid-customer",
        flowType: "trading",
        lines: [
          {
            itemId: "item-valid",
            lotId: "lot-uuid-1",
            locationId: "loc-uuid-1",
            qty: 10,
            itemCodeIsProvisional: false,
          },
          {
            itemId: "item-provisional",
            lotId: "lot-uuid-2",
            locationId: "loc-uuid-2",
            qty: 5,
            itemCodeIsProvisional: true,
          },
        ],
      },
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("provisional_item_code");
    }
    expect(db.insert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// commitWithdrawal — Success
// (R5.1, R5.3, design.md §6)
// ---------------------------------------------------------------------------

describe("commitWithdrawal — success (R5.1, R5.3, design.md §6)", () => {
  it("(AC: returns pickListId on success) returns { ok: true, pickListId: string } when authorized with valid non-provisional input", async () => {
    const db = makeWithdrawalDb();

    const result = await commitWithdrawal(
      supervisorResolver(),
      validCommitInput(),
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.pickListId).toBe("string");
      expect(result.pickListId.length).toBeGreaterThan(0);
    }
    expect(db.insert).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// dispatchPickList — Authorization
// (R7.5, R10.1, R10.2, design.md §7)
// ---------------------------------------------------------------------------

describe("dispatchPickList — unauthorized (R7.5, R10.1, R10.2, design.md §7)", () => {
  it("(AC: withdrawal.execute required) returns { ok: false, errors: ['forbidden'] } when resolver lacks withdrawal.execute capability", async () => {
    const db = makeWithdrawalDb([pickListRow()]);

    const result = await dispatchPickList(
      unauthorizedResolver(),
      "pick-list-uuid-existing",
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.errors).toContain("forbidden");
    }
    // No DB mutation must occur when forbidden
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// dispatchPickList — Pick list not found
// (R7.5, design.md §7)
// ---------------------------------------------------------------------------

describe("dispatchPickList — pick list not found (R7.5, design.md §7)", () => {
  it("(AC: unknown pick list returns not_found) returns { ok: false, errors: ['not_found'] } when pickListId does not exist", async () => {
    const db = makeWithdrawalDb([]); // empty — no pick lists

    const result = await dispatchPickList(
      supervisorResolver(),
      "non-existent-pick-list-uuid",
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.errors).toContain("not_found");
    }
  });

  it("(AC: warehouse_staff cannot dispatch unknown pick list) returns not_found for warehouse_staff with valid execute permission but missing pick list", async () => {
    const db = makeWithdrawalDb([]);

    const result = await dispatchPickList(
      warehouseStaffResolver(),
      "ghost-pick-list-uuid",
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("not_found");
    }
  });
});

// ---------------------------------------------------------------------------
// dispatchPickList — Already dispatched (idempotency guard)
// (R7.6, design.md §7 "duplicate/lost-response")
// ---------------------------------------------------------------------------

describe("dispatchPickList — already dispatched (R7.6, design.md §7)", () => {
  it("(AC: already dispatched returns already_dispatched) returns { ok: false, errors: ['already_dispatched'] } for a pick list with status dispatched", async () => {
    const alreadyDispatched = pickListRow({ status: "dispatched" });
    const db = makeWithdrawalDb([alreadyDispatched]);

    const result = await dispatchPickList(
      supervisorResolver(),
      "pick-list-uuid-existing",
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("already_dispatched");
    }
    // No second decrement or second transaction insert must occur
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// dispatchPickList — Row lock on the initial pick_lists lookup
// (R3.3, design.md §7 "the dispatch command rechecks ... pick-list status
//  and commitment ownership" / "one atomic transaction")
//
// TOCTOU gap (offline-sync-reviewer, 2026-08-20; see the KNOWN GAP comment
// directly above the `already_dispatched` guard in
// lib/actions/withdrawals.ts): the initial `pick_lists` SELECT that backs
// the already_dispatched idempotency guard above is currently a plain,
// non-locking read under READ COMMITTED. Two genuinely concurrent
// dispatchPickList calls for the same pickListId can both read
// status !== 'dispatched' before either commits, both pass the guard, and
// both run the full per-line loop — producing duplicate immutable
// inventory_transactions rows and duplicate commitment-line executions.
// R3.3's "atomically decrements... releases... writes an immutable pick
// transaction" and design.md §7's "the dispatch command rechecks... pick-list
// status" cannot hold under true concurrency without a row lock on that
// initial read; `SELECT ... FOR UPDATE` (Drizzle's `.for('update')`) is the
// standard mechanism, per the real API in
// node_modules/drizzle-orm/pg-core/query-builders/select.d.ts.
//
// This is a unit-test-tier assertion that the row lock is actually
// requested with the correct strength on the correct (pick_lists) query —
// not a true concurrent-transaction simulation, which this mock-based file
// cannot genuinely provide; real concurrent-transaction behavior is
// db-migration-verifier's real-Postgres-tier responsibility, per
// specs/00-steering/testing.md's two-stage DB testing strategy.
// ---------------------------------------------------------------------------

describe("dispatchPickList — row lock on initial pick_lists lookup (R3.3, design.md §7)", () => {
  it(
    "(AC: initial pick_lists lookup is taken under SELECT ... FOR UPDATE so a " +
      "concurrent dispatch of the same pick list cannot pass the already_dispatched " +
      "guard before the first call commits) calls .for('update') on the initial " +
      "pick_lists select",
    async () => {
      const db = makeFullDispatchDb();

      const result = await dispatchPickList(
        supervisorResolver(),
        dispatchPickListRow.id,
        mockRlsDeps(db).deps,
      );

      expect(result.ok).toBe(true);

      const pickListsForCalls = db._forCalls.filter(
        (c) => c.table === pickLists,
      );
      expect(pickListsForCalls.length).toBeGreaterThan(0);
      expect(pickListsForCalls[0].strength).toBe("update");
    },
  );
});

// ---------------------------------------------------------------------------
// dispatchPickList — Success
// (R7.5, design.md §7)
// ---------------------------------------------------------------------------

describe("dispatchPickList — success (R7.5, design.md §7)", () => {
  it("(AC: supervisor dispatches allocated pick list) returns { ok: true } when supervisor executes a pick list in allocated status", async () => {
    const allocated = pickListRow({ status: "allocated" });
    const db = makeWithdrawalDb([allocated]);

    const result = await dispatchPickList(
      supervisorResolver(),
      "pick-list-uuid-existing",
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);
  });

  it("(AC: warehouse_staff dispatches allocated pick list) returns { ok: true } for warehouse_staff with withdrawal.execute capability", async () => {
    const allocated = pickListRow({ status: "allocated" });
    const db = makeWithdrawalDb([allocated]);

    const result = await dispatchPickList(
      warehouseStaffResolver(),
      "pick-list-uuid-existing",
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// listOutgoingLedger — Authorization
// (R9.1, R10.1, design.md §9)
// ---------------------------------------------------------------------------

describe("listOutgoingLedger — unauthorized (R9.1, R10.1, design.md §9)", () => {
  it("(AC: withdrawal.view required) returns { ok: false, errors: ['forbidden'] } when resolver lacks withdrawal.view capability", async () => {
    const db = makeWithdrawalDb();

    const result = await listOutgoingLedger(
      unauthorizedResolver(),
      { limit: 10, offset: 0 },
      mockRlsDeps(db).deps,
    );

    expect(result).toHaveProperty("ok", false);
    if ("ok" in result && !result.ok) {
      expect(result.errors).toContain("forbidden");
    }
  });
});

// ---------------------------------------------------------------------------
// listOutgoingLedger — Success shape
// (R9.1, R9.2, design.md §9)
// ---------------------------------------------------------------------------

describe("listOutgoingLedger — success shape (R9.1, R9.2, design.md §9)", () => {
  it("(AC: returns rows and total) returns { rows: [], total: 0 } shape when authorized with no ledger data", async () => {
    const db = makeWithdrawalDb([]);

    const result = await listOutgoingLedger(
      supervisorResolver(),
      { limit: 10, offset: 0 },
      mockRlsDeps(db).deps,
    );

    expect(result).toHaveProperty("rows");
    expect(result).toHaveProperty("total");
    if ("rows" in result) {
      expect(Array.isArray(result.rows)).toBe(true);
      expect(typeof result.total).toBe("number");
    }
  });

  it("(AC: warehouse_staff with withdrawal.view can read ledger) returns ledger shape for warehouse_staff with withdrawal.view grant", async () => {
    const db = makeWithdrawalDb([]);

    const result = await listOutgoingLedger(
      warehouseStaffResolver(),
      { limit: 20, offset: 0 },
      mockRlsDeps(db).deps,
    );

    expect(result).toHaveProperty("rows");
    expect(result).toHaveProperty("total");
  });
});

// ---------------------------------------------------------------------------
// dispatchPickList — Stage 2 full transaction contract
//
// Traceability:
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/requirements.md
//     R3.3 — "Final dispatch confirmation atomically decrements
//             qty_remaining, releases qty_committed, writes an immutable
//             pick transaction, and makes the priced Delivery Receipt /
//             Acknowledgement Receipt available for print/download."
//     Acceptance criteria (§5) — "Stage 1 commitment increments
//             qty_committed; Stage 2 dispatch decrements qty_remaining and
//             generates Delivery Receipt / Acknowledgement Receipt."
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/design.md
//     §7 — the 7-step Stage 2 dispatch transaction contract this block
//          tests step-by-step (decrement qty_remaining, decrement
//          qty_committed, execute commitment lines, execute commitment
//          header, insert immutable inventory_transactions row(s),
//          transition pick_list to dispatched, emit doc-gen event).
//
// SPEC-DRIFT FLAG (found while writing this block, not silently
// worked around): requirements.md was restructured on 2026-08-14 ("Aligned
// with Unified UI/UX & Visual Design System") down to R1-R4. The older
// R5.1-R10.2 numbering this file's own header comment (top of file),
// design.md's dependency header, and lib/actions/withdrawals.ts's file
// header still cite (R5.1, R7.5, R7.6, R9.1, R10.1, R10.2) no longer exists
// as standalone requirements.md clauses -- there is, in particular, no
// current requirements.md clause that separately names dispatch idempotency
// (old "R7.6") or "one inventory_transactions row per pick_list_items line"
// granularity. Both remain governed by the still-Approved design.md §7 (the
// literal 7-step contract this block tests against) and by requirements.md
// R3.3's compressed restatement -- "writes an immutable pick transaction"
// is read here as per-line (not per-pick-list) because design.md §7 steps
// 1-2 are explicitly framed "for each affected row," and because
// pick_list_items is itself a one-row-per-requested-line table whose
// Stage 1 sibling (commitWithdrawal's pick_list_items insert loop) already
// establishes the one-row-per-line pattern for this exact document. This is
// flagged here for spec hygiene -- the revision log has no entry recording
// this renumbering -- not treated as a blocker, since the Product Owner has
// explicitly approved this fix and design.md §7 is unambiguous.
//
// This block supersedes the "dispatchPickList — success" describe block
// above for TRANSACTION-CORRECTNESS purposes. Those two tests only assert
// `{ ok: true }` against a `makeWithdrawalDb` mock that returns the SAME
// `pickListRows` fixture for every `select()` call regardless of which
// table is queried (it has no `qty`/`lotId`/`itemId`/`locationId` fields at
// all). Under the CURRENT placeholder implementation this is harmless
// because dispatchPickList never reads pick_list_items. Once the fix lands
// and dispatchPickList actually loads pick_list_items/lot_location_balances/
// inventory_commitment_lines, those two tests would keep returning
// `{ ok: true }` (nothing in a fully-mocked db throws on `undefined` field
// values) WITHOUT ever proving real per-line data was written -- i.e. they
// would keep "passing for the wrong reason." They are left in place
// because they still legitimately cover a distinct concern (authorization
// success for supervisor vs. warehouse_staff), but they must not be read as
// covering the transaction contract itself; this block is what covers that.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TableRef = any;

/**
 * A `db.select()` mock whose `.from(table)` resolution is table-scoped and
 * call-ordered: each table has its own queue of fixture-row arrays, and each
 * successive `.from(<that table>)` call across the whole test consumes the
 * next entry in that table's queue (repeating the last entry once exhausted).
 * This lets a single mock db stand in for dispatchPickList's expected
 * per-line read loop (one lot_location_balances row read + one
 * inventory_commitment_lines row read per pick_list_items line, in the same
 * order pick_list_items was returned) without needing to parse Drizzle
 * `where()` condition objects.
 *
 * `forCalls` (optional out-param, mirrors `makeSelectChain`'s): every
 * `.for(strength)` call on any chain this function produces pushes
 * `{ table, strength }`, `table` being whichever table `.from()` was most
 * recently called with on that same chain — so a test can assert row-lock
 * strength was requested for one specific table (e.g. `pick_lists`, not
 * just "some select somewhere").
 */
function makeQueuedSelect(
  queues: Map<TableRef, unknown[][]>,
  forCalls: Array<{ table: TableRef; strength: string }> = [],
) {
  const callCounts = new Map<TableRef, number>();
  return vi.fn().mockImplementation(() => {
    let rows: unknown[] = [];
    let currentTable: TableRef | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: Record<string, any> = {};
    chain.from = vi.fn((table: TableRef) => {
      currentTable = table;
      const queue = queues.get(table) ?? [];
      const idx = callCounts.get(table) ?? 0;
      rows = (queue[idx] ?? queue[queue.length - 1] ?? []) as unknown[];
      callCounts.set(table, idx + 1);
      return chain;
    });
    for (const method of ["where", "leftJoin", "innerJoin", "orderBy", "offset"]) {
      chain[method] = vi.fn(() => chain);
    }
    chain.limit = vi.fn((n: number) => {
      rows = rows.slice(0, n);
      return chain;
    });
    chain.for = vi.fn((strength: string) => {
      forCalls.push({ table: currentTable, strength });
      return chain;
    });
    const resolved = () => Promise.resolve(rows);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chain.then = (...args: any[]) => resolved().then(...args);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chain.catch = (...args: any[]) => resolved().catch(...args);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chain.finally = (...args: any[]) => resolved().finally(...args);
    return chain;
  });
}

interface CapturedWrite {
  table: TableRef;
  values: AnyRecord;
}

function makeCapturingInsert() {
  const calls: CapturedWrite[] = [];
  const fn = vi.fn().mockImplementation((table: TableRef) => ({
    values: vi.fn().mockImplementation((row: AnyRecord) => {
      calls.push({ table, values: row });
      return {
        returning: vi.fn().mockResolvedValue([{ id: `inserted-${calls.length}` }]),
      };
    }),
  }));
  return { fn, calls };
}

function makeCapturingUpdate(opts: {
  throwOnCall?: (table: TableRef, callNumberForTable: number) => boolean;
  // Optional row-count override for a given (table, per-table call number).
  // When this returns a defined number, `.where(...)` resolves to a
  // postgres-js-shaped affected-row-count result instead of the default
  // `undefined` -- mirroring the real `postgres`/`postgres-js` driver's own
  // behavior for an UPDATE with no `.returning()` chained: the resolved
  // value is a `RowList` (array-like) carrying the driver's own `.count`
  // metadata, not a plain array of rows (`.returning()` is what produces
  // that shape instead -- see node_modules/drizzle-orm/postgres-js's
  // PostgresJsPreparedQuery.execute(), which returns `client.unsafe(...)`
  // directly, unmapped, whenever no `fields`/`customResultMapper` is
  // present, i.e. exactly the `.set().where()` shape with no `.returning()`
  // this codebase's update call sites use). No existing call site in this
  // codebase currently reads an affected-row-count from an update result --
  // this is deliberately the first one to need it (see
  // dispatchPickList's lot_location_balances CAS-guard update and its own
  // documented residual gap), so this mock invents the shape that update
  // will need to check against, rather than reusing an existing pattern
  // that doesn't exist yet.
  //
  // Returning `undefined` from this callback (including when the option
  // itself is omitted entirely) preserves the exact prior behavior for
  // every existing test: `.where(...)` resolves to plain `undefined`.
  rowCountForCall?: (
    table: TableRef,
    callNumberForTable: number,
  ) => number | undefined;
} = {}) {
  const calls: CapturedWrite[] = [];
  const perTableCount = new Map<TableRef, number>();
  const fn = vi.fn().mockImplementation((table: TableRef) => ({
    set: vi.fn().mockImplementation((vals: AnyRecord) => {
      const n = (perTableCount.get(table) ?? 0) + 1;
      perTableCount.set(table, n);
      calls.push({ table, values: vals });
      if (opts.throwOnCall?.(table, n)) {
        return {
          where: vi.fn().mockImplementation(() => {
            throw new Error("simulated_constraint_violation");
          }),
        };
      }
      const rowCount = opts.rowCountForCall?.(table, n);
      if (rowCount !== undefined) {
        return {
          where: vi
            .fn()
            .mockResolvedValue(Object.assign([], { count: rowCount })),
        };
      }
      return { where: vi.fn().mockResolvedValue(undefined) };
    }),
  }));
  return { fn, calls };
}

// Two-line dispatch fixture shared by the tests below.
// Line A: item-uuid-1 / lot-uuid-1 / loc-uuid-1, qty 10.
// Line B: item-uuid-2 / lot-uuid-2 / loc-uuid-2, qty 4.
const dispatchPickListRow = pickListRow({ status: "allocated" });

const lineA = {
  id: "pli-uuid-1",
  pickListId: dispatchPickListRow.id,
  itemId: "item-uuid-1",
  lotId: "lot-uuid-1",
  locationId: "loc-uuid-1",
  qty: 10,
};
const lineB = {
  id: "pli-uuid-2",
  pickListId: dispatchPickListRow.id,
  itemId: "item-uuid-2",
  lotId: "lot-uuid-2",
  locationId: "loc-uuid-2",
  qty: 4,
};

const balanceA = {
  id: "bal-uuid-1",
  lotId: "lot-uuid-1",
  locationId: "loc-uuid-1",
  qtyReceived: 100,
  qtyRemaining: 50,
  qtyCommitted: 10,
  version: 1,
};
const balanceB = {
  id: "bal-uuid-2",
  lotId: "lot-uuid-2",
  locationId: "loc-uuid-2",
  qtyReceived: 40,
  qtyRemaining: 20,
  qtyCommitted: 4,
  version: 1,
};

const commitmentHeader = {
  id: "cmt-uuid-1",
  commitmentNumber: "CMT-1",
  pickListId: dispatchPickListRow.id,
  status: "active",
};

const commitLineA = {
  id: "cl-uuid-1",
  commitmentId: "cmt-uuid-1",
  pickListItemId: "pli-uuid-1",
  lotLocationBalanceId: "bal-uuid-1",
  qtyCommitted: 10,
  qtyExecuted: 0,
  status: "active",
};
const commitLineB = {
  id: "cl-uuid-2",
  commitmentId: "cmt-uuid-1",
  pickListItemId: "pli-uuid-2",
  lotLocationBalanceId: "bal-uuid-2",
  qtyCommitted: 4,
  qtyExecuted: 0,
  status: "active",
};

function makeFullDispatchDb(
  updateOpts: {
    throwOnCall?: (table: TableRef, callNumberForTable: number) => boolean;
    rowCountForCall?: (
      table: TableRef,
      callNumberForTable: number,
    ) => number | undefined;
  } = {},
) {
  const queues = new Map<TableRef, unknown[][]>();
  queues.set(pickLists, [[dispatchPickListRow]]);
  queues.set(pickListItems, [[lineA, lineB]]);
  // Consumed once per line, in pick_list_items order (lineA then lineB).
  queues.set(lotLocationBalances, [[balanceA], [balanceB]]);
  queues.set(inventoryCommitmentLines, [[commitLineA], [commitLineB]]);
  queues.set(inventoryCommitments, [[commitmentHeader]]);

  const forCalls: Array<{ table: TableRef; strength: string }> = [];
  const select = makeQueuedSelect(queues, forCalls);
  const insertCap = makeCapturingInsert();
  const updateCap = makeCapturingUpdate(updateOpts);

  return {
    select,
    insert: insertCap.fn,
    update: updateCap.fn,
    _insertCalls: insertCap.calls,
    _updateCalls: updateCap.calls,
    _forCalls: forCalls,
  };
}

describe("dispatchPickList — Stage 2 full transaction contract (R3.3, design.md §7)", () => {
  it(
    "(AC: one inventory_transactions row per pick_list_items line, with real per-line " +
      "lotId/itemId/qty/fromLocationId/pick_list_id, never a single aggregate row and " +
      "never placeholder values) inserts exactly 2 inventory_transactions rows for a " +
      "2-line pick list, each carrying that line's own real data",
    async () => {
      const db = makeFullDispatchDb();

      const result = await dispatchPickList(
        supervisorResolver(),
        dispatchPickListRow.id,
        mockRlsDeps(db).deps,
      );

      expect(result.ok).toBe(true);

      const txnInserts = db._insertCalls.filter(
        (c) => c.table === inventoryTransactions,
      );
      expect(txnInserts).toHaveLength(2);

      const forLineA = txnInserts.find((c) => c.values.itemId === lineA.itemId);
      const forLineB = txnInserts.find((c) => c.values.itemId === lineB.itemId);
      expect(forLineA).toBeDefined();
      expect(forLineB).toBeDefined();

      // Real per-line data -- never the customer party UUID / qty 0
      // placeholders the current implementation hardcodes.
      expect(forLineA!.values).toMatchObject({
        lotId: lineA.lotId,
        itemId: lineA.itemId,
        qty: lineA.qty,
        fromLocationId: lineA.locationId,
        movementType: "pick",
        flowType: dispatchPickListRow.flowType,
        pickListId: dispatchPickListRow.id,
        performedByUserId: supervisorContext.userId,
      });
      expect(forLineB!.values).toMatchObject({
        lotId: lineB.lotId,
        itemId: lineB.itemId,
        qty: lineB.qty,
        fromLocationId: lineB.locationId,
        movementType: "pick",
        flowType: dispatchPickListRow.flowType,
        pickListId: dispatchPickListRow.id,
        performedByUserId: supervisorContext.userId,
      });

      // Never the placeholder values the current implementation writes.
      expect(forLineA!.values.lotId).not.toBe(dispatchPickListRow.customerPartyId);
      expect(forLineA!.values.itemId).not.toBe(dispatchPickListRow.customerPartyId);
      expect(forLineA!.values.qty).not.toBe(0);
      expect(forLineB!.values.lotId).not.toBe(dispatchPickListRow.customerPartyId);
      expect(forLineB!.values.itemId).not.toBe(dispatchPickListRow.customerPartyId);
      expect(forLineB!.values.qty).not.toBe(0);
    },
  );

  it(
    "(AC: qty_remaining AND qty_committed both decrement by the executed quantity, " +
      "per affected lot/location pair — design.md §7 steps 1-2) updates each " +
      "lot_location_balances row's qtyRemaining and qtyCommitted down by that line's qty",
    async () => {
      const db = makeFullDispatchDb();

      const result = await dispatchPickList(
        supervisorResolver(),
        dispatchPickListRow.id,
        mockRlsDeps(db).deps,
      );

      expect(result.ok).toBe(true);

      const balanceUpdates = db._updateCalls.filter(
        (c) => c.table === lotLocationBalances,
      );
      expect(balanceUpdates).toHaveLength(2);

      const forBalanceA = balanceUpdates.find(
        (c) => c.values.qtyRemaining === balanceA.qtyRemaining - lineA.qty,
      );
      const forBalanceB = balanceUpdates.find(
        (c) => c.values.qtyRemaining === balanceB.qtyRemaining - lineB.qty,
      );
      expect(forBalanceA).toBeDefined();
      expect(forBalanceB).toBeDefined();
      expect(forBalanceA!.values.qtyCommitted).toBe(
        balanceA.qtyCommitted - lineA.qty,
      );
      expect(forBalanceB!.values.qtyCommitted).toBe(
        balanceB.qtyCommitted - lineB.qty,
      );
    },
  );

  it(
    "(AC: each inventory_commitment_line transitions to executed with qty_executed set, " +
      "and the parent inventory_commitments header transitions to executed with " +
      "completed_at stamped — design.md §7 steps 3-4) updates both commitment lines " +
      "and the commitment header",
    async () => {
      const db = makeFullDispatchDb();

      const result = await dispatchPickList(
        supervisorResolver(),
        dispatchPickListRow.id,
        mockRlsDeps(db).deps,
      );

      expect(result.ok).toBe(true);

      const lineUpdates = db._updateCalls.filter(
        (c) => c.table === inventoryCommitmentLines,
      );
      expect(lineUpdates).toHaveLength(2);
      const executedForA = lineUpdates.find(
        (c) => c.values.qtyExecuted === lineA.qty,
      );
      const executedForB = lineUpdates.find(
        (c) => c.values.qtyExecuted === lineB.qty,
      );
      expect(executedForA).toBeDefined();
      expect(executedForA!.values.status).toBe("executed");
      expect(executedForB).toBeDefined();
      expect(executedForB!.values.status).toBe("executed");

      const headerUpdates = db._updateCalls.filter(
        (c) => c.table === inventoryCommitments,
      );
      expect(headerUpdates).toHaveLength(1);
      expect(headerUpdates[0].values.status).toBe("executed");
      expect(headerUpdates[0].values.completedAt).toBeTruthy();
    },
  );

  it(
    "(AC: pick_list_id set on every inserted transaction row — design.md §7 note) " +
      "carries the dispatched pick_lists.id on both inserted inventory_transactions rows",
    async () => {
      const db = makeFullDispatchDb();

      await dispatchPickList(
        supervisorResolver(),
        dispatchPickListRow.id,
        mockRlsDeps(db).deps,
      );

      const txnInserts = db._insertCalls.filter(
        (c) => c.table === inventoryTransactions,
      );
      expect(txnInserts).toHaveLength(2);
      for (const insert of txnInserts) {
        expect(insert.values.pickListId).toBe(dispatchPickListRow.id);
      }
    },
  );

  it(
    "(AC: atomicity — a mid-loop failure leaves no partial dispatch state) rolls back " +
      "and rejects when the second line's balance decrement throws, never reaching the " +
      "pick_list status transition",
    async () => {
      const db = makeFullDispatchDb({
        throwOnCall: (table, n) => table === lotLocationBalances && n === 2,
      });
      const { deps, conn } = mockRlsDeps(db);

      await expect(
        dispatchPickList(supervisorResolver(), dispatchPickListRow.id, deps),
      ).rejects.toThrow();

      expect(conn.commit).not.toHaveBeenCalled();
      expect(conn.rollback).toHaveBeenCalledTimes(1);

      // The pick_list status transition (design.md §7 step 6) happens after
      // the per-line balance/commitment work; a mid-loop throw must mean it
      // never ran, i.e. no partial "dispatched" state was written.
      const pickListStatusUpdates = db._updateCalls.filter(
        (c) => c.table === pickLists,
      );
      expect(pickListStatusUpdates).toHaveLength(0);
    },
  );
});

// ---------------------------------------------------------------------------
// dispatchPickList — lost-race (zero-row) CAS miss on lot_location_balances
//
// Traceability:
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/requirements.md
//     R3.3 — "Final dispatch confirmation atomically decrements
//             qty_remaining, releases qty_committed, writes an immutable
//             pick transaction..." -- "atomically" is not satisfied if a
//             losing writer under the optimistic-concurrency guard can
//             silently proceed as though its own decrement had applied.
//     Acceptance criteria (§5) -- "Stage 2 dispatch decrements
//             qty_remaining" -- a decrement that was actually lost to a
//             concurrent writer, and not surfaced, is not a decrement this
//             criterion can be read as satisfied by.
//   specs/00-steering/revision-log.md's 2026-08-20 "Stage 2 dispatch fix
//     complete, four findings resolved" entry, finding #2's own documented
//     residual gap: "the balance update still has no `.returning()`/
//     row-count check, so a lost race on a *different* pick list touching
//     the same `lot_location_balances` row can't be detected... left as an
//     accepted, documented follow-up, not blocking." This test closes that
//     follow-up's RED step.
//   lib/actions/withdrawals.ts's own inline comment directly above the
//     `lotLocationBalances` CAS-guard `.update()` call: "A losing writer's
//     UPDATE affects zero rows and the caller has no way to notice and
//     retry or surface an error... Adding a row-count check here... is the
//     remaining follow-up, not closed by this fix."
//
// This is a unit-test-tier simulation (per specs/00-steering/testing.md's
// two-stage DB testing strategy): the mock's `.where(...)` is configured to
// resolve to a zero-`count` result for line B's balance UPDATE, standing in
// for Postgres's real behavior when a concurrent transaction on a
// DIFFERENT pick list has already changed that same `lot_location_balances`
// row's `qty_remaining`/`qty_committed` between this line's SELECT and this
// UPDATE, so the CAS guard's WHERE clause no longer matches. Real
// concurrent-transaction verification against actual Postgres is
// db-migration-verifier's tier, not this file's.
// ---------------------------------------------------------------------------

describe(
  "dispatchPickList — CAS zero-row miss on lot_location_balances is detected, " +
    "not silently treated as success (R3.3, design.md §7 steps 1-2; " +
    "revision-log.md 2026-08-20 finding #2's documented residual gap)",
  () => {
    it(
      "(AC: a lost optimistic-concurrency race on lot_location_balances must not " +
        "silently succeed) returns a distinct concurrent-modification error -- never " +
        "{ ok: true }, and never the generic thrown-constraint-violation error used " +
        "for other per-line failures -- and rolls back the whole transaction with no " +
        "partial pick_list/commitment/ledger writes, when the second line's " +
        "CAS-guarded balance UPDATE affects zero rows",
      async () => {
        const db = makeFullDispatchDb({
          // Line B's lot_location_balances UPDATE (the 2nd call against that
          // table) "loses the race": another transaction already changed
          // bal-uuid-2 between this line's SELECT and this UPDATE, so the
          // CAS guard's WHERE clause matches zero rows.
          rowCountForCall: (table, n) =>
            table === lotLocationBalances && n === 2 ? 0 : undefined,
        });
        const { deps, conn } = mockRlsDeps(db);

        const result = await dispatchPickList(
          supervisorResolver(),
          dispatchPickListRow.id,
          deps,
        );

        // Must be a distinct, recoverable error result -- not a silent
        // { ok: true }. The current implementation never reads the
        // `.where(...)` result at all, so it cannot distinguish this case
        // from an ordinary successful update and always resolves
        // `{ ok: true }` here today.
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(Array.isArray(result.errors)).toBe(true);
          expect(result.errors).toContain("concurrent_modification");
          // Distinct from the generic per-line failure error this same
          // file's atomicity test above exercises (a thrown constraint
          // violation) -- a lost CAS race is an expected, named condition,
          // not an unnamed generic failure.
          expect(result.errors).not.toContain(
            "simulated_constraint_violation",
          );
        }

        // The whole transaction must roll back -- nothing partially
        // committed for this pick list.
        expect(conn.commit).not.toHaveBeenCalled();
        expect(conn.rollback).toHaveBeenCalledTimes(1);

        // No partial dispatch state: the pick_list status transition
        // (design.md §7 step 6) happens only after every line succeeds.
        const pickListStatusUpdates = db._updateCalls.filter(
          (c) => c.table === pickLists,
        );
        expect(pickListStatusUpdates).toHaveLength(0);

        // Line B's own commitment-line transition and ledger insert must
        // never have run either -- the lost race on line B's balance must
        // stop the per-line loop at line B, not merely at the very end.
        const lineBCommitmentUpdate = db._updateCalls.find(
          (c) =>
            c.table === inventoryCommitmentLines &&
            c.values.qtyExecuted === lineB.qty,
        );
        expect(lineBCommitmentUpdate).toBeUndefined();

        const lineBTxnInsert = db._insertCalls.find(
          (c) =>
            c.table === inventoryTransactions &&
            c.values.itemId === lineB.itemId,
        );
        expect(lineBTxnInsert).toBeUndefined();

        // The commitment header must not have transitioned to 'executed'
        // either -- that only happens once every line has succeeded.
        const headerUpdates = db._updateCalls.filter(
          (c) => c.table === inventoryCommitments,
        );
        expect(headerUpdates).toHaveLength(0);
      },
    );
  },
);

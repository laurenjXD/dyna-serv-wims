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
  markPickListPicked,
  requestFifoOverride,
  dispatchPickList,
  selectPickUnit,
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
import { inventoryUnits } from "@/lib/db/schema/inventory_units";

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
    { resource: "fifo_override", action: "request", scopeKind: "global" },
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

const pickerResolver = () =>
  makeResolver({
    kind: "authorized",
    context: {
      ...warehouseStaffContext,
      grants: [
        ...warehouseStaffContext.grants,
        { resource: "pick_list", action: "execute", scopeKind: "global" },
      ],
    },
  });

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

function makeWithdrawalDb(
  pickListRows: AnyRecord[] = [],
  selectRows: unknown[][] = [],
) {
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
    execute: vi.fn().mockResolvedValue([]),

    select: vi.fn().mockImplementation(() =>
      makeSelectChain(selectRows.shift() ?? pickListRows, forCalls),
    ),

    insert: vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation((row: unknown) => {
        inserted.push(row);
        return {
          returning: vi.fn().mockResolvedValue([{ id: "new-uuid-generated", requestNumber: "AR-000001" }]),
        };
      }),
    })),

    update: vi.fn().mockImplementation(() => ({
      set: vi.fn().mockImplementation((vals: unknown) => {
        updated.push(vals);
        return {
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: "balance-uuid-1" }]),
          }),
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

function allocationRow(overrides: Partial<AnyRecord> = {}): AnyRecord {
  return {
    balanceId: "balance-uuid-1",
    qtyRemaining: 25,
    qtyCommitted: 0,
    itemId: "item-uuid-1",
    itemCode: "ITEM-001",
    itemDescription: "Test item",
    customerItemCode: null,
    dsgcItemNumber: "DSGC-001",
    supplierItemCode: "SUP-001",
    defaultSupplierPartyId: "party-uuid-customer",
    isPerishable: false,
    spq: 5,
    lotId: "lot-uuid-1",
    lotNumber: "LOT-001",
    lotStatus: "available",
    lotFlowType: "trading",
    locationId: "loc-uuid-1",
    locationLabel: "A1-01",
    expiryDate: null,
    receivedAt: new Date("2026-08-01T00:00:00Z"),
    ...overrides,
  };
}

function commitmentLineRow(overrides: Partial<AnyRecord> = {}): AnyRecord {
  return {
    commitmentId: "commitment-uuid-1",
    commitmentStatus: "active",
    commitmentLineId: "commitment-line-uuid-1",
    commitmentLineStatus: "active",
    qtyCommitted: 10,
    balanceId: "balance-uuid-1",
    pickListItemId: "pick-list-item-uuid-1",
    itemId: "item-uuid-1",
    lotId: "lot-uuid-1",
    locationId: "loc-uuid-1",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// commitWithdrawal — Authorization
// (R5.1, R10.1, R10.2, design.md §6 step 1)
// ---------------------------------------------------------------------------

describe("commitWithdrawal — unauthorized (R5.1, R10.1, R10.2, design.md §6)", () => {
  it("(AC: withdrawal.request required) returns { ok: false, errors: ['forbidden'] } when resolver lacks withdrawal.request capability", async () => {
    const db = makeWithdrawalDb([], [[allocationRow()]]);

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
    const db = makeWithdrawalDb([], [[allocationRow()]]);

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
    expect(db._inserted).toContainEqual(expect.objectContaining({
      status: "allocated",
    }));
  });

  it("rebuilds FIFO allocation server-side instead of trusting the requested lot", async () => {
    const oldest = allocationRow({ lotId: "lot-oldest", lotNumber: "LOT-OLD", receivedAt: new Date("2026-01-01T00:00:00Z") });
    const newer = allocationRow({
      balanceId: "balance-uuid-2",
      lotId: "lot-newer",
      lotNumber: "LOT-NEW",
      receivedAt: new Date("2026-02-01T00:00:00Z"),
    });
    const db = makeWithdrawalDb([], [[oldest, newer]]);
    const input = validCommitInput();
    input.lines[0].lotId = "lot-newer"; // browser tries to skip FIFO

    const result = await commitWithdrawal(supervisorResolver(), input, mockRlsDeps(db).deps);

    expect(result.ok).toBe(true);
    expect(db._inserted).toContainEqual(expect.objectContaining({
      lotId: "lot-oldest",
      lotNumber: "LOT-OLD",
    }));
  });

  it("rejects a client-supplied organization that differs from the enrolled item organization", async () => {
    const db = makeWithdrawalDb([], [[allocationRow()]]);
    const input = validCommitInput();
    input.partyId = "other-party";

    const result = await commitWithdrawal(supervisorResolver(), input, mockRlsDeps(db).deps);

    expect(result).toEqual({ ok: false, errors: ["unable_to_reserve_stock"] });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("uses the exact alternate pallet only when an approval reference is supplied", async () => {
    const oldest = allocationRow({ lotId: "lot-oldest", lotNumber: "LOT-OLD", receivedAt: new Date("2026-01-01T00:00:00Z") });
    const newer = allocationRow({ balanceId: "balance-uuid-2", lotId: "lot-newer", lotNumber: "LOT-NEW", locationId: "loc-uuid-2", receivedAt: new Date("2026-02-01T00:00:00Z") });
    const db = makeWithdrawalDb([], [[oldest, newer]]);
    const input = validCommitInput();
    input.lines[0].lotId = "lot-newer";
    input.lines[0].locationId = "loc-uuid-2";
    const approvedInput = { ...input, approvalRequestId: "approval-request-uuid" };

    const result = await commitWithdrawal(supervisorResolver(), approvedInput, mockRlsDeps(db).deps);

    expect(result.ok).toBe(true);
    expect(db.execute).toHaveBeenCalled();
    expect(db._inserted).toContainEqual(expect.objectContaining({ lotId: "lot-newer", locationId: "loc-uuid-2" }));
  });
});

describe("requestFifoOverride — exact alternate pallet approval", () => {
  it("creates a pending request for an out-of-sequence pallet", async () => {
    const oldest = allocationRow({ lotId: "lot-oldest", lotNumber: "LOT-OLD", receivedAt: new Date("2026-01-01T00:00:00Z"), allocationVersion: 4 });
    const newer = allocationRow({ balanceId: "balance-uuid-2", lotId: "lot-newer", lotNumber: "LOT-NEW", locationId: "loc-uuid-2", locationLabel: "B1-02", receivedAt: new Date("2026-02-01T00:00:00Z"), allocationVersion: 7 });
    const db = makeWithdrawalDb([], [[oldest, newer]]);
    const input = validCommitInput();
    input.lines[0].lotId = "lot-newer";
    input.lines[0].locationId = "loc-uuid-2";

    const result = await requestFifoOverride(supervisorResolver(), input, "Aisle A is temporarily inaccessible.", mockRlsDeps(db).deps);

    expect(result).toEqual({ ok: true, requestId: "new-uuid-generated", requestNumber: "AR-000001" });
    expect(db._inserted).toContainEqual(expect.objectContaining({
      approvalType: "fifo_override",
      targetResourceId: "balance-uuid-2",
    }));
  });

  it("rejects an override request when the selected pallet is already the FIFO recommendation", async () => {
    const db = makeWithdrawalDb([], [[allocationRow()]]);
    const result = await requestFifoOverride(supervisorResolver(), validCommitInput(), "Use the normally assigned source pallet.", mockRlsDeps(db).deps);

    expect(result).toEqual({ ok: false, errors: ["override_not_required"] });
    expect(db.insert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// commitWithdrawal — Commitment expiry: 24-hour TTL set at creation
// (RED step — lib/actions/withdrawals.ts commitWithdrawal does not yet set
// expiresAt on the inventory_commitments insert; the schema/enum support
// already exist: lib/db/schema/commitments.ts's inventoryCommitments.expiresAt
// nullable timestamp column, lib/db/schema/enums.ts's commitmentStatusEnum
// 'expired' value)
//
// Traceability:
//   specs/00-steering/revision-log.md — "Spec 08 — Pick-list expiry
//     enforcement: Option C (staleness check at Stage 2 + nightly CRON
//     sweep)": "Stage 2 dispatch rejects and marks `expired` in real time
//     when `expires_at` is in the past. A nightly pg_cron job sweeps for any
//     commitments past `expires_at` that were never attempted..."
//   Product Owner decision (2026-08-21 amendment referenced in this task):
//     TTL duration is 24 hours from commitment creation.
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/design.md §6 —
//     Stage 1 commitment transaction (this is where the reservation/
//     commitment header row, and therefore its expiry, is created).
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/tasks.md
//     Task 1 (line ~46, resolved): "Expiry enforcement mechanism..." —
//     records the mechanism decision this test protects.
//     Task 4 (unchecked): "Implement safe cancellation/release/expiry before
//     dispatch with concurrency protection" — the implementation item this
//     test is RED against.
//
// Mechanism note (proposal, not gospel — flagged for backend-builder): these
// tests accept `expiresAt` as either a JS `Date` (matching this file's
// existing `updatedAt: new Date()` pattern elsewhere in withdrawals.ts) or an
// ISO date string. If the builder instead uses a raw
// `sql\`now() + interval '24 hours'\`` fragment, the "computed, ~24h out"
// assertions below will need adjusting to decode that fragment — this is a
// deliberate design choice left open per the parent task's instructions.
// ---------------------------------------------------------------------------

function resolveExpiresAtMs(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") return new Date(value).getTime();
  throw new Error(
    `commitWithdrawal wrote a non-Date/non-string expiresAt (${JSON.stringify(value)}) — ` +
      "if this is a raw SQL fragment (e.g. sql`now() + interval '24 hours'`), this test's " +
      "decoding needs to change to match; see the mechanism note above this test block.",
  );
}

describe("commitWithdrawal — sets a 24-hour expiresAt at creation (TTL PO decision; revision-log.md 'Pick-list expiry enforcement: Option C'; design.md §6; tasks.md Task 1 line ~46 / Task 4)", () => {
  it("(AC: inventory_commitments row includes a computed expiresAt ~24h after creation) inserts inventory_commitments with expiresAt set to approximately now + 24 hours", async () => {
    const db = makeWithdrawalDb([], [[allocationRow()]]);
    const before = Date.now();

    const result = await commitWithdrawal(supervisorResolver(), validCommitInput(), mockRlsDeps(db).deps);

    const after = Date.now();
    expect(result.ok).toBe(true);

    const commitmentInsert = (db._inserted as AnyRecord[]).find(
      (row) => "commitmentNumber" in row,
    );
    expect(commitmentInsert).toBeDefined();
    expect(commitmentInsert?.expiresAt).toBeDefined();

    const expiresAtMs = resolveExpiresAtMs(commitmentInsert?.expiresAt);
    const toleranceMs = 5_000;
    expect(expiresAtMs).toBeGreaterThanOrEqual(before + 24 * 60 * 60 * 1000 - toleranceMs);
    expect(expiresAtMs).toBeLessThanOrEqual(after + 24 * 60 * 60 * 1000 + toleranceMs);
  });

  it("(AC: expiresAt is computed server-side, not client-suppliable) ignores a client-supplied far-future expiresAt on the input and still computes ~24h from now", async () => {
    const db = makeWithdrawalDb([], [[allocationRow()]]);
    const input = validCommitInput() as AnyRecord;
    // A client attempting to extend its own reservation lifetime.
    input.expiresAt = "2099-01-01T00:00:00.000Z";

    const result = await commitWithdrawal(supervisorResolver(), input, mockRlsDeps(db).deps);
    expect(result.ok).toBe(true);

    const commitmentInsert = (db._inserted as AnyRecord[]).find(
      (row) => "commitmentNumber" in row,
    );
    const expiresAtMs = resolveExpiresAtMs(commitmentInsert?.expiresAt);

    expect(expiresAtMs).not.toBe(new Date("2099-01-01T00:00:00.000Z").getTime());
    // Must still land within a 24h(+tolerance) window of "now", proving the
    // server recomputed it rather than trusting the client-supplied value.
    expect(expiresAtMs).toBeLessThan(Date.now() + 25 * 60 * 60 * 1000);
  });
});

// ---------------------------------------------------------------------------
// commitWithdrawal — Bug 1: allocation SELECT never projects the fields it
// reads (lib/actions/withdrawals.ts commitWithdrawal, ~lines 165-222)
//
// The SELECT at lines 165-196 projects lotId/lotNumber/lotStatus/etc. from
// `lots` and does `.orderBy(asc(lots.expiryDate), asc(lots.createdAt))`, but
// never SELECTS `lots.expiryDate`/`lots.createdAt` into the row shape (no
// `receivedAt`/`expiryDate` alias anywhere in the select). Lines 217-218 then
// read `row.receivedAt`/`row.expiryDate` from those same rows — both always
// undefined.
//
// The tests directly above this block ("rebuilds FIFO allocation
// server-side...") mask this bug entirely: allocationRow()'s fixture hands
// `receivedAt`/`expiryDate` straight into the mocked db.select() return
// value, bypassing the real SELECT's column projection altogether — so they
// pass today regardless of whether the bug is fixed. makeSelectFidelityDb
// below instead behaves like a real Postgres round-trip with respect to
// column projection: a row's receivedAt/expiryDate fields are populated ONLY
// when the `.select({...})` config actually passed to db.select() this call
// names a key whose Drizzle Column#name is 'created_at' / 'expiry_date' (the
// underlying lots columns) — exactly the two aliases the current SELECT is
// missing. This makes these tests genuinely satisfiable by the real fix
// (adding `receivedAt: lots.createdAt, expiryDate: lots.expiryDate,` to the
// select object), not merely by a fixture change.
//
// Traceability:
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/design.md
//     §5 — Allocation and FIFO/FEFO design, rules 2-4: "lots.status =
//          'available' as the sole eligibility gate"; "FEFO by expiry for
//          perishable items and FIFO by approved received/created ordering
//          for non-perishable items"
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/requirements.md
//     R2.1 — Allocation considers only lots with status = 'available'.
//     R2.2 — FEFO applies to perishable items, FIFO to non-perishable items.
// ---------------------------------------------------------------------------

function fidelityLotRow(
  overrides: Partial<AnyRecord> & {
    realReceivedAt?: Date;
    realExpiryDate?: string | null;
  } = {},
): AnyRecord {
  const { realReceivedAt, realExpiryDate, ...rest } = overrides;
  return {
    balanceId: "balance-uuid-1",
    qtyRemaining: 25,
    qtyCommitted: 0,
    itemId: "item-uuid-1",
    itemCode: "ITEM-001",
    itemDescription: "Test item",
    customerItemCode: null,
    dsgcItemNumber: "DSGC-001",
    supplierItemCode: "SUP-001",
    defaultSupplierPartyId: "party-uuid-customer",
    isPerishable: false,
    spq: 5,
    lotId: "lot-uuid-1",
    lotNumber: "LOT-001",
    lotStatus: "available",
    lotFlowType: "trading",
    locationId: "loc-uuid-1",
    locationLabel: "A1-01",
    // Deliberately no receivedAt/expiryDate keys here — matching today's
    // actual SELECT shape. __realReceivedAt/__realExpiryDate are the values
    // a real Postgres row WOULD carry once the select is fixed to project
    // lots.created_at/lots.expiry_date; makeSelectFidelityDb below only
    // surfaces them if the projection passed to db.select() actually asks
    // for those two underlying columns.
    __realReceivedAt: realReceivedAt ?? new Date("2026-08-01T00:00:00Z"),
    __realExpiryDate: realExpiryDate === undefined ? null : realExpiryDate,
    ...rest,
  };
}

function makeSelectFidelityDb(rows: AnyRecord[]) {
  const inserted: unknown[] = [];
  const updated: unknown[] = [];

  return {
    _inserted: inserted,
    _updated: updated,

    select: vi.fn().mockImplementation((projection?: Record<string, { name?: string }>) => {
      const proj = projection ?? {};
      const receivedAtKey = Object.keys(proj).find(
        (k) => proj[k]?.name === "created_at",
      );
      const expiryDateKey = Object.keys(proj).find(
        (k) => proj[k]?.name === "expiry_date",
      );

      const projectedRows = rows.map((row) => {
        const { __realReceivedAt, __realExpiryDate, ...visible } = row;
        if (receivedAtKey) visible[receivedAtKey] = __realReceivedAt;
        if (expiryDateKey) visible[expiryDateKey] = __realExpiryDate;
        return visible;
      });

      const chain: AnyRecord = {};
      for (const method of ["from", "where", "innerJoin", "leftJoin", "orderBy", "limit", "offset"]) {
        chain[method] = vi.fn(() => chain);
      }
      const resolved = Promise.resolve(projectedRows);
      chain["then"] = resolved.then.bind(resolved);
      chain["catch"] = resolved.catch.bind(resolved);
      chain["finally"] = resolved.finally.bind(resolved);
      return chain;
    }),

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
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: "balance-uuid-1" }]),
          }),
        };
      }),
    })),
  };
}

describe("commitWithdrawal — FIFO across 2+ non-perishable lots (Bug 1, design.md §5 rules 2-4, R2.1-R2.2)", () => {
  it("(AC: succeeds instead of unable_to_reserve_stock) reserves stock spanning two non-perishable lots instead of throwing inside allocate()'s FIFO sort comparator", async () => {
    const oldest = fidelityLotRow({
      balanceId: "balance-oldest",
      lotId: "lot-oldest",
      lotNumber: "LOT-OLD",
      qtyRemaining: 15,
      isPerishable: false,
      realReceivedAt: new Date("2026-01-01T00:00:00Z"),
    });
    const newer = fidelityLotRow({
      balanceId: "balance-newer",
      lotId: "lot-newer",
      lotNumber: "LOT-NEW",
      qtyRemaining: 15,
      isPerishable: false,
      realReceivedAt: new Date("2026-02-01T00:00:00Z"),
    });
    const db = makeSelectFidelityDb([oldest, newer]);
    const input = validCommitInput();
    input.lines[0].qty = 20; // spans both lots (15 + 5); genuinely available

    const result = await commitWithdrawal(supervisorResolver(), input, mockRlsDeps(db).deps);

    // Today: the allocation SELECT never projects lots.created_at, so
    // row.receivedAt is always undefined; allocate()'s FIFO branch does
    // a.receivedAt.getTime() unconditionally, throwing a TypeError that
    // commitWithdrawal's outer catch swallows into
    // { ok: false, errors: ["unable_to_reserve_stock"] } — even though 30
    // units are genuinely available for this 20-unit request.
    expect(result.ok).toBe(true);
  });

  it("(AC: allocates oldest-received lot first, not input order) allocates from the oldest-received lot first even when rows arrive in the WRONG (non-FIFO) order", async () => {
    const oldest = fidelityLotRow({
      balanceId: "balance-oldest",
      lotId: "lot-oldest",
      lotNumber: "LOT-OLD",
      qtyRemaining: 5,
      isPerishable: false,
      realReceivedAt: new Date("2026-01-01T00:00:00Z"),
    });
    const newer = fidelityLotRow({
      balanceId: "balance-newer",
      lotId: "lot-newer",
      lotNumber: "LOT-NEW",
      qtyRemaining: 15,
      isPerishable: false,
      realReceivedAt: new Date("2026-02-01T00:00:00Z"),
    });
    // Deliberately returned newest-first — a correct implementation must
    // sort by the real receivedAt value itself, not rely on rows already
    // arriving pre-sorted.
    const db = makeSelectFidelityDb([newer, oldest]);
    const input = validCommitInput();
    input.lines[0].qty = 12; // exhausts the oldest lot (5) then takes 7 from newer

    const result = await commitWithdrawal(supervisorResolver(), input, mockRlsDeps(db).deps);

    expect(result.ok).toBe(true);
    const pickListItemInserts = (db._inserted as AnyRecord[]).filter(
      (row) => "lotNumber" in row && "qty" in row,
    );
    expect(pickListItemInserts).toContainEqual(
      expect.objectContaining({ lotId: "lot-oldest", qty: 5 }),
    );
    expect(pickListItemInserts).toContainEqual(
      expect.objectContaining({ lotId: "lot-newer", qty: 7 }),
    );
  });
});

describe("commitWithdrawal — FEFO across 2+ perishable lots (Bug 1, design.md §5 rules 2-4, R2.1-R2.2)", () => {
  it("(AC: allocates earliest-expiry lot first, not input order) allocates from the earliest-expiring lot first, given rows returned in the WRONG (non-FEFO) order", async () => {
    const earlyExpiry = fidelityLotRow({
      balanceId: "balance-early",
      lotId: "lot-early",
      lotNumber: "LOT-EARLY",
      qtyRemaining: 5,
      isPerishable: true,
      realExpiryDate: "2026-09-01",
    });
    const lateExpiry = fidelityLotRow({
      balanceId: "balance-late",
      lotId: "lot-late",
      lotNumber: "LOT-LATE",
      qtyRemaining: 15,
      isPerishable: true,
      realExpiryDate: "2027-01-01",
    });
    // Deliberately returned with the LATER-expiring lot first — design.md §5
    // rule 2 requires FEFO ("by expiry") for perishable items; this must not
    // depend on rows already arriving pre-sorted by expiry.
    const db = makeSelectFidelityDb([lateExpiry, earlyExpiry]);
    const input = validCommitInput();
    input.lines[0].qty = 12; // exhausts the earlier-expiring lot (5) then takes 7 from later

    const result = await commitWithdrawal(supervisorResolver(), input, mockRlsDeps(db).deps);

    // Today: row.expiryDate is always undefined (never selected), so
    // commitWithdrawal's mapping (line 218) maps it to `null` for every row;
    // allocate()'s FEFO comparator then returns NaN for every null-vs-null
    // comparison, which V8's stable sort treats as "no reorder" — silently
    // preserving the (deliberately wrong) input order above instead of
    // genuinely sorting by expiry. With lot-late listed first and having
    // enough qty (15 >= 12) to satisfy the whole request alone, the buggy
    // behavior allocates all 12 units from lot-late and never touches
    // lot-early at all.
    expect(result.ok).toBe(true);
    const pickListItemInserts = (db._inserted as AnyRecord[]).filter(
      (row) => "lotNumber" in row && "qty" in row,
    );
    expect(pickListItemInserts).toContainEqual(
      expect.objectContaining({ lotId: "lot-early", qty: 5 }),
    );
    expect(pickListItemInserts).toContainEqual(
      expect.objectContaining({ lotId: "lot-late", qty: 7 }),
    );
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
      [],
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

describe("markPickListPicked — physical pick completion", () => {
  it("moves an allocated Pick List to picked without changing inventory", async () => {
    const db = makeWithdrawalDb([], [
      [{ status: "allocated" }],
      [{ id: "line-1" }],
    ]);

    const result = await markPickListPicked(
      pickerResolver(),
      "pick-list-1",
      [],
      mockRlsDeps(db).deps,
    );

    expect(result).toEqual({ ok: true });
    expect(db._updated).toContainEqual(expect.objectContaining({ status: "picked" }));
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe("selectPickUnit — WRR-style shared QR dispatch counting", () => {
  const sharedItemQr = "ITEM-1";

  it("rejects a QR that does not match any Pick List item or lot", async () => {
    const db = makeWithdrawalDb([], [
      [{ id: "line-1", itemCode: "ITEM-1", itemBarcode: "ITEM-1", lotId: "lot-1", lotNumber: "LOT-1", locationId: "loc-a", numberOfBoxes: 1, pickListStatus: "picked" }],
    ]);

    const result = await selectPickUnit(
      pickerResolver(),
      "pick-list-1",
      "WRONG-ITEM",
      mockRlsDeps(db).deps,
    );

    expect(result).toEqual({ ok: false, errors: ["wrong_item_or_lot_qr"] });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("counts a repeated matching QR against its matching line", async () => {
    const db = makeWithdrawalDb([], [
      [{ id: "line-1", itemCode: "ITEM-1", itemBarcode: "ITEM-1", lotId: "lot-1", lotNumber: "LOT-1", locationId: "loc-a", numberOfBoxes: 2, pickListStatus: "picked" }],
      [{ id: "already-selected" }],
      [{ id: "unit-row-1", lotId: "lot-1", locationId: "loc-a", status: "available", pickListItemId: null }],
    ]);

    const result = await selectPickUnit(
      pickerResolver(),
      "pick-list-1",
      sharedItemQr,
      mockRlsDeps(db).deps,
    );

    expect(result).toEqual({ ok: true, selectedCount: 2, requiredCount: 2 });
    expect(db._updated).toContainEqual(expect.objectContaining({
      status: "selected",
      pickListItemId: "line-1",
    }));
  });

  it("chooses the matching Pick List line instead of a client-selected active line", async () => {
    const db = makeWithdrawalDb([], [
      [
        { id: "line-1", itemCode: "ITEM-1", itemBarcode: "ITEM-1", lotId: "lot-1", lotNumber: "LOT-1", locationId: "loc-a", numberOfBoxes: 1, pickListStatus: "picked" },
        { id: "line-2", itemCode: "ITEM-2", itemBarcode: "ITEM-2", lotId: "lot-2", lotNumber: "LOT-2", locationId: "loc-b", numberOfBoxes: 1, pickListStatus: "picked" },
      ],
      [],
      [{ id: "unit-row-2", lotId: "lot-2", locationId: "loc-b", status: "available", pickListItemId: null }],
    ]);

    const result = await selectPickUnit(
      pickerResolver(),
      "pick-list-1",
      "ITEM-2",
      mockRlsDeps(db).deps,
    );

    expect(result).toEqual({ ok: true, selectedCount: 1, requiredCount: 1 });
    expect(db._updated).toContainEqual(expect.objectContaining({
      status: "selected",
      pickListItemId: "line-2",
    }));
  });

  it("counts a committed shared-QR box when a legacy lot is missing its internal unit row", async () => {
    const db = makeWithdrawalDb([], [
      [{ id: "line-1", itemCode: "ITEM-1", itemBarcode: "ITEM-1", lotId: "lot-1", lotNumber: "LOT-1", locationId: "loc-a", numberOfBoxes: 2, pickListStatus: "picked" }],
      [{ id: "already-selected" }],
      [],
      [{ wrrItemId: "wrr-item-1", unitIndex: 1 }],
    ]);

    const result = await selectPickUnit(
      pickerResolver(),
      "pick-list-1",
      sharedItemQr,
      mockRlsDeps(db).deps,
    );

    expect(result).toEqual({ ok: true, selectedCount: 2, requiredCount: 2 });
    expect(db._inserted).toContainEqual(expect.objectContaining({
      wrrItemId: "wrr-item-1",
      lotId: "lot-1",
      locationId: "loc-a",
      status: "selected",
      pickListItemId: "line-1",
    }));
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
      [],
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
      [],
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
      [],
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
        ["pli-uuid-1", "pli-uuid-2"],
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
  it("rejects dispatch when the committed lines have not all been scanned", async () => {
    const picked = pickListRow({ status: "picked" });
    const db = makeWithdrawalDb([picked], [
      [picked],
      [{ id: "pick-list-item-uuid-1", numberOfBoxes: 1 }],
      [{ id: "commitment-uuid-1", status: "active", expiresAt: null }],
    ]);

    const result = await dispatchPickList(
      supervisorResolver(),
      "pick-list-uuid-existing",
      [],
      mockRlsDeps(db).deps,
    );

    expect(result).toEqual({ ok: false, errors: ["scan_evidence_incomplete"] });
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  // dispatchPickList's happy-path select sequence, per its current merged
  // implementation: (1) pick_lists (FOR UPDATE), (2) pick_list_items
  // (includes numberOfBoxes, used by the exact-box-count check below),
  // (3) inventory_commitments header (expiresAt — null here, non-expired
  // path), (4) inventory_units rows already 'selected' for this line (the
  // fix-it-felix exact-box-count check — count must equal numberOfBoxes),
  // then per-line: (5) lot_location_balances, (6) inventory_commitment_lines.
  // Status must be 'picked', not 'allocated' — dispatch now requires the
  // exact-picking stage (markPickListPicked/completeExactPick) to have
  // already completed (fix-it-felix, spec 08 R3.3 2026-08-24).
  function fullDispatchSelectSequence(picked: AnyRecord) {
    return [
      [picked],
      [{
        id: "pick-list-item-uuid-1",
        itemId: "item-uuid-1",
        lotId: "lot-uuid-1",
        locationId: "loc-uuid-1",
        qty: 10,
        numberOfBoxes: 1,
      }],
      [{ id: "commitment-uuid-1", status: "active", expiresAt: null }],
      [{ pickListItemId: "pick-list-item-uuid-1" }],
      [{ id: "balance-uuid-1", qtyRemaining: 50, qtyCommitted: 10 }],
      [{ id: "commitment-line-uuid-1" }],
    ];
  }

  it("(AC: supervisor dispatches picked list) returns { ok: true } after exact picking", async () => {
    const picked = pickListRow({ status: "picked" });
    const db = makeWithdrawalDb([picked], fullDispatchSelectSequence(picked));

    const result = await dispatchPickList(
      supervisorResolver(),
      "pick-list-uuid-existing",
      ["pick-list-item-uuid-1"],
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);
  });

  it("(AC: warehouse_staff dispatches picked list) returns { ok: true } for warehouse_staff with execute capability", async () => {
    const picked = pickListRow({ status: "picked" });
    const db = makeWithdrawalDb([picked], fullDispatchSelectSequence(picked));

    const result = await dispatchPickList(
      warehouseStaffResolver(),
      "pick-list-uuid-existing",
      ["pick-list-item-uuid-1"],
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// dispatchPickList — Commitment expiry enforcement: Stage 2 real-time
// rejection (RED step — dispatchPickList does not yet check expires_at at
// all; every commitmentLineRow fixture below carries an expiresAt the
// current implementation never reads, so the expired-commitment test is
// expected to fail because dispatch still SUCCEEDS today (ok: true) instead
// of being rejected, not because of a fixture typo.)
//
// Traceability:
//   specs/00-steering/revision-log.md — "Spec 08 — Pick-list expiry
//     enforcement: Option C": "Stage 2 dispatch rejects and marks `expired`
//     in real time when `expires_at` is in the past... Both paths write the
//     same `expired` transition; the CRON is the safety net, not the primary
//     enforcer."
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/design.md §7 —
//     Stage 2 physical execution and dispatch transaction: "The final
//     dispatch command rechecks: current actor/capability/scope; pick-list
//     status and commitment ownership; ... current lot status, selected
//     lot/location balance, and reservation state..." — an expired
//     reservation is exactly the "reservation state" recheck this test
//     protects; the check runs before any of §7's numbered dispatch-write
//     steps (decrement/release/insert transaction/status transitions).
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/tasks.md
//     Task 4 (unchecked): "Implement safe cancellation/release/expiry before
//     dispatch with concurrency protection."
//
// Error-string proposal (flagged, not gospel): "commitment_expired" — chosen
// to match this file's existing single-word/short-phrase snake_case error
// vocabulary ("not_found", "already_dispatched", "scan_evidence_incomplete",
// "invalid_commitment", "dispatch_stock_conflict") and to read as a distinct
// class from the generic "dispatch_stock_conflict" catch-all, per the parent
// task's explicit instruction that expiry SHALL return "a distinct error...
// rather than the generic dispatch-failure path."
// ---------------------------------------------------------------------------

describe("dispatchPickList — commitment expiry enforcement (24-hour TTL PO decision; revision-log.md 'Pick-list expiry enforcement: Option C'; design.md §7; tasks.md Task 4)", () => {
  // dispatchPickList's query shape is (1) pick_lists, (2) pick_list_items,
  // (3) inventory_commitments header (+ expiresAt) -- then, ONLY when
  // expired, one more per-item inventory_commitment_lines lookup (for the
  // release write) before returning; when NOT expired, execution instead
  // falls through into the per-line loop's own
  // lot_location_balances/inventory_commitment_lines lookups. Each test
  // below supplies exactly the select-result sequence its own path consumes.
  const pliRow = {
    id: "pick-list-item-uuid-1",
    itemId: "item-uuid-1",
    lotId: "lot-uuid-1",
    locationId: "loc-uuid-1",
    qty: 10,
    numberOfBoxes: 1,
  };

  it("(AC: expired commitment rejected in real time, no dispatch write) returns { ok: false, errors: ['commitment_expired'] } and inserts NO inventory_transactions 'pick' row when the commitment's expires_at is in the past", async () => {
    const allocated = pickListRow({ status: "picked" });
    const commitmentHeader = {
      id: "commitment-uuid-1",
      status: "active",
      expiresAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour in the past
    };
    const releaseCommitLine = {
      id: "commitment-line-uuid-1",
      balanceId: "balance-uuid-1",
      qtyCommitted: 10,
    };
    const db = makeWithdrawalDb(
      [allocated],
      [[allocated], [pliRow], [commitmentHeader], [releaseCommitLine]],
    );

    const result = await dispatchPickList(
      supervisorResolver(),
      "pick-list-uuid-existing",
      ["pick-list-item-uuid-1"],
      mockRlsDeps(db).deps,
    );

    expect(result).toEqual({ ok: false, errors: ["commitment_expired"] });

    // No dispatch-movement transaction may be written for a rejected dispatch.
    const dispatchTxnInserts = (db._inserted as AnyRecord[]).filter(
      (row) => "movementType" in row && row.movementType === "pick",
    );
    expect(dispatchTxnInserts).toHaveLength(0);
  });

  it("(AC: expiry side effects ARE written in the same rejection path) transitions the expired commitment to status 'expired' and releases its qty_committed, in the same transaction that rejects the dispatch", async () => {
    const allocated = pickListRow({ status: "picked" });
    const commitmentHeader = {
      id: "commitment-uuid-1",
      status: "active",
      expiresAt: new Date(Date.now() - 60 * 60 * 1000),
    };
    const releaseCommitLine = {
      id: "commitment-line-uuid-1",
      balanceId: "balance-uuid-1",
      qtyCommitted: 10,
    };
    const db = makeWithdrawalDb(
      [allocated],
      [[allocated], [pliRow], [commitmentHeader], [releaseCommitLine]],
    );

    await dispatchPickList(
      supervisorResolver(),
      "pick-list-uuid-existing",
      ["pick-list-item-uuid-1"],
      mockRlsDeps(db).deps,
    );

    // The commitment (header and/or line) must transition to 'expired' —
    // the same transition value the nightly CRON sweep also writes
    // (revision-log.md: "Both paths write the same `expired` transition").
    const expiredStatusUpdates = (db._updated as AnyRecord[]).filter(
      (row) => "status" in row && row.status === "expired",
    );
    expect(expiredStatusUpdates.length).toBeGreaterThan(0);

    // qty_committed must be released back on the relevant lot_location_balances
    // row(s) — the update payload carries a qtyCommitted decrement, reusing
    // the same release mechanism the normal dispatch path already writes.
    const qtyCommittedReleaseUpdates = (db._updated as AnyRecord[]).filter(
      (row) => "qtyCommitted" in row,
    );
    expect(qtyCommittedReleaseUpdates.length).toBeGreaterThan(0);
  });

  it("(AC: non-expired commitment still dispatches normally — regression guard) returns { ok: true } when the commitment's expires_at is still in the future", async () => {
    const allocated = pickListRow({ status: "picked" });
    const commitmentHeader = {
      id: "commitment-uuid-1",
      status: "active",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour in the future
    };
    const balanceRow = {
      id: "balance-uuid-1",
      qtyRemaining: 50,
      qtyCommitted: 10,
    };
    const commitLine = { id: "commitment-line-uuid-1" };
    const db = makeWithdrawalDb(
      [allocated],
      [
        [allocated],
        [pliRow],
        [commitmentHeader],
        [{ pickListItemId: "pick-list-item-uuid-1" }],
        [balanceRow],
        [commitLine],
      ],
    );

    const result = await dispatchPickList(
      supervisorResolver(),
      "pick-list-uuid-existing",
      ["pick-list-item-uuid-1"],
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
const dispatchPickListRow = pickListRow({ status: "picked" });

const lineA = {
  id: "pli-uuid-1",
  pickListId: dispatchPickListRow.id,
  itemId: "item-uuid-1",
  lotId: "lot-uuid-1",
  locationId: "loc-uuid-1",
  qty: 10,
  numberOfBoxes: 1,
};
const lineB = {
  id: "pli-uuid-2",
  pickListId: dispatchPickListRow.id,
  itemId: "item-uuid-2",
  lotId: "lot-uuid-2",
  locationId: "loc-uuid-2",
  qty: 4,
  numberOfBoxes: 1,
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
  queues.set(inventoryCommitments, [[commitmentHeader]]);
  // Exact-box-count check (fix-it-felix): one 'selected' inventory_units row
  // per line, matching each line's numberOfBoxes: 1.
  queues.set(inventoryUnits, [
    [
      { pickListItemId: "pli-uuid-1" },
      { pickListItemId: "pli-uuid-2" },
    ],
  ]);
  // Consumed once per line, in pick_list_items order (lineA then lineB).
  queues.set(lotLocationBalances, [[balanceA], [balanceB]]);
  queues.set(inventoryCommitmentLines, [[commitLineA], [commitLineB]]);

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
        ["pli-uuid-1", "pli-uuid-2"],
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
        ["pli-uuid-1", "pli-uuid-2"],
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
        ["pli-uuid-1", "pli-uuid-2"],
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
        ["pli-uuid-1", "pli-uuid-2"],
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
      "the transaction and returns a graceful recoverable error when the second line's " +
      "balance decrement throws, never reaching the pick_list status transition",
    async () => {
      const db = makeFullDispatchDb({
        throwOnCall: (table, n) => table === lotLocationBalances && n === 2,
      });
      const { deps, conn } = mockRlsDeps(db);

      // dispatchPickList never lets a Server Action reject uncaught -- a
      // generic thrown error (anything other than the specific
      // ConcurrentModificationError) is caught and converted to a graceful
      // { ok: false, errors: [...] } result, matching the catch-and-convert
      // pattern this codebase consistently uses elsewhere (commitWithdrawal
      // in this same file, items.ts, receiving.ts) rather than surfacing a
      // raw Next.js error page. The transaction itself still rolls back --
      // that happens inside withRlsTransaction's own guaranteed catch,
      // before this function's outer catch ever runs; see the commit/
      // rollback assertions below.
      const result = await dispatchPickList(
        supervisorResolver(),
        dispatchPickListRow.id,
        ["pli-uuid-1", "pli-uuid-2"],
        deps,
      );
      expect(result).toEqual({ ok: false, errors: ["dispatch_stock_conflict"] });

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
          ["pli-uuid-1", "pli-uuid-2"],
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

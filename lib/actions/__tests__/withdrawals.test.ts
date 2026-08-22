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

function makeSelectChain(rows: unknown[]) {
  const resolved = Promise.resolve(rows);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  for (const method of ["from", "where", "leftJoin", "orderBy", "limit", "offset", "innerJoin"]) {
    chain[method] = vi.fn(() => chain);
  }
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

  return {
    _inserted: inserted,
    _updated: updated,

    select: vi.fn().mockImplementation(() =>
      makeSelectChain(selectRows.shift() ?? pickListRows),
    ),

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
// dispatchPickList — Success
// (R7.5, design.md §7)
// ---------------------------------------------------------------------------

describe("dispatchPickList — success (R7.5, design.md §7)", () => {
  it("rejects dispatch when the committed lines have not all been scanned", async () => {
    const allocated = pickListRow({ status: "allocated" });
    const db = makeWithdrawalDb([allocated], [[allocated], [commitmentLineRow()]]);

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

  it("(AC: supervisor dispatches allocated pick list) returns { ok: true } when supervisor executes a pick list in allocated status", async () => {
    const allocated = pickListRow({ status: "allocated" });
    const db = makeWithdrawalDb([allocated], [[allocated], [commitmentLineRow()]]);

    const result = await dispatchPickList(
      supervisorResolver(),
      "pick-list-uuid-existing",
      ["pick-list-item-uuid-1"],
      mockRlsDeps(db).deps,
    );

    expect(result.ok).toBe(true);
  });

  it("(AC: warehouse_staff dispatches allocated pick list) returns { ok: true } for warehouse_staff with withdrawal.execute capability", async () => {
    const allocated = pickListRow({ status: "allocated" });
    const db = makeWithdrawalDb([allocated], [[allocated], [commitmentLineRow()]]);

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
  it("(AC: expired commitment rejected in real time, no dispatch write) returns { ok: false, errors: ['commitment_expired'] } and inserts NO inventory_transactions 'pick' row when the commitment's expires_at is in the past", async () => {
    const allocated = pickListRow({ status: "allocated" });
    const expiredLine = commitmentLineRow({
      expiresAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour in the past
    });
    const db = makeWithdrawalDb([allocated], [[allocated], [expiredLine]]);

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
    const allocated = pickListRow({ status: "allocated" });
    const expiredLine = commitmentLineRow({
      expiresAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    const db = makeWithdrawalDb([allocated], [[allocated], [expiredLine]]);

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
    const allocated = pickListRow({ status: "allocated" });
    const activeLine = commitmentLineRow({
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour in the future
    });
    const db = makeWithdrawalDb([allocated], [[allocated], [activeLine]]);

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

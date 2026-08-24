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
    execute: vi.fn().mockResolvedValue([]),

    select: vi.fn().mockImplementation(() =>
      makeSelectChain(selectRows.shift() ?? pickListRows),
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
// dispatchPickList — Success
// (R7.5, design.md §7)
// ---------------------------------------------------------------------------

describe("dispatchPickList — success (R7.5, design.md §7)", () => {
  it("rejects dispatch when the committed lines have not all been scanned", async () => {
    const picked = pickListRow({ status: "picked" });
    const db = makeWithdrawalDb([picked], [[picked], [commitmentLineRow()], [{ pickListItemId: "pick-list-item-uuid-1" }], [{ id: "pick-list-item-uuid-1", numberOfBoxes: 1 }]]);

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

  it("(AC: supervisor dispatches picked list) returns { ok: true } after exact picking", async () => {
    const picked = pickListRow({ status: "picked" });
    const db = makeWithdrawalDb([picked], [[picked], [commitmentLineRow()], [{ pickListItemId: "pick-list-item-uuid-1" }], [{ id: "pick-list-item-uuid-1", numberOfBoxes: 1 }]]);

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
    const db = makeWithdrawalDb([picked], [[picked], [commitmentLineRow()], [{ pickListItemId: "pick-list-item-uuid-1" }], [{ id: "pick-list-item-uuid-1", numberOfBoxes: 1 }]]);

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

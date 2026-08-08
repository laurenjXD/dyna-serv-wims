// RED-step unit tests for lib/db/queries/withdrawals.ts (does not exist yet).
//
// Traceability:
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/requirements.md
//     R5.3 — on success system SHALL reserve selected quantities and expose
//             the operational pick_list to the floor workflow
//     R9.1 — Outgoing Ledger SHALL be a filtered view of authoritative
//             inventory_transactions, primarily movement_type = 'pick';
//             transfer rows SHALL be included only where the approved
//             ownership/query contract requires it
//     R9.2 — ledger SHALL show authorized date/time, item code, description,
//             lot, location, quantity/UOM, pick list, destination/party,
//             flow type, dispatching user, and document references
//     R9.3 — ledger SHALL support date, party/destination, flow, item/code,
//             lot, and pick-list filters subject to authorization
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/design.md
//     §9 — Outgoing ledger design
//     §7 — Stage 2 dispatch: inventory_transactions.movement_type = 'pick'
//
// Acceptance criteria covered (requirements.md §5):
//   "Stage 2 confirmation decrements qty_remaining, releases qty_committed,
//    writes exactly one immutable pick transaction." (ledger reflects this)
//   "Cross-party, RLS, stale-state, invalid-scan, and ledger immutability
//    tests pass." (ledger is read-only)
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/db/queries/withdrawals.ts (for backend-builder):
//
//   export type PickListRow = {
//     id: string;
//     status: string;
//     customerPartyId: string;
//     flowType: string;
//     createdAt: Date;
//     createdBy: string;
//   };
//
//   export type OutgoingLedgerRow = {
//     transactionId: string;
//     createdAt: Date;
//     transactionNumber: string;
//     itemCode: string;
//     itemName: string;
//     lotNumber: string;
//     qty: string;
//     fromLocationLabel: string;
//     pickListNumber: string | null;
//     customerPartyName: string | null;
//     performedByUserId: string;
//   };
//
//   // Returns paginated pick lists; optional status filter.
//   export async function listPickLists(
//     db: DbLike,
//     opts: { limit: number; offset: number; status?: string },
//   ): Promise<{ rows: PickListRow[]; total: number }>;
//
//   // Returns the pick list by id, or null when not found.
//   export async function getPickList(
//     db: DbLike,
//     pickListId: string,
//   ): Promise<PickListRow | null>;
//
//   // Returns paginated outgoing ledger rows filtered to movement_type = 'pick'.
//   // v1: transfer rows are excluded (design.md §9, tasks.md task 1 resolution
//   // 2026-08-08: "transfer rows are excluded from the v1 Outgoing Ledger").
//   export async function listOutgoingLedger(
//     db: DbLike,
//     opts: { limit: number; offset: number },
//   ): Promise<{ rows: OutgoingLedgerRow[]; total: number }>;
//
// ---------------------------------------------------------------------------
// Mock pattern:
//
//   listPickLists and listOutgoingLedger issue two db.select() calls:
//     1. Data query  — fluent chain ending in .offset() which resolves to rows.
//     2. Count query — thenable chain resolving to [{ count: String(n) }].
//
//   getPickList issues one db.select() thenable chain.
//
// ---------------------------------------------------------------------------

import { describe, expect, it, vi } from "vitest";
import { listPickLists, getPickList, listOutgoingLedger } from "../withdrawals";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

// Data chain: fluent chain where the last meaningful call is .offset(),
// which resolves to the supplied rows array.
function makeDataChain(resolvedRows: unknown[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  for (const method of [
    "from",
    "leftJoin",
    "innerJoin",
    "where",
    "orderBy",
    "limit",
  ]) {
    chain[method] = vi.fn(() => chain);
  }
  chain["offset"] = vi.fn().mockResolvedValue(resolvedRows);
  return chain;
}

// Count chain: thenable chain resolving to [{ count: String(n) }].
function makeCountChain(count: number) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  for (const method of ["from", "where", "leftJoin", "innerJoin", "orderBy"]) {
    chain[method] = vi.fn(() => chain);
  }
  const resolved = Promise.resolve([{ count: String(count) }]);
  chain["then"] = resolved.then.bind(resolved) as AnyFn;
  chain["catch"] = resolved.catch.bind(resolved) as AnyFn;
  chain["finally"] = resolved.finally.bind(resolved) as AnyFn;
  return chain;
}

// Wires one data + one count query for list functions.
function makeListDb(dataRows: unknown[], total: number) {
  return {
    select: vi
      .fn()
      .mockReturnValueOnce(makeDataChain(dataRows))
      .mockReturnValueOnce(makeCountChain(total)),
  };
}

// Simple thenable chain for getPickList (single select).
function makeSelectChain(rows: unknown[]) {
  const resolved = Promise.resolve(rows);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  for (const method of ["from", "where", "leftJoin", "orderBy", "limit"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain["then"] = resolved.then.bind(resolved) as AnyFn;
  chain["catch"] = resolved.catch.bind(resolved) as AnyFn;
  chain["finally"] = resolved.finally.bind(resolved) as AnyFn;
  return chain;
}

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

const NOW = new Date("2026-08-08T10:00:00Z");

function rawPickListRow(overrides: Partial<{
  id: string;
  status: string;
  customerPartyId: string;
  flowType: string;
  createdAt: Date;
  createdBy: string;
}> = {}) {
  return {
    id: "pick-list-uuid-1",
    status: "allocated",
    customerPartyId: "party-uuid-customer",
    flowType: "trading",
    createdAt: NOW,
    createdBy: "user-uuid-supervisor",
    ...overrides,
  };
}

function rawOutgoingLedgerRow(overrides: Partial<{
  transactionId: string;
  createdAt: Date;
  transactionNumber: string;
  itemCode: string;
  itemName: string;
  lotNumber: string;
  qty: string;
  fromLocationLabel: string;
  pickListNumber: string | null;
  customerPartyName: string | null;
  performedByUserId: string;
}> = {}) {
  return {
    transactionId: "txn-uuid-1",
    createdAt: NOW,
    transactionNumber: "TXN-0001",
    itemCode: "ITEM-A001",
    itemName: "Widget Alpha",
    lotNumber: "LOT-20260801",
    qty: "10",
    fromLocationLabel: "Rack A-01",
    pickListNumber: "PL-0001",
    customerPartyName: "Acme Corp",
    performedByUserId: "user-uuid-staff",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// listPickLists — empty state
// (R5.3, design.md §6)
// ---------------------------------------------------------------------------

describe("listPickLists — empty database (R5.3, design.md §6)", () => {
  it("(AC: empty list returns rows: [], total: 0) returns { rows: [], total: 0 } when no pick lists exist", async () => {
    const db = makeListDb([], 0);

    const result = await listPickLists(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      { limit: 10, offset: 0 },
    );

    expect(result).toHaveProperty("rows");
    expect(result).toHaveProperty("total");
    expect(result.rows).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// listPickLists — status filter
// (R5.3, design.md §6)
// ---------------------------------------------------------------------------

describe("listPickLists — status filter (R5.3, design.md §6)", () => {
  it("(AC: status filter returns matching rows) returns only rows matching the supplied status filter", async () => {
    const allocatedRow = rawPickListRow({ id: "pl-allocated", status: "allocated" });
    const db = makeListDb([allocatedRow], 1);

    const result = await listPickLists(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      { limit: 10, offset: 0, status: "allocated" },
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].status).toBe("allocated");
    expect(result.total).toBe(1);
  });

  it("(AC: no status filter returns all pick lists) returns all statuses when no status filter is provided", async () => {
    const rows = [
      rawPickListRow({ id: "pl-1", status: "allocated" }),
      rawPickListRow({ id: "pl-2", status: "dispatched" }),
    ];
    const db = makeListDb(rows, 2);

    const result = await listPickLists(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      { limit: 10, offset: 0 },
    );

    expect(result.rows).toHaveLength(2);
    expect(result.total).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// listPickLists — pagination
// (R9.3, design.md §9)
// ---------------------------------------------------------------------------

describe("listPickLists — pagination (design.md §9)", () => {
  it("(AC: limit/offset applied) limit=1 offset=0 returns 1 row with total=5", async () => {
    const db = makeListDb([rawPickListRow({ id: "pl-page-1" })], 5);

    const result = await listPickLists(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      { limit: 1, offset: 0 },
    );

    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(5);
  });

  it("(AC: limit/offset passed to Drizzle chain) applies the provided limit and offset via the Drizzle chain", async () => {
    const dataChain = makeDataChain([]);
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(dataChain)
        .mockReturnValueOnce(makeCountChain(0)),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await listPickLists(db as any, { limit: 5, offset: 20 });

    const limitFn = dataChain["limit"] as ReturnType<typeof vi.fn>;
    const offsetFn = dataChain["offset"] as ReturnType<typeof vi.fn>;
    expect(limitFn).toHaveBeenCalledWith(5);
    expect(offsetFn).toHaveBeenCalledWith(20);
  });
});

// ---------------------------------------------------------------------------
// listPickLists — row shape
// (R5.3, design.md §6)
// ---------------------------------------------------------------------------

describe("listPickLists — row shape (R5.3, design.md §6)", () => {
  it("(AC: row fields present) each returned row includes id, status, customerPartyId, flowType, createdAt, createdBy", async () => {
    const db = makeListDb([rawPickListRow()], 1);

    const result = await listPickLists(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      { limit: 10, offset: 0 },
    );

    const r = result.rows[0];
    expect(r).toHaveProperty("id");
    expect(r).toHaveProperty("status");
    expect(r).toHaveProperty("customerPartyId");
    expect(r).toHaveProperty("flowType");
    expect(r).toHaveProperty("createdAt");
    expect(r).toHaveProperty("createdBy");
  });
});

// ---------------------------------------------------------------------------
// getPickList — not found
// (R5.3, design.md §6)
// ---------------------------------------------------------------------------

describe("getPickList — not found (R5.3, design.md §6)", () => {
  it("(AC: unknown id returns null) returns null when the pickListId does not match any pick list", async () => {
    const db = {
      select: vi.fn().mockReturnValue(makeSelectChain([])),
    };

    const result = await getPickList(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      "non-existent-pick-list-uuid",
    );

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getPickList — known id
// (R5.3, design.md §6)
// ---------------------------------------------------------------------------

describe("getPickList — known id returns pick list row (R5.3, design.md §6)", () => {
  it("(AC: known id returns row) returns the pick list row when pickListId matches", async () => {
    const row = rawPickListRow({ id: "pl-known-id" });
    const db = {
      select: vi.fn().mockReturnValue(makeSelectChain([row])),
    };

    const result = await getPickList(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      "pl-known-id",
    );

    expect(result).not.toBeNull();
    expect(result!.id).toBe("pl-known-id");
    expect(result!.status).toBe("allocated");
  });
});

// ---------------------------------------------------------------------------
// listOutgoingLedger — empty state
// (R9.1, design.md §9)
// ---------------------------------------------------------------------------

describe("listOutgoingLedger — empty database (R9.1, design.md §9)", () => {
  it("(AC: empty ledger returns rows: [], total: 0) returns { rows: [], total: 0 } when no pick transactions exist", async () => {
    const db = makeListDb([], 0);

    const result = await listOutgoingLedger(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      { limit: 10, offset: 0 },
    );

    expect(result).toHaveProperty("rows");
    expect(result).toHaveProperty("total");
    expect(result.rows).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// listOutgoingLedger — filters only pick movements
// (R9.1, design.md §9 — transfer rows excluded in v1)
// ---------------------------------------------------------------------------

describe("listOutgoingLedger — filters to movement_type = pick only (R9.1, design.md §9)", () => {
  it("(AC: only pick rows returned) returns pick transaction rows and total reflecting pick-only filter", async () => {
    const pickRow = rawOutgoingLedgerRow({
      transactionId: "txn-pick-1",
      pickListNumber: "PL-0001",
    });
    const db = makeListDb([pickRow], 1);

    const result = await listOutgoingLedger(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      { limit: 10, offset: 0 },
    );

    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(1);
    // The query must apply a where clause for movement_type = 'pick'
    // We verify the data chain's where() is called
  });

  it("(AC: where() called for movement_type filter) calls where() on the data chain to apply movement_type = pick filter", async () => {
    const dataChain = makeDataChain([]);
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(dataChain)
        .mockReturnValueOnce(makeCountChain(0)),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await listOutgoingLedger(db as any, { limit: 10, offset: 0 });

    // The implementation must call .where() to apply movement_type = 'pick' filter
    const whereFn = dataChain["where"] as ReturnType<typeof vi.fn>;
    expect(whereFn).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// listOutgoingLedger — row shape
// (R9.2, design.md §9 column list)
// ---------------------------------------------------------------------------

describe("listOutgoingLedger — row shape (R9.2, design.md §9)", () => {
  it("(AC: ledger row has required fields) each returned row includes transactionId, createdAt, transactionNumber, itemCode, itemName, lotNumber, qty, fromLocationLabel, pickListNumber, customerPartyName, performedByUserId", async () => {
    const ledgerRow = rawOutgoingLedgerRow();
    const db = makeListDb([ledgerRow], 1);

    const result = await listOutgoingLedger(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      { limit: 10, offset: 0 },
    );

    expect(result.rows).toHaveLength(1);
    const r = result.rows[0];
    expect(r).toHaveProperty("transactionId");
    expect(r).toHaveProperty("createdAt");
    expect(r).toHaveProperty("transactionNumber");
    expect(r).toHaveProperty("itemCode");
    expect(r).toHaveProperty("itemName");
    expect(r).toHaveProperty("lotNumber");
    expect(r).toHaveProperty("qty");
    expect(r).toHaveProperty("fromLocationLabel");
    expect(r).toHaveProperty("pickListNumber");
    expect(r).toHaveProperty("customerPartyName");
    expect(r).toHaveProperty("performedByUserId");
  });
});

// ---------------------------------------------------------------------------
// listOutgoingLedger — pagination
// (R9.3, design.md §9)
// ---------------------------------------------------------------------------

describe("listOutgoingLedger — pagination (R9.3, design.md §9)", () => {
  it("(AC: limit/offset passed to Drizzle chain) applies the provided limit and offset via the Drizzle chain", async () => {
    const dataChain = makeDataChain([]);
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(dataChain)
        .mockReturnValueOnce(makeCountChain(0)),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await listOutgoingLedger(db as any, { limit: 25, offset: 50 });

    const limitFn = dataChain["limit"] as ReturnType<typeof vi.fn>;
    const offsetFn = dataChain["offset"] as ReturnType<typeof vi.fn>;
    expect(limitFn).toHaveBeenCalledWith(25);
    expect(offsetFn).toHaveBeenCalledWith(50);
  });

  it("(AC: total is unpaginated count) total is the unpaginated count, independent of page size", async () => {
    const rows = [
      rawOutgoingLedgerRow({ transactionId: "txn-1" }),
      rawOutgoingLedgerRow({ transactionId: "txn-2" }),
    ];
    const db = makeListDb(rows, 42);

    const result = await listOutgoingLedger(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      { limit: 2, offset: 10 },
    );

    expect(result.rows).toHaveLength(2);
    expect(result.total).toBe(42);
  });
});

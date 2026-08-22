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
import { getTableName } from "drizzle-orm";
import { listPickLists, getPickList, listOutgoingLedger } from "../withdrawals";
import { items } from "@/lib/db/schema/items";
import { lots } from "@/lib/db/schema/lots";
import { locations } from "@/lib/db/schema/locations";
import { pickLists } from "@/lib/db/schema/pick_lists";
import { parties } from "@/lib/db/schema/parties";

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

// ---------------------------------------------------------------------------
// listOutgoingLedger — Bug 2: SELECT never joins items/lots/locations/
// pick_lists/parties (lib/db/queries/withdrawals.ts listOutgoingLedger,
// ~lines 313-342)
//
// OutgoingLedgerRow (lines 63-75) declares itemCode/itemName/lotNumber/
// fromLocationLabel/pickListNumber/customerPartyName as present fields, and
// design.md §9's column list requires them sourced from items.code/
// items.name/lots.lot_number/locations.label/pick_lists.pick_list_number/
// parties.name respectively — but the actual SELECT (lines 321-334) projects
// only inventory_transactions columns, with no joins at all (the file's own
// comment at lines 290-293 admits this is a placeholder).
//
// The "row shape" test above ("(AC: ledger row has required fields)") does
// NOT catch this: makeListDb's rawOutgoingLedgerRow() fixture fabricates the
// full row shape directly as the mocked db.select() return value, regardless
// of what the real query's .select({...}) call actually projects — so it
// passes today even though the real implementation never joins anything.
// The tests below instead inspect the actual arguments passed to
// db.select()/.innerJoin()/.leftJoin() (first test), and — for the "row
// values are real, not placeholders" claim — use a projection-aware fake
// select() that only returns a field's value when the projection argument
// genuinely names a column belonging to the expected joined table (third
// test), so they can only pass once real joins/projections are added, not
// merely because a fixture happens to already look right.
//
// Traceability:
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/design.md
//     §9 — Outgoing ledger design, column list (Item code → items.code,
//          Item name → items.name, Lot number → lots.lot_number, From
//          location → locations.label, Pick list # → pick_lists.pick_list_number,
//          Customer party → parties.name)
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/requirements.md
//     R9.2 (carried from this file's own pre-2026-08-14 header, since the
//     terminology-aligned requirements.md rewrite no longer numbers R9.x
//     literally — see current requirements.md §3 "Outgoing Ledger: ...
//     paginated audit view of all outbound inventory transactions" and §5
//     acceptance criteria, which is the present-day traceable source for
//     the same ledger-display obligation).
// ---------------------------------------------------------------------------

describe("listOutgoingLedger — real joins for display fields (Bug 2, design.md §9 column list)", () => {
  it("(AC: select projects items.code/items.name/lots.lotNumber/locations.label/pickLists.pickListNumber/parties.name, not just inventory_transactions columns) the data query's select() projection references the joined display columns design.md §9's column list requires", async () => {
    const db = makeListDb([], 0);

    await listOutgoingLedger(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      { limit: 10, offset: 0 },
    );

    // First db.select() call is the data query (see makeListDb / this
    // file's header "Mock pattern" note); its argument is the Drizzle
    // column-projection object.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dataSelectArg = (db.select as any).mock.calls[0][0] as Record<string, unknown>;
    const projectedColumns = Object.values(dataSelectArg ?? {});

    // Today's SELECT (lib/db/queries/withdrawals.ts listOutgoingLedger,
    // ~lines 321-334) projects only inventory_transactions.id/created_at/
    // transaction_number/qty/performed_by_user_id/pick_list_id — none of
    // these six joined-table columns are present, so this fails for the
    // right reason: the joins were never added, not a typo in this test.
    expect(projectedColumns).toContain(items.code);
    expect(projectedColumns).toContain(items.name);
    expect(projectedColumns).toContain(lots.lotNumber);
    expect(projectedColumns).toContain(locations.label);
    expect(projectedColumns).toContain(pickLists.pickListNumber);
    expect(projectedColumns).toContain(parties.name);
  });

  it("(AC: real innerJoin/leftJoin calls against items/lots/locations/pick_lists/parties) calls innerJoin/leftJoin against the items, lots, locations, pick_lists, and parties tables — not just .from(inventory_transactions) with no joins", async () => {
    const dataChain = makeDataChain([]);
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(dataChain)
        .mockReturnValueOnce(makeCountChain(0)),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await listOutgoingLedger(db as any, { limit: 10, offset: 0 });

    const innerJoinFn = dataChain["innerJoin"] as ReturnType<typeof vi.fn>;
    const leftJoinFn = dataChain["leftJoin"] as ReturnType<typeof vi.fn>;
    const joinedTables = [...innerJoinFn.mock.calls, ...leftJoinFn.mock.calls].map(
      (call) => call[0],
    );

    // Today, neither innerJoin nor leftJoin is ever called — confirmed by
    // this test failing with an empty joinedTables array.
    expect(joinedTables).toContain(items);
    expect(joinedTables).toContain(lots);
    expect(joinedTables).toContain(locations);
    expect(joinedTables).toContain(pickLists);
    expect(joinedTables).toContain(parties);
  });

  it("(AC: returned row surfaces real joined values, not undefined placeholders) returns itemCode/itemName/lotNumber/fromLocationLabel/pickListNumber/customerPartyName sourced from the joined tables, given a select() that behaves like a real Postgres round-trip with respect to column projection", async () => {
    // Raw "database" fixture keyed by `${table}.${column}` (underlying
    // Postgres names) so items.name and parties.name — both literally
    // named "name" — don't collide.
    const rawDb: Record<string, unknown> = {
      "inventory_transactions.id": "txn-uuid-1",
      "inventory_transactions.created_at": NOW,
      "inventory_transactions.transaction_number": "TXN-0001",
      "inventory_transactions.qty": 10,
      "inventory_transactions.performed_by_user_id": "user-uuid-staff",
      "inventory_transactions.pick_list_id": "pick-list-uuid-1",
      "items.code": "ITEM-A001",
      "items.name": "Widget Alpha",
      "lots.lot_number": "LOT-20260801",
      "locations.label": "Rack A-01",
      "pick_lists.pick_list_number": "PL-0001",
      "parties.name": "Acme Corp",
    };

    const db = {
      select: vi.fn().mockImplementation((projection?: Record<string, unknown>) => {
        const proj = projection ?? {};
        const isCountQuery =
          "count" in proj && Object.keys(proj).length === 1;

        const chain: Record<string, unknown> = {};
        for (const method of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit"]) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (chain as any)[method] = vi.fn(() => chain);
        }

        if (isCountQuery) {
          const resolved = Promise.resolve([{ count: "1" }]);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (chain as any)["then"] = resolved.then.bind(resolved);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (chain as any)["catch"] = resolved.catch.bind(resolved);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (chain as any)["finally"] = resolved.finally.bind(resolved);
          return chain;
        }

        const row: Record<string, unknown> = {};
        for (const [key, column] of Object.entries(proj)) {
          if (column && typeof column === "object" && "name" in column && "table" in column) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const tableName = getTableName((column as any).table);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            row[key] = rawDb[`${tableName}.${(column as any).name}`];
          }
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (chain as any)["offset"] = vi.fn().mockResolvedValue([row]);
        return chain;
      }),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await listOutgoingLedger(db as any, { limit: 10, offset: 0 });

    expect(result.rows).toHaveLength(1);
    const r = result.rows[0];
    // Today: the select() projection has no keys mapping to items.*/lots.*/
    // locations.*/pick_lists.*/parties.* columns at all, so every one of
    // these fields is undefined — not the real joined value design.md §9
    // requires.
    expect(r.itemCode).toBe("ITEM-A001");
    expect(r.itemName).toBe("Widget Alpha");
    expect(r.lotNumber).toBe("LOT-20260801");
    expect(r.fromLocationLabel).toBe("Rack A-01");
    expect(r.pickListNumber).toBe("PL-0001");
    expect(r.customerPartyName).toBe("Acme Corp");
  });
});

// RED-step unit tests for lib/db/queries/ledgers.ts (does not exist yet).
//
// Traceability:
//   specs/06-party-and-item-enrollment/requirements.md R2.6 (Transaction Ledger),
//     R3.10 (Movement Ledger)
//   specs/06-party-and-item-enrollment/design.md §5b (Transaction Ledger),
//     §6a Movement Ledger subsection
//   specs/06-party-and-item-enrollment/tasks.md Testing Matrix §Unit tests:
//     "Movement Ledger/Transaction Ledger query helpers: correct filtering by
//     location_id/party_id, correct direction/source labeling, correct
//     Reference-field resolution (commercial_invoice_no vs ar_reference_no),
//     pagination boundary handling."
//   specs/01-core-data-model/design.md §3 item 4 (location_transaction_ledger
//     and party_transaction_ledger derived read models)
//
// Acceptance criteria covered (requirements.md §5):
//   "A user holding locations.read viewing a location's detail page sees a
//   read-only, paginated Movement Ledger sourced from location_transaction_ledger,
//   gated by the same locations.read capability as the page itself."
//   "A user holding parties.read viewing a party's detail page sees a read-only,
//   paginated Transaction Ledger sourced from party_transaction_ledger, gated by
//   the same parties.read capability as the page itself."
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/db/queries/ledgers.ts (for backend-builder):
//
//   // The direction of an inventory_transactions row relative to a queried location.
//   export type LedgerDirection = "in" | "out";
//
//   // A single row returned by getLocationTransactionLedger.
//   // `direction` is derived from to_location_id / from_location_id relative to
//   // the queried locationId:
//   //   to_location_id === locationId  → direction "in"   (goods arriving)
//   //   from_location_id === locationId → direction "out"  (goods leaving)
//   // `reference` resolves to the applicable document identifier per direction:
//   //   "in"  → commercial_invoice_no (from the linked WRR document)
//   //   "out" → ar_reference_no (from the linked pick list)
//   export type LocationLedgerRow = {
//     id: string;
//     direction: LedgerDirection;
//     reference: string | null;
//     movementType: string;
//     quantity: string;
//     itemId: string | null;
//     lotId: string | null;
//     performedByUserId: string | null;
//     createdAt: Date;
//   };
//
//   // A single row returned by getPartyTransactionLedger.
//   // Covers three party-connection roles:
//   //   vendor — wrr_documents.vendor_party_id = partyId
//   //   customer — pick_lists.customer_party_id = partyId
//     //             (via inventory_transactions.pick_list_id)
//   //   vmi_owner — lots.owner_party_id = partyId
//   // `reference`: same commercial_invoice_no / ar_reference_no pattern as above.
//   export type PartyLedgerRow = {
//     id: string;
//     partyRole: "vendor" | "customer" | "vmi_owner";
//     reference: string | null;
//     movementType: string;
//     quantity: string;
//     itemId: string | null;
//     lotId: string | null;
//     performedByUserId: string | null;
//     createdAt: Date;
//   };
//
//   export type PaginatedLedger<T> = {
//     rows: T[];
//     total: number;
//   };
//
//   // Fetches paginated inventory_transactions rows connected to locationId
//   // (either from_location_id or to_location_id matches), ordered by created_at DESC.
//   // Returns { rows, total } where total is the unpaginated match count.
//   export async function getLocationTransactionLedger(
//     db: DbLike,
//     locationId: string,
//     options: { limit: number; offset: number },
//   ): Promise<PaginatedLedger<LocationLedgerRow>>;
//
//   // Fetches paginated inventory_transactions rows connected to partyId as
//   // vendor, customer, or VMI owner (union of all three roles), ordered by
//   // created_at DESC. Returns { rows, total } where total is the unpaginated count.
//   export async function getPartyTransactionLedger(
//     db: DbLike,
//     partyId: string,
//     options: { limit: number; offset: number },
//   ): Promise<PaginatedLedger<PartyLedgerRow>>;
//
// ---------------------------------------------------------------------------
// Drizzle chain mock pattern used in this file:
//
// The production query will look like:
//   const rows = await db.select({...}).from(inventoryTransactions)
//     .leftJoin(...).where(...).orderBy(...).limit(n).offset(m);
//   const [{ count }] = await db.select({ count: sql`count(*)` })
//     .from(inventoryTransactions).where(...);
//
// makeDataChain(rows) — fluent chain where .offset() resolves to `rows`.
// makeCountChain(n)   — thenable chain that resolves to [{ count: String(n) }]
//                       when the chain itself is awaited (no .offset() call).
//
// Each test creates a db mock where db.select is called once for data and
// once for count, using mockReturnValueOnce to supply the right chain for each.
// ---------------------------------------------------------------------------

import { describe, expect, it, vi } from "vitest";
import {
  getLocationTransactionLedger,
  getPartyTransactionLedger,
} from "../ledgers";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

// Fluent chain where the LAST call is .offset(), which returns a Promise.
// Covers: db.select().from().leftJoin().where().orderBy().limit(n).offset(m)
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

// Thenable chain for count queries that are awaited directly (no .offset() call).
// Covers: await db.select({ count: sql`count(*)` }).from(t).where(cond)
function makeCountChain(count: number) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  for (const method of ["from", "where", "leftJoin", "innerJoin"]) {
    chain[method] = vi.fn(() => chain);
  }
  // Make the chain itself awaitable by attaching Promise methods
  const resolved = Promise.resolve([{ count: String(count) }]);
  chain["then"] = resolved.then.bind(resolved) as AnyFn;
  chain["catch"] = resolved.catch.bind(resolved) as AnyFn;
  chain["finally"] = resolved.finally.bind(resolved) as AnyFn;
  return chain;
}

// Creates a db mock wired for one data query + one count query.
function makeDb(dataRows: unknown[], total: number) {
  return {
    select: vi
      .fn()
      .mockReturnValueOnce(makeDataChain(dataRows))
      .mockReturnValueOnce(makeCountChain(total)),
  };
}

// ---------------------------------------------------------------------------
// Raw row shapes (what the DB returns; direction/reference are derived by the
// query function from these fields).
// ---------------------------------------------------------------------------
function rawLocationRow(overrides: {
  id?: string;
  from_location_id?: string | null;
  to_location_id?: string | null;
  commercial_invoice_no?: string | null;
  ar_reference_no?: string | null;
  movement_type?: string;
  quantity?: string;
  item_id?: string | null;
  lot_id?: string | null;
  performed_by_user_id?: string | null;
  created_at?: Date;
}) {
  return {
    id: "txn-1",
    from_location_id: null,
    to_location_id: null,
    commercial_invoice_no: null,
    ar_reference_no: null,
    movement_type: "wrr_receive",
    quantity: "10",
    item_id: "item-1",
    lot_id: "lot-1",
    performed_by_user_id: "user-1",
    created_at: new Date("2024-06-01T10:00:00Z"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getLocationTransactionLedger
// ---------------------------------------------------------------------------

describe("getLocationTransactionLedger — return shape (R3.10, design.md §6a Movement Ledger)", () => {
  it("returns an object with rows array and numeric total", async () => {
    const db = makeDb([rawLocationRow({ to_location_id: "loc-1" })], 1);

    const result = await getLocationTransactionLedger(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      "loc-1",
      { limit: 10, offset: 0 },
    );

    expect(result).toHaveProperty("rows");
    expect(result).toHaveProperty("total");
    expect(Array.isArray(result.rows)).toBe(true);
    expect(typeof result.total).toBe("number");
  });

  it("total reflects the unpaginated count, not the rows array length (pagination boundary)", async () => {
    // 2 rows returned in this page, but 25 total exist
    const db = makeDb(
      [
        rawLocationRow({ id: "txn-1", to_location_id: "loc-1" }),
        rawLocationRow({ id: "txn-2", to_location_id: "loc-1" }),
      ],
      25,
    );

    const result = await getLocationTransactionLedger(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      "loc-1",
      { limit: 2, offset: 20 },
    );

    expect(result.rows.length).toBe(2);
    expect(result.total).toBe(25);
  });
});

describe("getLocationTransactionLedger — direction labeling (R3.10, design.md §6a: to_location_id → 'in', from_location_id → 'out')", () => {
  it("labels a row 'in' when to_location_id matches the queried locationId", async () => {
    const locationId = "loc-1";
    const db = makeDb(
      [
        rawLocationRow({
          id: "txn-in",
          from_location_id: "loc-other",
          to_location_id: locationId,
          commercial_invoice_no: "CI-001",
          ar_reference_no: null,
        }),
      ],
      1,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getLocationTransactionLedger(db as any, locationId, {
      limit: 10,
      offset: 0,
    });

    expect(result.rows[0].direction).toBe("in");
  });

  it("labels a row 'out' when from_location_id matches the queried locationId", async () => {
    const locationId = "loc-1";
    const db = makeDb(
      [
        rawLocationRow({
          id: "txn-out",
          from_location_id: locationId,
          to_location_id: "loc-other",
          commercial_invoice_no: null,
          ar_reference_no: "AR-001",
        }),
      ],
      1,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getLocationTransactionLedger(db as any, locationId, {
      limit: 10,
      offset: 0,
    });

    expect(result.rows[0].direction).toBe("out");
  });

  it("handles a mixed page with both 'in' and 'out' rows, each labeled correctly", async () => {
    const locationId = "loc-1";
    const db = makeDb(
      [
        rawLocationRow({
          id: "txn-in",
          from_location_id: "loc-other",
          to_location_id: locationId,
        }),
        rawLocationRow({
          id: "txn-out",
          from_location_id: locationId,
          to_location_id: "loc-other",
        }),
      ],
      2,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getLocationTransactionLedger(db as any, locationId, {
      limit: 10,
      offset: 0,
    });

    const inRow = result.rows.find((r) => r.id === "txn-in");
    const outRow = result.rows.find((r) => r.id === "txn-out");
    expect(inRow?.direction).toBe("in");
    expect(outRow?.direction).toBe("out");
  });
});

describe("getLocationTransactionLedger — reference field resolution (design.md §6a: commercial_invoice_no for 'in', ar_reference_no for 'out')", () => {
  it("sets reference to commercial_invoice_no for an incoming row ('in' direction)", async () => {
    const locationId = "loc-1";
    const db = makeDb(
      [
        rawLocationRow({
          to_location_id: locationId,
          from_location_id: "loc-other",
          commercial_invoice_no: "CI-2024-001",
          ar_reference_no: null,
        }),
      ],
      1,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getLocationTransactionLedger(db as any, locationId, {
      limit: 10,
      offset: 0,
    });

    expect(result.rows[0].reference).toBe("CI-2024-001");
  });

  it("sets reference to ar_reference_no for an outgoing row ('out' direction)", async () => {
    const locationId = "loc-1";
    const db = makeDb(
      [
        rawLocationRow({
          from_location_id: locationId,
          to_location_id: "loc-other",
          commercial_invoice_no: null,
          ar_reference_no: "AR-2024-007",
        }),
      ],
      1,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getLocationTransactionLedger(db as any, locationId, {
      limit: 10,
      offset: 0,
    });

    expect(result.rows[0].reference).toBe("AR-2024-007");
  });

  it("sets reference to null when the applicable document reference is absent", async () => {
    const locationId = "loc-1";
    const db = makeDb(
      [
        rawLocationRow({
          to_location_id: locationId,
          from_location_id: "loc-other",
          commercial_invoice_no: null, // no WRR reference on this incoming row
          ar_reference_no: null,
        }),
      ],
      1,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getLocationTransactionLedger(db as any, locationId, {
      limit: 10,
      offset: 0,
    });

    expect(result.rows[0].reference).toBeNull();
  });
});

describe("getLocationTransactionLedger — pagination (R3.10, design.md §6a)", () => {
  it("applies the provided limit and offset via the Drizzle chain", async () => {
    const locationId = "loc-1";
    const dataChain = makeDataChain([]);
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(dataChain)
        .mockReturnValueOnce(makeCountChain(0)),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await getLocationTransactionLedger(db as any, locationId, {
      limit: 20,
      offset: 40,
    });

    // The data chain's limit() and offset() must have been called with the
    // values supplied by the caller.
    const limitFn = dataChain["limit"] as ReturnType<typeof vi.fn>;
    const offsetFn = dataChain["offset"] as ReturnType<typeof vi.fn>;
    expect(limitFn).toHaveBeenCalledWith(20);
    expect(offsetFn).toHaveBeenCalledWith(40);
  });

  it("returns an empty rows array and total=0 when the location has no transactions", async () => {
    const db = makeDb([], 0);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getLocationTransactionLedger(db as any, "loc-empty", {
      limit: 10,
      offset: 0,
    });

    expect(result.rows).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});

describe("getLocationTransactionLedger — cross-location isolation (R3.10, design.md §6a)", () => {
  it("calls the Drizzle where() clause — confirming a location-scoped filter is applied (not a full-table scan)", async () => {
    const locationId = "loc-1";
    const dataChain = makeDataChain([]);
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(dataChain)
        .mockReturnValueOnce(makeCountChain(0)),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await getLocationTransactionLedger(db as any, locationId, {
      limit: 10,
      offset: 0,
    });

    // where() must be called at least once — the specific SQL predicate is
    // verified at the integration layer (real Postgres), but the unit layer
    // confirms the filter step is not omitted.
    const whereFn = dataChain["where"] as ReturnType<typeof vi.fn>;
    expect(whereFn).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getPartyTransactionLedger
// ---------------------------------------------------------------------------

function rawPartyLedgerRow(overrides: {
  id?: string;
  partyRole?: "vendor" | "customer" | "vmi_owner";
  commercial_invoice_no?: string | null;
  ar_reference_no?: string | null;
  movement_type?: string;
  quantity?: string;
  item_id?: string | null;
  lot_id?: string | null;
  performed_by_user_id?: string | null;
  created_at?: Date;
}) {
  return {
    id: "txn-1",
    partyRole: "vendor" as const,
    commercial_invoice_no: null,
    ar_reference_no: null,
    movement_type: "wrr_receive",
    quantity: "10",
    item_id: "item-1",
    lot_id: "lot-1",
    performed_by_user_id: "user-1",
    created_at: new Date("2024-06-01T10:00:00Z"),
    ...overrides,
  };
}

describe("getPartyTransactionLedger — return shape (R2.6, design.md §5b Transaction Ledger)", () => {
  it("returns an object with rows array and numeric total", async () => {
    const db = makeDb([rawPartyLedgerRow({ partyRole: "vendor" })], 1);

    const result = await getPartyTransactionLedger(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      "party-1",
      { limit: 10, offset: 0 },
    );

    expect(result).toHaveProperty("rows");
    expect(result).toHaveProperty("total");
    expect(Array.isArray(result.rows)).toBe(true);
    expect(typeof result.total).toBe("number");
  });

  it("total is the unpaginated count, independent of the rows-array length", async () => {
    const db = makeDb(
      [rawPartyLedgerRow({ id: "txn-a" }), rawPartyLedgerRow({ id: "txn-b" })],
      42,
    );

    const result = await getPartyTransactionLedger(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      "party-1",
      { limit: 2, offset: 10 },
    );

    expect(result.rows.length).toBe(2);
    expect(result.total).toBe(42);
  });
});

describe("getPartyTransactionLedger — partyRole labeling (R2.6, design.md §5b: vendor/customer/vmi_owner union)", () => {
  it("each row carries a partyRole field identifying how the party relates to that transaction", async () => {
    const db = makeDb(
      [
        rawPartyLedgerRow({ id: "v-txn", partyRole: "vendor" }),
        rawPartyLedgerRow({ id: "c-txn", partyRole: "customer" }),
        rawPartyLedgerRow({ id: "o-txn", partyRole: "vmi_owner" }),
      ],
      3,
    );

    const result = await getPartyTransactionLedger(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      "party-1",
      { limit: 10, offset: 0 },
    );

    const roles = result.rows.map((r) => r.partyRole);
    expect(roles).toContain("vendor");
    expect(roles).toContain("customer");
    expect(roles).toContain("vmi_owner");
  });
});

describe("getPartyTransactionLedger — reference field (design.md §5b: commercial_invoice_no / ar_reference_no)", () => {
  it("includes a reference field on each row (null when not linked to a document)", async () => {
    const db = makeDb(
      [rawPartyLedgerRow({ commercial_invoice_no: null, ar_reference_no: null })],
      1,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getPartyTransactionLedger(db as any, "party-1", {
      limit: 10,
      offset: 0,
    });

    expect(Object.prototype.hasOwnProperty.call(result.rows[0], "reference")).toBe(
      true,
    );
    expect(result.rows[0].reference).toBeNull();
  });

  it("sets reference to commercial_invoice_no when the row is a vendor (WRR-linked) row", async () => {
    const db = makeDb(
      [
        rawPartyLedgerRow({
          partyRole: "vendor",
          commercial_invoice_no: "CI-PARTY-001",
          ar_reference_no: null,
        }),
      ],
      1,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getPartyTransactionLedger(db as any, "party-1", {
      limit: 10,
      offset: 0,
    });

    expect(result.rows[0].reference).toBe("CI-PARTY-001");
  });

  it("sets reference to ar_reference_no when the row is a customer (pick-list-linked) row", async () => {
    const db = makeDb(
      [
        rawPartyLedgerRow({
          partyRole: "customer",
          commercial_invoice_no: null,
          ar_reference_no: "AR-PARTY-007",
        }),
      ],
      1,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getPartyTransactionLedger(db as any, "party-1", {
      limit: 10,
      offset: 0,
    });

    expect(result.rows[0].reference).toBe("AR-PARTY-007");
  });
});

describe("getPartyTransactionLedger — pagination (R2.6, design.md §5b)", () => {
  it("applies the provided limit and offset via the Drizzle chain", async () => {
    const dataChain = makeDataChain([]);
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(dataChain)
        .mockReturnValueOnce(makeCountChain(0)),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await getPartyTransactionLedger(db as any, "party-1", {
      limit: 15,
      offset: 30,
    });

    const limitFn = dataChain["limit"] as ReturnType<typeof vi.fn>;
    const offsetFn = dataChain["offset"] as ReturnType<typeof vi.fn>;
    expect(limitFn).toHaveBeenCalledWith(15);
    expect(offsetFn).toHaveBeenCalledWith(30);
  });

  it("returns empty rows and total=0 when the party has no transactions", async () => {
    const db = makeDb([], 0);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getPartyTransactionLedger(db as any, "party-no-txns", {
      limit: 10,
      offset: 0,
    });

    expect(result.rows).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});

describe("getPartyTransactionLedger — cross-party isolation (R2.6, design.md §5b)", () => {
  it("calls the Drizzle where() clause — confirming a party-scoped filter is applied (not a full-table scan)", async () => {
    const dataChain = makeDataChain([]);
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(dataChain)
        .mockReturnValueOnce(makeCountChain(0)),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await getPartyTransactionLedger(db as any, "party-1", {
      limit: 10,
      offset: 0,
    });

    // The specific SQL predicate (vendor/customer/vmi_owner union) is verified
    // at the integration layer; unit layer confirms the filter is not omitted.
    const whereFn = dataChain["where"] as ReturnType<typeof vi.fn>;
    expect(whereFn).toHaveBeenCalled();
  });
});

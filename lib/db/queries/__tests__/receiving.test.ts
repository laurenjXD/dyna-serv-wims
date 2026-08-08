// RED-step unit tests for lib/db/queries/receiving.ts (does not exist yet).
//
// Traceability:
//   specs/07-incoming-receiving/requirements.md
//     R2.5 — floor flow shows WRR, expected lines, scanned quantities, remaining quantities, exceptions
//     R3.1 — scan matched against WRR's expected item/line
//     R3.5 — receipt not confirmable while required lines remain outstanding
//   specs/07-incoming-receiving/design.md
//     §4 — state model and command boundaries
//     §5.1 — expected line fields
//     §5.2 — scan-line state and discrepancy
//
// Acceptance criteria covered:
//   "An authorized user sees the list of WRR documents filterable by status
//    with pagination (design.md §4, requirements.md R2.5)."
//   "A known WRR ID returns its document with all wrr_items nested; an unknown
//    ID returns null (design.md §5.1)."
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/db/queries/receiving.ts (for backend-builder):
//
//   export type WrrDocumentRow = {
//     id: string;
//     wrrNumber: string;
//     status: string;
//     flowType: string;
//     vendorPartyId: string;
//     stagedByUserId: string;
//     createdAt: Date;
//   };
//
//   export type WrrItemRow = {
//     id: string;
//     wrrId: string;
//     lotNumber: string;
//     expectedQty: number;
//     scannedQty: number;
//     disposition: string;
//     itemId: string | null;
//   };
//
//   export type WrrDocumentWithItems = WrrDocumentRow & {
//     items: WrrItemRow[];
//   };
//
//   // Returns paginated WRR documents; optional status filter.
//   export async function listWrrDocuments(
//     db: DbLike,
//     opts: { limit: number; offset: number; status?: string },
//   ): Promise<{ rows: WrrDocumentRow[]; total: number }>;
//
//   // Returns the WRR with nested items or null when not found.
//   export async function getWrrDocument(
//     db: DbLike,
//     wrrId: string,
//   ): Promise<WrrDocumentWithItems | null>;
//
// ---------------------------------------------------------------------------
// Mock pattern used in this file:
//
// listWrrDocuments issues two db.select() calls:
//   1. Data query  — fluent chain ending in .offset() which resolves to rows.
//   2. Count query — thenable chain resolving to [{ count: String(n) }].
//
// makeDataChain(rows)   — fluent chain; .offset() resolves to rows.
// makeCountChain(n)     — thenable chain resolving to [{ count: String(n) }].
// makeListDb(rows, total) — wires both via mockReturnValueOnce.
//
// getWrrDocument issues one db.select() that left-joins wrr_documents to
// wrr_items; raw join rows (one per item, or one null-item row when no items
// exist) are assembled by the function. A simple thenable chain is used.
// ---------------------------------------------------------------------------

import { describe, expect, it, vi } from "vitest";
import {
  listWrrDocuments,
  getWrrDocument,
} from "../receiving";

// ---------------------------------------------------------------------------
// Mock helpers — same Drizzle chain pattern as approvals.test.ts
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

// Data chain: fluent chain where the last call is .offset(), which resolves.
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

// Wires one data + one count query for listWrrDocuments.
function makeListDb(dataRows: unknown[], total: number) {
  return {
    select: vi
      .fn()
      .mockReturnValueOnce(makeDataChain(dataRows))
      .mockReturnValueOnce(makeCountChain(total)),
  };
}

// Simple thenable chain for getWrrDocument (single joined select).
function makeSelectChain(rows: unknown[]) {
  const resolved = Promise.resolve(rows);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  for (const method of ["from", "where", "leftJoin", "orderBy"]) {
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

function rawWrrDocRow(overrides: Partial<{
  id: string;
  wrrNumber: string;
  status: string;
  flowType: string;
  vendorPartyId: string;
  stagedByUserId: string;
  createdAt: Date;
}> = {}) {
  return {
    id: "wrr-uuid-1",
    wrrNumber: "WRR-2026-00001",
    status: "staged_pending_arrival",
    flowType: "vmi",
    vendorPartyId: "party-uuid-vendor",
    stagedByUserId: "user-uuid-staff",
    createdAt: NOW,
    ...overrides,
  };
}

function rawWrrItemRow(overrides: Partial<{
  id: string;
  wrrId: string;
  lotNumber: string;
  expectedQty: number;
  scannedQty: number;
  disposition: string;
  itemId: string | null;
}> = {}) {
  return {
    id: "item-uuid-1",
    wrrId: "wrr-uuid-1",
    lotNumber: "LOT-ABC-001",
    expectedQty: 10,
    scannedQty: 0,
    disposition: "store",
    itemId: "item-master-uuid-1",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// listWrrDocuments — empty state
// (requirements.md R2.5; design.md §4)
// ---------------------------------------------------------------------------

describe("listWrrDocuments — empty database (R2.5, design.md §4)", () => {
  it("returns { rows: [], total: 0 } when no WRR documents exist", async () => {
    const db = makeListDb([], 0);

    const result = await listWrrDocuments(
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
// listWrrDocuments — status filter
// (requirements.md R2.5; design.md §4 state model)
// ---------------------------------------------------------------------------

describe("listWrrDocuments — status filter (R2.5, design.md §4)", () => {
  it("returns only documents matching the supplied status filter", async () => {
    const inProgressRow = rawWrrDocRow({
      id: "wrr-in-progress",
      status: "receiving_in_progress",
    });
    const db = makeListDb([inProgressRow], 1);

    const result = await listWrrDocuments(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      { limit: 10, offset: 0, status: "receiving_in_progress" },
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].status).toBe("receiving_in_progress");
    expect(result.total).toBe(1);
  });

  it("returns empty rows when no documents match the supplied status filter", async () => {
    const db = makeListDb([], 0);

    const result = await listWrrDocuments(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      { limit: 10, offset: 0, status: "confirmed" },
    );

    expect(result.rows).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("calls where() on the data chain when a status filter is supplied (no full-table scan without filter application)", async () => {
    const dataChain = makeDataChain([]);
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(dataChain)
        .mockReturnValueOnce(makeCountChain(0)),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await listWrrDocuments(db as any, { limit: 10, offset: 0, status: "confirmed" });

    const whereFn = dataChain["where"] as ReturnType<typeof vi.fn>;
    expect(whereFn).toHaveBeenCalled();
  });

  it("returns all statuses when no status filter is provided", async () => {
    const rows = [
      rawWrrDocRow({ id: "wrr-1", status: "staged_pending_arrival" }),
      rawWrrDocRow({ id: "wrr-2", status: "receiving_in_progress" }),
      rawWrrDocRow({ id: "wrr-3", status: "confirmed" }),
    ];
    const db = makeListDb(rows, 3);

    const result = await listWrrDocuments(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      { limit: 10, offset: 0 },
    );

    expect(result.rows).toHaveLength(3);
    expect(result.total).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// listWrrDocuments — pagination
// (requirements.md R2.5; design.md §4)
// ---------------------------------------------------------------------------

describe("listWrrDocuments — pagination (R2.5, design.md §4)", () => {
  it("respects limit and offset — 3 docs total, limit=1 offset=0 returns 1 row with total=3", async () => {
    const db = makeListDb([rawWrrDocRow({ id: "wrr-page-1" })], 3);

    const result = await listWrrDocuments(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      { limit: 1, offset: 0 },
    );

    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(3);
  });

  it("total is the unpaginated count, independent of the page size", async () => {
    const db = makeListDb(
      [rawWrrDocRow({ id: "wrr-page-2" }), rawWrrDocRow({ id: "wrr-page-3" })],
      20,
    );

    const result = await listWrrDocuments(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      { limit: 2, offset: 10 },
    );

    expect(result.rows.length).toBe(2);
    expect(result.total).toBe(20);
  });

  it("applies the provided limit and offset via the Drizzle chain", async () => {
    const dataChain = makeDataChain([]);
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(dataChain)
        .mockReturnValueOnce(makeCountChain(0)),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await listWrrDocuments(db as any, { limit: 5, offset: 15 });

    const limitFn = dataChain["limit"] as ReturnType<typeof vi.fn>;
    const offsetFn = dataChain["offset"] as ReturnType<typeof vi.fn>;
    expect(limitFn).toHaveBeenCalledWith(5);
    expect(offsetFn).toHaveBeenCalledWith(15);
  });
});

// ---------------------------------------------------------------------------
// listWrrDocuments — row shape
// (requirements.md R2.5, R1.2; design.md §5.1)
// ---------------------------------------------------------------------------

describe("listWrrDocuments — row shape (R1.2, R2.5, design.md §5.1)", () => {
  it("each returned row includes id, wrrNumber, status, flowType, vendorPartyId, stagedByUserId, createdAt", async () => {
    const row = rawWrrDocRow({});
    const db = makeListDb([row], 1);

    const result = await listWrrDocuments(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      { limit: 10, offset: 0 },
    );

    const r = result.rows[0];
    expect(r).toHaveProperty("id");
    expect(r).toHaveProperty("wrrNumber");
    expect(r).toHaveProperty("status");
    expect(r).toHaveProperty("flowType");
    expect(r).toHaveProperty("vendorPartyId");
    expect(r).toHaveProperty("stagedByUserId");
    expect(r).toHaveProperty("createdAt");
  });
});

// ---------------------------------------------------------------------------
// getWrrDocument — not found
// (requirements.md R2.5; design.md §4)
// ---------------------------------------------------------------------------

describe("getWrrDocument — not found (R2.5, design.md §4)", () => {
  it("returns null when the wrrId does not match any document", async () => {
    const db = {
      select: vi.fn().mockReturnValue(makeSelectChain([])),
    };

    const result = await getWrrDocument(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      "non-existent-uuid",
    );

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getWrrDocument — known ID with no items
// (requirements.md R2.5, R1.3; design.md §5.1)
// ---------------------------------------------------------------------------

describe("getWrrDocument — known ID with no items (R1.3, design.md §5.1)", () => {
  it("returns the document with items: [] when the WRR exists but has no wrr_items rows", async () => {
    // Left join: one row returned with null item fields
    const wrrOnlyRow = {
      ...rawWrrDocRow({ id: "wrr-uuid-no-items" }),
      // item fields are null (left join with no item rows)
      itemId: null,
      itemWrrId: null,
      itemLotNumber: null,
      itemExpectedQty: null,
      itemScannedQty: null,
      itemDisposition: null,
      itemItemId: null,
    };
    const db = {
      select: vi.fn().mockReturnValue(makeSelectChain([wrrOnlyRow])),
    };

    const result = await getWrrDocument(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      "wrr-uuid-no-items",
    );

    expect(result).not.toBeNull();
    expect(result!.id).toBe("wrr-uuid-no-items");
    expect(Array.isArray(result!.items)).toBe(true);
    expect(result!.items).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getWrrDocument — known ID with items
// (requirements.md R3.1, R2.5; design.md §5.1, §5.2)
// ---------------------------------------------------------------------------

describe("getWrrDocument — known ID with items (R3.1, design.md §5.1, §5.2)", () => {
  it("returns the document with all items populated when wrr_items rows exist", async () => {
    const wrr = rawWrrDocRow({ id: "wrr-uuid-with-items" });
    const item1 = rawWrrItemRow({ id: "wrr-item-uuid-1", wrrId: "wrr-uuid-with-items", lotNumber: "LOT-001" });
    const item2 = rawWrrItemRow({ id: "wrr-item-uuid-2", wrrId: "wrr-uuid-with-items", lotNumber: "LOT-002", scannedQty: 5 });

    // One joined row per item
    const joinedRows = [
      {
        ...wrr,
        itemRowId: item1.id,
        itemWrrId: item1.wrrId,
        itemLotNumber: item1.lotNumber,
        itemExpectedQty: item1.expectedQty,
        itemScannedQty: item1.scannedQty,
        itemDisposition: item1.disposition,
        itemItemId: item1.itemId,
      },
      {
        ...wrr,
        itemRowId: item2.id,
        itemWrrId: item2.wrrId,
        itemLotNumber: item2.lotNumber,
        itemExpectedQty: item2.expectedQty,
        itemScannedQty: item2.scannedQty,
        itemDisposition: item2.disposition,
        itemItemId: item2.itemId,
      },
    ];
    const db = {
      select: vi.fn().mockReturnValue(makeSelectChain(joinedRows)),
    };

    const result = await getWrrDocument(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      "wrr-uuid-with-items",
    );

    expect(result).not.toBeNull();
    expect(result!.id).toBe("wrr-uuid-with-items");
    expect(Array.isArray(result!.items)).toBe(true);
    expect(result!.items).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// getWrrDocument — item field shape
// (requirements.md R1.3, R3.1; design.md §5.1)
// ---------------------------------------------------------------------------

describe("getWrrDocument — item field shape (R1.3, R3.1, design.md §5.1)", () => {
  it("each item includes id, wrrId, lotNumber, expectedQty, scannedQty, disposition, itemId", async () => {
    const wrr = rawWrrDocRow({ id: "wrr-uuid-shape" });
    const item = rawWrrItemRow({
      id: "wrr-item-shape",
      wrrId: "wrr-uuid-shape",
      lotNumber: "LOT-SHAPE-001",
      expectedQty: 20,
      scannedQty: 10,
      disposition: "inspect",
      itemId: "item-master-uuid-shape",
    });

    const joinedRow = {
      ...wrr,
      itemRowId: item.id,
      itemWrrId: item.wrrId,
      itemLotNumber: item.lotNumber,
      itemExpectedQty: item.expectedQty,
      itemScannedQty: item.scannedQty,
      itemDisposition: item.disposition,
      itemItemId: item.itemId,
    };
    const db = {
      select: vi.fn().mockReturnValue(makeSelectChain([joinedRow])),
    };

    const result = await getWrrDocument(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      "wrr-uuid-shape",
    );

    expect(result!.items).toHaveLength(1);
    const i = result!.items[0];
    expect(i).toHaveProperty("id");
    expect(i).toHaveProperty("wrrId");
    expect(i).toHaveProperty("lotNumber");
    expect(i).toHaveProperty("expectedQty");
    expect(i).toHaveProperty("scannedQty");
    expect(i).toHaveProperty("disposition");
    expect(i).toHaveProperty("itemId");
  });
});

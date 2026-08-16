// RED-step unit tests for lib/db/queries/transfers.ts (does not exist yet).
//
// Traceability:
//   specs/11-transfer-and-inspection/requirements.md
//     R1.1 — authorized user SHALL request movement from one source to one destination
//     R1.2 — request SHALL identify item, lot, flow type, quantity, source/destination, reason
//     R3.1 — system SHALL maintain a single shared inspection record structure
//     R7.1 — authorized users SHALL review transfer requests, current state, history
//     R7.2 — search/filter SHALL support status, date, source/destination, item/lot
//     R8.1 — every transfer read and mutation SHALL use current capability, party/flow scope
//   specs/11-transfer-and-inspection/design.md
//     §2 — transfer_requests and transfer_lines table shapes
//     §4 — transfer state and command boundaries
//
// Acceptance criteria covered:
//   "Authorized users can list transfer requests filterable by status with pagination
//    (requirements.md R7.1, R7.2; design.md §4)."
//   "A known transfer ID returns its request with all transfer_lines nested;
//    an unknown ID returns null (design.md §2, requirements.md R7.1)."
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/db/queries/transfers.ts (for backend-builder):
//
//   export type TransferRequestRow = {
//     id: string;
//     status: string;
//     flowType: string;
//     fromLocationId: string;
//     toLocationId: string;
//     requestedBy: string;
//     requiresApproval: boolean;
//     createdAt: Date;
//   };
//
//   export type TransferLineRow = {
//     id: string;
//     transferRequestId: string;
//     lotId: string;
//     itemId: string;
//     qtyRequested: string;
//     qtyTransferred: string;
//     status: string;
//   };
//
//   export type TransferRequestWithLines = TransferRequestRow & {
//     lines: TransferLineRow[];
//   };
//
//   // Returns paginated transfer requests; optional status filter.
//   export async function listTransferRequests(
//     db: DbLike,
//     opts: { limit: number; offset: number; status?: string },
//   ): Promise<{ rows: TransferRequestRow[]; total: number }>;
//
//   // Returns the transfer request with nested lines or null when not found.
//   export async function getTransferRequest(
//     db: DbLike,
//     transferId: string,
//   ): Promise<TransferRequestWithLines | null>;
//
// ---------------------------------------------------------------------------
// Mock pattern:
//
// listTransferRequests issues two db.select() calls:
//   1. Data query  — fluent chain ending in .offset() which resolves to rows.
//   2. Count query — thenable chain resolving to [{ count: String(n) }].
//
// makeDataChain(rows)     — fluent chain; .offset() resolves to rows.
// makeCountChain(n)       — thenable chain resolving to [{ count: String(n) }].
// makeListDb(rows, total) — wires both via mockReturnValueOnce.
//
// getTransferRequest issues one db.select() that left-joins transfer_requests to
// transfer_lines; raw join rows (one per line, or one null-line row when no lines
// exist) are assembled by the function.
// ---------------------------------------------------------------------------

import { describe, expect, it, vi } from "vitest";
import {
  listTransferRequests,
  getTransferRequest,
  listInspectionCases,
  getInspectionCase,
  listInspectionAndTransferQueue,
} from "../transfers";

// ---------------------------------------------------------------------------
// Mock helpers
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

// Wires one data + one count query for listTransferRequests.
function makeListDb(dataRows: unknown[], total: number) {
  return {
    select: vi
      .fn()
      .mockReturnValueOnce(makeDataChain(dataRows))
      .mockReturnValueOnce(makeCountChain(total)),
  };
}

// Simple thenable chain for getTransferRequest (single joined select).
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

function rawTransferRequestRow(overrides: Partial<{
  id: string;
  status: string;
  flowType: string;
  fromLocationId: string;
  toLocationId: string;
  requestedBy: string;
  requiresApproval: boolean;
  createdAt: Date;
}> = {}) {
  return {
    id: "transfer-uuid-1",
    status: "staged",
    flowType: "vmi",
    fromLocationId: "loc-uuid-from",
    toLocationId: "loc-uuid-to",
    requestedBy: "user-uuid-staff",
    requiresApproval: false,
    createdAt: NOW,
    ...overrides,
  };
}

function rawTransferLineRow(overrides: Partial<{
  id: string;
  transferRequestId: string;
  lotId: string;
  itemId: string;
  qtyRequested: string;
  qtyTransferred: string;
  status: string;
}> = {}) {
  return {
    id: "line-uuid-1",
    transferRequestId: "transfer-uuid-1",
    lotId: "lot-uuid-1",
    itemId: "item-uuid-1",
    qtyRequested: "10",
    qtyTransferred: "0",
    status: "pending",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// listTransferRequests — empty state
// (requirements.md R7.1, R7.2; design.md §4)
// ---------------------------------------------------------------------------

describe("listTransferRequests — empty database (R7.1, R7.2, design.md §4)", () => {
  it("(AC: list with pagination) returns { rows: [], total: 0 } when no transfer requests exist", async () => {
    const db = makeListDb([], 0);

    const result = await listTransferRequests(
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
// listTransferRequests — status filter
// (requirements.md R7.2; design.md §4 state model)
// ---------------------------------------------------------------------------

describe("listTransferRequests — status filter (R7.2, design.md §4)", () => {
  it("(AC: status filter applied) returns only transfer requests matching the supplied status filter", async () => {
    const inProgressRow = rawTransferRequestRow({
      id: "transfer-in-progress",
      status: "in_progress",
    });
    const db = makeListDb([inProgressRow], 1);

    const result = await listTransferRequests(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      { limit: 10, offset: 0, status: "in_progress" },
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].status).toBe("in_progress");
    expect(result.total).toBe(1);
  });

  it("(AC: status filter returns empty) returns empty rows when no requests match the supplied status filter", async () => {
    const db = makeListDb([], 0);

    const result = await listTransferRequests(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      { limit: 10, offset: 0, status: "completed" },
    );

    expect(result.rows).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("(AC: where() invoked on status filter) calls where() on the data chain when a status filter is supplied", async () => {
    const dataChain = makeDataChain([]);
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(dataChain)
        .mockReturnValueOnce(makeCountChain(0)),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await listTransferRequests(db as any, { limit: 10, offset: 0, status: "completed" });

    const whereFn = dataChain["where"] as ReturnType<typeof vi.fn>;
    expect(whereFn).toHaveBeenCalled();
  });

  it("(AC: no status filter returns all) returns all statuses when no status filter is provided", async () => {
    const rows = [
      rawTransferRequestRow({ id: "t-1", status: "staged" }),
      rawTransferRequestRow({ id: "t-2", status: "in_progress" }),
      rawTransferRequestRow({ id: "t-3", status: "completed" }),
    ];
    const db = makeListDb(rows, 3);

    const result = await listTransferRequests(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      { limit: 10, offset: 0 },
    );

    expect(result.rows).toHaveLength(3);
    expect(result.total).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// listTransferRequests — pagination
// (requirements.md R7.2; design.md §4)
// ---------------------------------------------------------------------------

describe("listTransferRequests — pagination (R7.2, design.md §4)", () => {
  it("(AC: limit/offset respected) limit=1 offset=0 returns 1 row with total=3", async () => {
    const db = makeListDb([rawTransferRequestRow({ id: "t-page-1" })], 3);

    const result = await listTransferRequests(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      { limit: 1, offset: 0 },
    );

    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(3);
  });

  it("(AC: total is unpaginated count) total is the unpaginated count, independent of page size", async () => {
    const db = makeListDb(
      [rawTransferRequestRow({ id: "t-page-2" }), rawTransferRequestRow({ id: "t-page-3" })],
      20,
    );

    const result = await listTransferRequests(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      { limit: 2, offset: 10 },
    );

    expect(result.rows.length).toBe(2);
    expect(result.total).toBe(20);
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
    await listTransferRequests(db as any, { limit: 5, offset: 15 });

    const limitFn = dataChain["limit"] as ReturnType<typeof vi.fn>;
    const offsetFn = dataChain["offset"] as ReturnType<typeof vi.fn>;
    expect(limitFn).toHaveBeenCalledWith(5);
    expect(offsetFn).toHaveBeenCalledWith(15);
  });
});

// ---------------------------------------------------------------------------
// listTransferRequests — row shape
// (requirements.md R1.2, R7.1; design.md §2)
// ---------------------------------------------------------------------------

describe("listTransferRequests — row shape (R1.2, R7.1, design.md §2)", () => {
  it("(AC: row fields present) each returned row includes id, status, flowType, fromLocationId, toLocationId, requestedBy, requiresApproval, createdAt", async () => {
    const row = rawTransferRequestRow({});
    const db = makeListDb([row], 1);

    const result = await listTransferRequests(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      { limit: 10, offset: 0 },
    );

    const r = result.rows[0];
    expect(r).toHaveProperty("id");
    expect(r).toHaveProperty("status");
    expect(r).toHaveProperty("flowType");
    expect(r).toHaveProperty("fromLocationId");
    expect(r).toHaveProperty("toLocationId");
    expect(r).toHaveProperty("requestedBy");
    expect(r).toHaveProperty("requiresApproval");
    expect(r).toHaveProperty("createdAt");
  });
});

// ---------------------------------------------------------------------------
// getTransferRequest — not found
// (requirements.md R7.1; design.md §4)
// ---------------------------------------------------------------------------

describe("getTransferRequest — not found (R7.1, design.md §4)", () => {
  it("(AC: unknown ID returns null) returns null when the transferId does not match any transfer request", async () => {
    const db = {
      select: vi.fn().mockReturnValue(makeSelectChain([])),
    };

    const result = await getTransferRequest(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      "non-existent-uuid",
    );

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getTransferRequest — known ID with no lines
// (requirements.md R7.1; design.md §2)
// ---------------------------------------------------------------------------

describe("getTransferRequest — known ID with no lines (R7.1, design.md §2)", () => {
  it("(AC: empty lines array) returns the request with lines: [] when the transfer exists but has no transfer_lines rows", async () => {
    // Left join: one row returned with null line fields
    const requestOnlyRow = {
      ...rawTransferRequestRow({ id: "transfer-uuid-no-lines" }),
      // line fields are null (left join with no line rows)
      lineId: null,
      lineTransferRequestId: null,
      lineLotId: null,
      lineItemId: null,
      lineQtyRequested: null,
      lineQtyTransferred: null,
      lineStatus: null,
    };
    const db = {
      select: vi.fn().mockReturnValue(makeSelectChain([requestOnlyRow])),
    };

    const result = await getTransferRequest(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      "transfer-uuid-no-lines",
    );

    expect(result).not.toBeNull();
    expect(result!.id).toBe("transfer-uuid-no-lines");
    expect(Array.isArray(result!.lines)).toBe(true);
    expect(result!.lines).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getTransferRequest — known ID with lines
// (requirements.md R7.1, R1.2; design.md §2)
// ---------------------------------------------------------------------------

describe("getTransferRequest — known ID with lines (R7.1, R1.2, design.md §2)", () => {
  it("(AC: lines array populated) returns the request with all lines populated when transfer_lines rows exist", async () => {
    const transfer = rawTransferRequestRow({ id: "transfer-uuid-with-lines" });
    const line1 = rawTransferLineRow({
      id: "line-uuid-1",
      transferRequestId: "transfer-uuid-with-lines",
      lotId: "lot-uuid-1",
      qtyRequested: "10",
      qtyTransferred: "0",
      status: "pending",
    });
    const line2 = rawTransferLineRow({
      id: "line-uuid-2",
      transferRequestId: "transfer-uuid-with-lines",
      lotId: "lot-uuid-2",
      qtyRequested: "5",
      qtyTransferred: "5",
      status: "completed",
    });

    // One joined row per line
    const joinedRows = [
      {
        ...transfer,
        lineId: line1.id,
        lineTransferRequestId: line1.transferRequestId,
        lineLotId: line1.lotId,
        lineItemId: line1.itemId,
        lineQtyRequested: line1.qtyRequested,
        lineQtyTransferred: line1.qtyTransferred,
        lineStatus: line1.status,
      },
      {
        ...transfer,
        lineId: line2.id,
        lineTransferRequestId: line2.transferRequestId,
        lineLotId: line2.lotId,
        lineItemId: line2.itemId,
        lineQtyRequested: line2.qtyRequested,
        lineQtyTransferred: line2.qtyTransferred,
        lineStatus: line2.status,
      },
    ];
    const db = {
      select: vi.fn().mockReturnValue(makeSelectChain(joinedRows)),
    };

    const result = await getTransferRequest(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      "transfer-uuid-with-lines",
    );

    expect(result).not.toBeNull();
    expect(result!.id).toBe("transfer-uuid-with-lines");
    expect(Array.isArray(result!.lines)).toBe(true);
    expect(result!.lines).toHaveLength(2);
  });

  it("(AC: line field shape) each line includes id, transferRequestId, lotId, itemId, qtyRequested, qtyTransferred, status", async () => {
    const transfer = rawTransferRequestRow({ id: "transfer-uuid-shape" });
    const line = rawTransferLineRow({
      id: "line-uuid-shape",
      transferRequestId: "transfer-uuid-shape",
      lotId: "lot-uuid-shape",
      itemId: "item-uuid-shape",
      qtyRequested: "20",
      qtyTransferred: "10",
      status: "in_transit",
    });

    const joinedRow = {
      ...transfer,
      lineId: line.id,
      lineTransferRequestId: line.transferRequestId,
      lineLotId: line.lotId,
      lineItemId: line.itemId,
      lineQtyRequested: line.qtyRequested,
      lineQtyTransferred: line.qtyTransferred,
      lineStatus: line.status,
    };
    const db = {
      select: vi.fn().mockReturnValue(makeSelectChain([joinedRow])),
    };

    const result = await getTransferRequest(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      "transfer-uuid-shape",
    );

    expect(result!.lines).toHaveLength(1);
    const l = result!.lines[0];
    expect(l).toHaveProperty("id");
    expect(l).toHaveProperty("transferRequestId");
    expect(l).toHaveProperty("lotId");
    expect(l).toHaveProperty("itemId");
    expect(l).toHaveProperty("qtyRequested");
    expect(l).toHaveProperty("qtyTransferred");
    expect(l).toHaveProperty("status");
  });
});

// ---------------------------------------------------------------------------
// listInspectionCases / getInspectionCase
//
// Traceability:
//   specs/11-transfer-and-inspection/design.md §6.1 — shared inspection_cases
//     record model, inbound/transfer context isolation.
//   specs/11-transfer-and-inspection/design.md §2 — table shapes.
// ---------------------------------------------------------------------------

// Data chain for listInspectionCases: three innerJoins before an optional
// where(), then orderBy/limit/offset (offset resolves).
function makeInspectionDataChain(resolvedRows: unknown[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  for (const method of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain["offset"] = vi.fn().mockResolvedValue(resolvedRows);
  return chain;
}

function makeInspectionListDb(dataRows: unknown[], total: number) {
  return {
    select: vi
      .fn()
      .mockReturnValueOnce(makeInspectionDataChain(dataRows))
      .mockReturnValueOnce(makeCountChain(total)),
  };
}

// getInspectionCase: single select with three innerJoins + where(), thenable.
function makeInspectionGetChain(rows: unknown[]) {
  const resolved = Promise.resolve(rows);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  for (const method of ["from", "innerJoin", "leftJoin", "where", "orderBy"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain["then"] = resolved.then.bind(resolved) as AnyFn;
  chain["catch"] = resolved.catch.bind(resolved) as AnyFn;
  chain["finally"] = resolved.finally.bind(resolved) as AnyFn;
  return chain;
}

function rawInspectionCaseRow(overrides: Partial<{
  id: string;
  contextType: string;
  sourceRefType: string;
  sourceRefId: string;
  lotNumber: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  itemUom: string;
  partyId: string;
  partyName: string;
  flowType: string;
  status: string;
  openedBy: string;
  openedAt: Date;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  locationLabel: string | null;
  qtyToInspect: string | number | null;
}> = {}) {
  return {
    id: "case-uuid-1",
    contextType: "transfer",
    sourceRefType: "transfer_line",
    sourceRefId: "line-uuid-1",
    lotNumber: "LOT-2026-0042",
    itemId: "item-uuid-1",
    itemCode: "HYD-CUP-001",
    itemName: "Hydraulic Coupling Assembly",
    itemUom: "piece",
    partyId: "party-uuid-1",
    partyName: "Acme Vendor",
    flowType: "vmi",
    status: "open",
    openedBy: "user-uuid-staff",
    openedAt: NOW,
    resolvedBy: null,
    resolvedAt: null,
    locationLabel: "A1-01",
    ...overrides,
  };
}

describe("listInspectionCases — empty database (design.md §6.1)", () => {
  it("(AC: list with pagination) returns { rows: [], total: 0 } when no inspection cases exist", async () => {
    const db = makeInspectionListDb([], 0);

    const result = await listInspectionCases(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      {},
    );

    expect(result.rows).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});

describe("listInspectionCases — status filter (design.md §6.1)", () => {
  it("(AC: status filter applied) calls where() and returns only matching rows", async () => {
    const openRow = rawInspectionCaseRow({ id: "case-open", status: "open" });
    const db = makeInspectionListDb([openRow], 1);

    const result = await listInspectionCases(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      { status: "open" },
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].status).toBe("open");
    expect(result.total).toBe(1);
  });

  it("(AC: where() invoked on status filter) calls where() on the data chain when a status filter is supplied", async () => {
    const dataChain = makeInspectionDataChain([]);
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(dataChain)
        .mockReturnValueOnce(makeCountChain(0)),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await listInspectionCases(db as any, { status: "open" });

    const whereFn = dataChain["where"] as ReturnType<typeof vi.fn>;
    expect(whereFn).toHaveBeenCalled();
  });

  it("(AC: no status filter returns all) returns all statuses when no status filter is provided", async () => {
    const rows = [
      rawInspectionCaseRow({ id: "case-1", status: "open" }),
      rawInspectionCaseRow({ id: "case-2", status: "passed" }),
    ];
    const db = makeInspectionListDb(rows, 2);

    const result = await listInspectionCases(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      {},
    );

    expect(result.rows).toHaveLength(2);
    expect(result.total).toBe(2);
  });
});

describe("listInspectionCases — row shape (design.md §2)", () => {
  it("(AC: row fields present) each returned row includes id, contextType, lotNumber, itemName, partyName, locationLabel, status, openedAt", async () => {
    const row = rawInspectionCaseRow({});
    const db = makeInspectionListDb([row], 1);

    const result = await listInspectionCases(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      {},
    );

    const r = result.rows[0];
    expect(r).toHaveProperty("id");
    expect(r).toHaveProperty("contextType");
    expect(r).toHaveProperty("lotNumber");
    expect(r).toHaveProperty("itemName");
    expect(r).toHaveProperty("partyName");
    expect(r).toHaveProperty("locationLabel");
    expect(r).toHaveProperty("status");
    expect(r).toHaveProperty("openedAt");
  });
});

describe("getInspectionCase — not found (design.md §2)", () => {
  it("(AC: unknown ID returns null) returns null when the caseId does not match any inspection case", async () => {
    const db = {
      select: vi.fn().mockReturnValue(makeInspectionGetChain([])),
    };

    const result = await getInspectionCase(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      "non-existent-uuid",
    );

    expect(result).toBeNull();
  });
});

describe("getInspectionCase — known ID (design.md §2, §6.1)", () => {
  it("(AC: row shape + numeric qtyToInspect) returns the case with itemUom and a numeric qtyToInspect derived from the polymorphic subquery", async () => {
    const row = rawInspectionCaseRow({ id: "case-known", qtyToInspect: "10" });
    const db = {
      select: vi.fn().mockReturnValue(makeInspectionGetChain([row])),
    };

    const result = await getInspectionCase(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      "case-known",
    );

    expect(result).not.toBeNull();
    expect(result!.id).toBe("case-known");
    expect(result!.itemUom).toBe("piece");
    expect(result!.qtyToInspect).toBe(10);
    expect(typeof result!.qtyToInspect).toBe("number");
  });

  it("(AC: null qtyToInspect defaults to 0) returns qtyToInspect: 0 when the subquery resolves to null", async () => {
    const row = rawInspectionCaseRow({ id: "case-null-qty", qtyToInspect: null });
    const db = {
      select: vi.fn().mockReturnValue(makeInspectionGetChain([row])),
    };

    const result = await getInspectionCase(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      "case-null-qty",
    );

    expect(result!.qtyToInspect).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// listInspectionAndTransferQueue — RED step (function does not exist yet)
//
// Traceability:
//   specs/11-transfer-and-inspection/requirements.md
//     R1.1 — authorized users SHALL request/review movement between locations
//       (transfer-row visibility, gated by `transfer.view`).
//     R2.3 — the inspection queue (`/inspection`) displays candidate lots and
//       resolution controls (inspection-row visibility, gated by
//       `inspection.perform`).
//   specs/00-steering/multi-agent-work-division.md
//     "Sidebar structure — confirmed target (2026-08-17)" — Product Owner
//     decision merging Master Inventory's Inspection tab into one combined
//     transfer+inspection queue, each row independently capability-gated.
//   specs/00-steering/ui-implementation-plan.md
//     P4 — "New: a combined `listInspectionAndTransferQueue`-style query
//     merging `listTransferRequests` + `listInspectionCases` into one
//     normalized, sortable row shape, respecting each item's own capability
//     gate (`transfer.view`, `inspection.perform`) independently — a user
//     missing one capability still sees the other type's rows, not an
//     all-or-nothing tab."
//
// Acceptance criteria covered:
//   "A caller with only transfer.view sees only transfer-type rows, shaped
//    and linked to /transfers/[id] (R1.1; multi-agent-work-division.md
//    Sidebar structure decision)."
//   "A caller with only inspection.perform sees only inspection-type rows,
//    shaped and linked to /inspection/[id] (R2.3; same decision)."
//   "A caller with both capabilities sees a single merged list containing
//    both row types, correctly typed/shaped, sorted oldest-first to match
//    listTransferRequests'/listInspectionCases' existing work-queue
//    prioritization order (ui-implementation-plan.md P4)."
//   "A caller with neither capability gets an empty array and the function
//    makes no DB calls at all — defense against wasted queries when a
//    caller somehow ends up with no capability (ui-implementation-plan.md
//    P4 'independently gated, not all-or-nothing')."
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/db/queries/transfers.ts (for
// backend-builder — this function does not exist yet):
//
//   export type InspectionAndTransferQueueRow = {
//     id: string;
//     type: "transfer" | "inspection";
//     title: string;
//     status: string;
//     createdAt: Date;
//     href: string;
//   };
//
//   // Calls listTransferRequests only when includeTransfers is true, and
//   // listInspectionCases only when includeInspections is true — the
//   // CALLER decides which to include based on the current user's actual
//   // capability grants (transfer.view / inspection.perform); this function
//   // does not perform authorization itself. Normalizes both result sets
//   // into InspectionAndTransferQueueRow, merges them, and sorts the merged
//   // list by createdAt ASCENDING (oldest first — matching the existing
//   // oldest-first work-queue order used by listTransferRequests and
//   // listInspectionCases themselves). href is `/transfers/${id}` for
//   // transfer rows and `/inspection/${id}` for inspection rows.
//   export async function listInspectionAndTransferQueue(
//     db: DbLike,
//     opts: {
//       limit: number;
//       offset: number;
//       includeTransfers: boolean;
//       includeInspections: boolean;
//     },
//   ): Promise<InspectionAndTransferQueueRow[]>;
//
// ---------------------------------------------------------------------------
// Mock pattern: reuses makeDataChain/makeCountChain (transfer query shape)
// and makeInspectionDataChain/makeCountChain (inspection query shape) from
// above. Each underlying list function issues 2 db.select() calls (data +
// count), so a combined call with both flags true issues 4 total, in the
// order [transfers data, transfers count, inspections data, inspections
// count] — matching the contract's "calls listTransferRequests ... then
// listInspectionCases" description.
// ---------------------------------------------------------------------------

describe("listInspectionAndTransferQueue — transfer-only (R1.1, Sidebar structure decision 2026-08-17)", () => {
  it("(AC: transfer.view-only caller sees only transfer rows) includeTransfers: true, includeInspections: false returns only transfer-type rows shaped for the combined queue", async () => {
    const transferRow = rawTransferRequestRow({
      id: "transfer-queue-1",
      status: "in_progress",
      createdAt: new Date("2026-08-01T00:00:00Z"),
    });
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(makeDataChain([transferRow]))
        .mockReturnValueOnce(makeCountChain(1)),
    };

    const result = await listInspectionAndTransferQueue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      { limit: 10, offset: 0, includeTransfers: true, includeInspections: false },
    );

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("transfer");
    expect(result[0].id).toBe("transfer-queue-1");
    expect(result[0].status).toBe("in_progress");
    expect(result[0].href).toBe("/transfers/transfer-queue-1");
    expect(typeof result[0].title).toBe("string");
    expect(result[0].title.length).toBeGreaterThan(0);
  });
});

describe("listInspectionAndTransferQueue — inspection-only (R2.3, Sidebar structure decision 2026-08-17)", () => {
  it("(AC: inspection.perform-only caller sees only inspection rows) includeTransfers: false, includeInspections: true returns only inspection-type rows shaped for the combined queue", async () => {
    const inspectionRow = rawInspectionCaseRow({
      id: "case-queue-1",
      status: "open",
      openedAt: new Date("2026-08-02T00:00:00Z"),
    });
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(makeInspectionDataChain([inspectionRow]))
        .mockReturnValueOnce(makeCountChain(1)),
    };

    const result = await listInspectionAndTransferQueue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      { limit: 10, offset: 0, includeTransfers: false, includeInspections: true },
    );

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("inspection");
    expect(result[0].id).toBe("case-queue-1");
    expect(result[0].status).toBe("open");
    expect(result[0].href).toBe("/inspection/case-queue-1");
    expect(typeof result[0].title).toBe("string");
    expect(result[0].title.length).toBeGreaterThan(0);
  });
});

describe("listInspectionAndTransferQueue — merged (both capabilities, ui-implementation-plan.md P4)", () => {
  it("(AC: both capabilities merge into one correctly sorted, correctly typed list) includeTransfers: true, includeInspections: true returns a merged list with both types present, sorted oldest-first by createdAt", async () => {
    const olderTransfer = rawTransferRequestRow({
      id: "transfer-old",
      status: "staged",
      createdAt: new Date("2026-08-01T00:00:00Z"),
    });
    const newerInspection = rawInspectionCaseRow({
      id: "case-new",
      status: "open",
      openedAt: new Date("2026-08-05T00:00:00Z"),
    });

    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(makeDataChain([olderTransfer]))
        .mockReturnValueOnce(makeCountChain(1))
        .mockReturnValueOnce(makeInspectionDataChain([newerInspection]))
        .mockReturnValueOnce(makeCountChain(1)),
    };

    const result = await listInspectionAndTransferQueue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      { limit: 10, offset: 0, includeTransfers: true, includeInspections: true },
    );

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.type).sort()).toEqual(["inspection", "transfer"]);

    // Oldest-first: the transfer (2026-08-01) sorts before the inspection
    // case (2026-08-05), matching listTransferRequests'/listInspectionCases'
    // own oldest-first work-queue ordering.
    expect(result[0].id).toBe("transfer-old");
    expect(result[0].type).toBe("transfer");
    expect(result[0].href).toBe("/transfers/transfer-old");
    expect(result[1].id).toBe("case-new");
    expect(result[1].type).toBe("inspection");
    expect(result[1].href).toBe("/inspection/case-new");
  });
});

describe("listInspectionAndTransferQueue — neither capability (defense against wasted queries, ui-implementation-plan.md P4)", () => {
  it("(AC: no capability -> empty array, zero DB calls) includeTransfers: false, includeInspections: false returns [] and never calls db.select", async () => {
    const db = { select: vi.fn() };

    const result = await listInspectionAndTransferQueue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      { limit: 10, offset: 0, includeTransfers: false, includeInspections: false },
    );

    expect(result).toEqual([]);
    expect(db.select).not.toHaveBeenCalled();
  });
});

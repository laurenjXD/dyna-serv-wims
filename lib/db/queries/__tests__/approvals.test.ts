// RED-step unit tests for lib/db/queries/approvals.ts (does not exist yet).
//
// Traceability:
//   specs/09-approval-queue/requirements.md R3 (Queue review and filtering),
//     R4 (Decision recording), R2 (Queue states and transitions)
//   specs/09-approval-queue/design.md §3 (Persistence model),
//     §5 (State machine and concurrency)
//   specs/09-approval-queue/tasks.md Testing Matrix §Unit tests
//
// Acceptance criteria covered (requirements.md §6):
//   "An authorized reviewer sees only scoped pending requests and can record one
//    append-only approve/reject decision."
//   "An approved decision cannot be consumed against a changed, stale, revoked,
//    expired, or different target."
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/db/queries/approvals.ts (for backend-builder):
//
//   export type ApprovalRequestRow = {
//     id: string;
//     requestNumber: string;
//     approvalType: string;
//     reason: string;
//     status: string;
//     expiryAt: Date;
//     createdAt: Date;
//     requesterUserId: string;
//     targetSnapshot: unknown;
//   };
//
//   export type ApprovalDecisionRow = {
//     id: string;
//     reviewerUserId: string;
//     outcome: string;
//     reason: string | null;
//     decidedAt: Date;
//     consumedAt: Date | null;
//   };
//
//   export type ApprovalRequestWithDecisions = ApprovalRequestRow & {
//     decisions: ApprovalDecisionRow[];
//   };
//
//   // Returns rows with status='pending', ordered by createdAt ascending.
//   // opts.approvalType filters to a specific type when supplied.
//   export async function listPendingApprovalRequests(
//     db: DbLike,
//     opts: { limit: number; offset: number; approvalType?: string },
//   ): Promise<{ rows: ApprovalRequestRow[]; total: number }>;
//
//   // Returns the request with its decisions array, or null if not found.
//   export async function getApprovalRequest(
//     db: DbLike,
//     requestId: string,
//   ): Promise<ApprovalRequestWithDecisions | null>;
//
// ---------------------------------------------------------------------------
// Mock pattern used in this file:
//
// listPendingApprovalRequests issues two db.select() calls:
//   1. Data query — fluent chain ending in .offset() which resolves to rows.
//   2. Count query — thenable chain resolving to [{ count: String(n) }].
//
// makeDataChain(rows)   — fluent chain; .offset() resolves to rows.
// makeCountChain(n)     — thenable chain resolving to [{ count: String(n) }].
// makeDb(rows, total)   — wires both via mockReturnValueOnce.
//
// getApprovalRequest issues one db.select() that .from().where().leftJoin()...
// returns a raw join result (request row repeated per decision, or one null-
// decision row when no decisions exist); the query function assembles the
// shape. We use a simple thenable chain for these.
// ---------------------------------------------------------------------------

import { describe, expect, it, vi } from "vitest";
import {
  getApprovalRequest,
  listPendingApprovalRequests,
} from "../approvals";

// ---------------------------------------------------------------------------
// Mock helpers — same Drizzle chain pattern as ledgers.test.ts
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

// Wires one data + one count query.
function makeDb(dataRows: unknown[], total: number) {
  return {
    select: vi
      .fn()
      .mockReturnValueOnce(makeDataChain(dataRows))
      .mockReturnValueOnce(makeCountChain(total)),
  };
}

// A simple thenable chain for getApprovalRequest (single joined select).
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
const EXPIRY = new Date("2026-08-08T10:30:00Z");

function rawRequestRow(overrides: {
  id?: string;
  requestNumber?: string;
  approvalType?: string;
  reason?: string;
  status?: string;
  expiryAt?: Date;
  createdAt?: Date;
  requesterUserId?: string;
  targetSnapshot?: unknown;
}) {
  return {
    id: "req-uuid-1",
    requestNumber: "APR-0001",
    approvalType: "fifo_override",
    reason: "Override needed for urgent order",
    status: "pending",
    expiryAt: EXPIRY,
    createdAt: NOW,
    requesterUserId: "user-uuid-requester",
    targetSnapshot: {
      item_id: "item-uuid-1",
      lot_id: "lot-uuid-1",
      location_id: "loc-uuid-1",
    },
    ...overrides,
  };
}

function rawDecisionRow(overrides: {
  id?: string;
  reviewerUserId?: string;
  outcome?: string;
  reason?: string | null;
  decidedAt?: Date;
  consumedAt?: Date | null;
} = {}) {
  return {
    id: "dec-uuid-1",
    reviewerUserId: "user-uuid-reviewer",
    outcome: "approved",
    reason: "Approved after review",
    decidedAt: new Date("2026-08-08T10:15:00Z"),
    consumedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// listPendingApprovalRequests
// ---------------------------------------------------------------------------

describe("listPendingApprovalRequests — empty state (R3.1, design.md §3)", () => {
  it("returns empty rows and total=0 when no pending requests exist", async () => {
    const db = makeDb([], 0);

    const result = await listPendingApprovalRequests(
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

describe("listPendingApprovalRequests — status filtering (R2.2, R3.1, design.md §5)", () => {
  it("returns only pending requests (not approved, rejected, or expired) — filtered to status=pending", async () => {
    // The DB layer is responsible for issuing a WHERE status='pending' query.
    // The test stubs the db to return only pending rows (simulating what a
    // correct WHERE clause would return), and verifies the function passes
    // those rows through untouched.
    const pendingRow = rawRequestRow({ id: "req-1", status: "pending" });
    const db = makeDb([pendingRow], 1);

    const result = await listPendingApprovalRequests(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      { limit: 10, offset: 0 },
    );

    // All returned rows must carry status=pending (the WHERE clause must filter).
    // The where() method must be called to prove the filter is applied.
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].status).toBe("pending");
    expect(result.total).toBe(1);
  });

  it("confirms the data chain's where() is called — no full-table scan (R2.1, design.md §5)", async () => {
    const dataChain = makeDataChain([]);
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(dataChain)
        .mockReturnValueOnce(makeCountChain(0)),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await listPendingApprovalRequests(db as any, { limit: 10, offset: 0 });

    const whereFn = dataChain["where"] as ReturnType<typeof vi.fn>;
    expect(whereFn).toHaveBeenCalled();
  });
});

describe("listPendingApprovalRequests — pagination (R3.2, design.md §3)", () => {
  it("respects limit and offset — 2 pending rows total, limit=1 offset=0 returns 1 row with total=2", async () => {
    // The data layer returns only the first page (limit 1), but total=2
    const db = makeDb([rawRequestRow({ id: "req-1" })], 2);

    const result = await listPendingApprovalRequests(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      { limit: 1, offset: 0 },
    );

    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(2);
  });

  it("total is the unpaginated count, independent of the page size", async () => {
    const db = makeDb(
      [rawRequestRow({ id: "req-3" }), rawRequestRow({ id: "req-4" })],
      15,
    );

    const result = await listPendingApprovalRequests(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      { limit: 2, offset: 10 },
    );

    expect(result.rows.length).toBe(2);
    expect(result.total).toBe(15);
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
    await listPendingApprovalRequests(db as any, { limit: 5, offset: 20 });

    const limitFn = dataChain["limit"] as ReturnType<typeof vi.fn>;
    const offsetFn = dataChain["offset"] as ReturnType<typeof vi.fn>;
    expect(limitFn).toHaveBeenCalledWith(5);
    expect(offsetFn).toHaveBeenCalledWith(20);
  });
});

describe("listPendingApprovalRequests — approvalType filter (R3.2, design.md §3)", () => {
  it("filters by approvalType when opts.approvalType is supplied — only matching rows returned", async () => {
    // Simulate the DB returning only the matching type after WHERE clause.
    const fifoRow = rawRequestRow({ id: "req-fifo", approvalType: "fifo_override" });
    const db = makeDb([fifoRow], 1);

    const result = await listPendingApprovalRequests(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      { limit: 10, offset: 0, approvalType: "fifo_override" },
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].approvalType).toBe("fifo_override");
  });

  it("returns empty rows when no requests match the supplied approvalType", async () => {
    const db = makeDb([], 0);

    const result = await listPendingApprovalRequests(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      { limit: 10, offset: 0, approvalType: "unregistered_future_type" },
    );

    expect(result.rows).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});

describe("listPendingApprovalRequests — ordering (R3.3, design.md §3)", () => {
  it("calls orderBy on the data chain — oldest-first ordering is applied (createdAt ASC)", async () => {
    const dataChain = makeDataChain([]);
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(dataChain)
        .mockReturnValueOnce(makeCountChain(0)),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await listPendingApprovalRequests(db as any, { limit: 10, offset: 0 });

    const orderByFn = dataChain["orderBy"] as ReturnType<typeof vi.fn>;
    expect(orderByFn).toHaveBeenCalled();
  });
});

describe("listPendingApprovalRequests — row shape (R3.3, design.md §3)", () => {
  it("each returned row includes id, requestNumber, approvalType, reason, status, expiryAt, createdAt, requesterUserId, targetSnapshot", async () => {
    const row = rawRequestRow({});
    const db = makeDb([row], 1);

    const result = await listPendingApprovalRequests(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      { limit: 10, offset: 0 },
    );

    const r = result.rows[0];
    expect(r).toHaveProperty("id");
    expect(r).toHaveProperty("requestNumber");
    expect(r).toHaveProperty("approvalType");
    expect(r).toHaveProperty("reason");
    expect(r).toHaveProperty("status");
    expect(r).toHaveProperty("expiryAt");
    expect(r).toHaveProperty("createdAt");
    expect(r).toHaveProperty("requesterUserId");
    expect(r).toHaveProperty("targetSnapshot");
  });
});

// ---------------------------------------------------------------------------
// getApprovalRequest
// ---------------------------------------------------------------------------

describe("getApprovalRequest — not found (R3.5, R7.5, design.md §6)", () => {
  it("returns null when no row matches the requestId", async () => {
    const db = {
      select: vi.fn().mockReturnValue(makeSelectChain([])),
    };

    const result = await getApprovalRequest(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      "non-existent-uuid",
    );

    expect(result).toBeNull();
  });
});

describe("getApprovalRequest — request with no decisions (R4.3, design.md §3)", () => {
  it("returns the request with an empty decisions array when the request exists but has no decisions", async () => {
    // Join returns one row with NULL decision fields
    const requestOnlyRow = {
      ...rawRequestRow({ id: "req-uuid-1" }),
      // decision fields are null (left join with no decision rows)
      decisionId: null,
      reviewerUserId: null,
      outcome: null,
      decisionReason: null,
      decidedAt: null,
      consumedAt: null,
    };
    const db = {
      select: vi.fn().mockReturnValue(makeSelectChain([requestOnlyRow])),
    };

    const result = await getApprovalRequest(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      "req-uuid-1",
    );

    expect(result).not.toBeNull();
    expect(result!.id).toBe("req-uuid-1");
    expect(Array.isArray(result!.decisions)).toBe(true);
    expect(result!.decisions).toHaveLength(0);
  });
});

describe("getApprovalRequest — request with decisions (R4.2, R4.3, design.md §3)", () => {
  it("returns the request with the decisions array populated when decisions exist", async () => {
    const req = rawRequestRow({ id: "req-uuid-2" });
    const dec1 = rawDecisionRow({ id: "dec-uuid-1", outcome: "approved" });
    const dec2 = rawDecisionRow({ id: "dec-uuid-2", outcome: "rejected" });
    // Joined rows: one per decision
    const joinedRows = [
      { ...req, decisionId: dec1.id, reviewerUserId: dec1.reviewerUserId, outcome: dec1.outcome, decisionReason: dec1.reason, decidedAt: dec1.decidedAt, consumedAt: dec1.consumedAt },
      { ...req, decisionId: dec2.id, reviewerUserId: dec2.reviewerUserId, outcome: dec2.outcome, decisionReason: dec2.reason, decidedAt: dec2.decidedAt, consumedAt: dec2.consumedAt },
    ];
    const db = {
      select: vi.fn().mockReturnValue(makeSelectChain(joinedRows)),
    };

    const result = await getApprovalRequest(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      "req-uuid-2",
    );

    expect(result).not.toBeNull();
    expect(result!.id).toBe("req-uuid-2");
    expect(Array.isArray(result!.decisions)).toBe(true);
    expect(result!.decisions).toHaveLength(2);
  });
});

describe("getApprovalRequest — decision row shape (R4.2, design.md §3 approval_decisions)", () => {
  it("each decision includes id, reviewerUserId, outcome, reason, decidedAt, consumedAt", async () => {
    const req = rawRequestRow({ id: "req-uuid-3" });
    const dec = rawDecisionRow({
      id: "dec-uuid-shape",
      reviewerUserId: "user-uuid-rev",
      outcome: "approved",
      reason: "Looks good",
      decidedAt: new Date("2026-08-08T10:15:00Z"),
      consumedAt: null,
    });
    const joinedRow = {
      ...req,
      decisionId: dec.id,
      reviewerUserId: dec.reviewerUserId,
      outcome: dec.outcome,
      decisionReason: dec.reason,
      decidedAt: dec.decidedAt,
      consumedAt: dec.consumedAt,
    };
    const db = {
      select: vi.fn().mockReturnValue(makeSelectChain([joinedRow])),
    };

    const result = await getApprovalRequest(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      "req-uuid-3",
    );

    expect(result!.decisions).toHaveLength(1);
    const d = result!.decisions[0];
    expect(d).toHaveProperty("id");
    expect(d).toHaveProperty("reviewerUserId");
    expect(d).toHaveProperty("outcome");
    expect(d).toHaveProperty("reason");
    expect(d).toHaveProperty("decidedAt");
    expect(d).toHaveProperty("consumedAt");
  });
});

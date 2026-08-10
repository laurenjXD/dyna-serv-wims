// RED-step unit tests for lib/actions/approvals.ts (does not exist yet).
//
// Traceability:
//   specs/09-approval-queue/requirements.md R4 (Decision recording),
//     R2 (Queue states and transitions), R7 (Security, audit, and privacy)
//   specs/09-approval-queue/design.md §5 (State machine and concurrency),
//     §6 (Authorization and RLS design), §4 (Approval policy registry)
//   specs/09-approval-queue/tasks.md Task 5 (Implement reviewer decisions),
//     Testing Matrix §Unit tests
//
// Acceptance criteria covered (requirements.md §6):
//   "An authorized reviewer sees only scoped pending requests and can record one
//    append-only approve/reject decision."
//   "Self-approval behavior follows the approved separation-of-duties decision."
//   "An approved decision cannot be consumed against a changed, stale, revoked,
//    expired, or different target."
//
// Capability used for approve/reject actions (design.md §4, confirmed against
// specs/02-rbac-roles §3.2 catalog): "fifo_override.approve"
//
// Mocking pattern: same DI approach as lib/actions/parties.test.ts —
// inject a RequestAuthorizationResolver whose getContext() is a vi.fn() stub.
//
// DB mock: in-memory maps for approval_requests and approval_decisions.
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/actions/approvals.ts (for backend-builder):
//
//   import type { RequestAuthorizationResolver } from "@/lib/rbac/session";
//
//   export type ApprovalActionResult =
//     | { ok: true }
//     | { ok: false; error: string };
//
//   // Records an 'approved' decision on a pending, non-expired, non-self request.
//   // Requires fifo_override.approve capability.
//   // Inserts an approval_decisions row and updates request status to 'approved'.
//   export async function approveRequest(
//     resolver: RequestAuthorizationResolver,
//     db: DbLike,
//     requestId: string,
//     reason: string,
//   ): Promise<ApprovalActionResult>;
//
//   // Records a 'rejected' decision on a pending, non-expired request.
//   // Requires fifo_override.approve capability.
//   // Inserts an approval_decisions row and updates request status to 'rejected'.
//   export async function rejectRequest(
//     resolver: RequestAuthorizationResolver,
//     db: DbLike,
//     requestId: string,
//     reason: string,
//   ): Promise<ApprovalActionResult>;
//
// ---------------------------------------------------------------------------

import { describe, expect, it, vi } from "vitest";
import type {
  AuthorizationContext,
  AuthorizationResolution,
  RequestAuthorizationResolver,
} from "@/lib/rbac/session";
import { approveRequest, rejectRequest } from "../approvals";
import { mockRlsDeps } from "@/lib/db/__tests__/helpers/mock-rls";

// ---------------------------------------------------------------------------
// Resolver mock helpers (same pattern as parties.test.ts)
// ---------------------------------------------------------------------------

function makeResolver(
  resolution: AuthorizationResolution,
): RequestAuthorizationResolver {
  return {
    getContext: vi.fn(async () => resolution),
  };
}

const approverContext: AuthorizationContext = {
  userId: "user-uuid-reviewer",
  profileStatus: "active",
  activeRoleKeys: ["supervisor"],
  grants: [{ resource: "fifo_override", action: "approve", scopeKind: "global" }],
  partyScopes: [],
};

const requesterContext: AuthorizationContext = {
  userId: "user-uuid-requester",
  profileStatus: "active",
  activeRoleKeys: ["warehouse_staff"],
  grants: [{ resource: "fifo_override", action: "request", scopeKind: "global" }],
  partyScopes: [],
};

// Authorized reviewer (different from the requester).
const authorizedResolver = () =>
  makeResolver({ kind: "authorized", context: approverContext });

// Authenticated user who is the SAME person as the requester (for self-approval tests).
const selfApprovalResolver = () =>
  makeResolver({
    kind: "authorized",
    context: {
      ...requesterContext,
      // Grant approve so the only blocker is self-approval, not missing capability.
      grants: [
        { resource: "fifo_override", action: "approve", scopeKind: "global" },
      ],
    },
  });

// User with no fifo_override.approve grant.
const noApproveCapabilityResolver = () =>
  makeResolver({
    kind: "authorized",
    context: {
      ...requesterContext,
      grants: [{ resource: "fifo_override", action: "request", scopeKind: "global" }],
    },
  });

const unauthenticatedResolver = () =>
  makeResolver({ kind: "unauthenticated" });

// ---------------------------------------------------------------------------
// DB mock helpers
// ---------------------------------------------------------------------------

const FUTURE_EXPIRY = new Date(Date.now() + 30 * 60 * 1000); // 30 min from now
const PAST_EXPIRY = new Date(Date.now() - 5 * 60 * 1000);   // 5 min ago

// In-memory db with approval_requests and approval_decisions maps.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeApprovalDb(requestRows: Record<string, any>, decisionRows?: any[]) {
  const decisions: unknown[] = decisionRows ?? [];

  // select() returns a thenable chain that looks up requestRows by the WHERE argument.
  // The implementation will call db.select().from(...).where(...) — we return the
  // full row set; the caller filters by requestId via WHERE which we simulate here
  // by returning all rows (the test itself controls what's in requestRows).
  const makeSelectChain = (rows: unknown[]) => {
    const resolved = Promise.resolve(rows);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: Record<string, any> = {};
    for (const method of ["from", "where", "leftJoin", "orderBy", "limit", "offset"]) {
      chain[method] = vi.fn(() => chain);
    }
    chain["then"] = resolved.then.bind(resolved);
    chain["catch"] = resolved.catch.bind(resolved);
    chain["finally"] = resolved.finally.bind(resolved);
    return chain;
  };

  const requestValues = Object.values(requestRows);

  return {
    // Track inserted decision rows so tests can assert on them.
    _decisions: decisions,
    _requests: requestRows,

    select: vi.fn().mockImplementation(() => makeSelectChain(requestValues)),

    insert: vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation((row: unknown) => {
        // Capture inserted decision or state update.
        decisions.push(row);
        return {
          returning: vi.fn().mockResolvedValue([{ id: "new-decision-uuid" }]),
        };
      }),
    })),

    update: vi.fn().mockImplementation(() => ({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    })),
  };
}

// A pending request row owned by the requester (different from the reviewer).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pendingRequest(overrides: Record<string, any> = {}) {
  return {
    id: "req-uuid-pending",
    requestNumber: "APR-0001",
    approvalType: "fifo_override",
    reason: "Override needed for urgent pick",
    status: "pending",
    expiryAt: FUTURE_EXPIRY,
    createdAt: new Date(),
    requesterUserId: "user-uuid-requester", // NOT the reviewer
    targetSnapshot: { item_id: "item-1", lot_id: "lot-1" },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// approveRequest — Authorization (R4.4, design.md §5/§6)
// ---------------------------------------------------------------------------

describe("approveRequest — authorization: missing fifo_override.approve (R4.4, design.md §4)", () => {
  it("(AC: fifo_override.approve required) returns { ok: false } when resolver lacks fifo_override.approve", async () => {
    const db = makeApprovalDb({ "req-1": pendingRequest() });

    const { deps } = mockRlsDeps(db);
    const result = await approveRequest(
      noApproveCapabilityResolver(),
      "req-uuid-pending",
      "Authorized override",
      deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error).toBe("string");
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it("(AC: authenticated required) returns { ok: false } when unauthenticated (no user ID)", async () => {
    const db = makeApprovalDb({ "req-1": pendingRequest() });

    const { deps } = mockRlsDeps(db);
    const result = await approveRequest(
      unauthenticatedResolver(),
      "req-uuid-pending",
      "Authorized override",
      deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// approveRequest — Not found (R7.5, design.md §6)
// ---------------------------------------------------------------------------

describe("approveRequest — not found (R7.5, design.md §6)", () => {
  it("(AC: not found returns error) returns { ok: false } when requestId does not exist in the DB", async () => {
    const db = makeApprovalDb({}); // empty — no rows

    const { deps } = mockRlsDeps(db);
    const result = await approveRequest(
      authorizedResolver(),
      "non-existent-uuid",
      "Approved",
      deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// approveRequest — State validation (R2.1, R2.2, design.md §5)
// ---------------------------------------------------------------------------

describe("approveRequest — invalid state transitions (R2.1, R2.2, design.md §5)", () => {
  it("(AC: terminal state blocks transition) returns { ok: false } when request status is already 'approved'", async () => {
    const db = makeApprovalDb({
      "req-1": pendingRequest({ status: "approved" }),
    });

    const { deps } = mockRlsDeps(db);
    const result = await approveRequest(
      authorizedResolver(),
      "req-uuid-pending",
      "Approved again",
      deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error).toBe("string");
    }
  });

  it("(AC: terminal state blocks transition) returns { ok: false } when request status is 'rejected'", async () => {
    const db = makeApprovalDb({
      "req-1": pendingRequest({ status: "rejected" }),
    });

    const { deps } = mockRlsDeps(db);
    const result = await approveRequest(
      authorizedResolver(),
      "req-uuid-pending",
      "Trying to approve a rejected request",
      deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// approveRequest — Expiry (R2.4, design.md §5)
// ---------------------------------------------------------------------------

describe("approveRequest — expiry check (R2.4, design.md §5)", () => {
  it("(AC: expired request cannot be approved) returns { ok: false } when expiryAt is in the past", async () => {
    const db = makeApprovalDb({
      "req-1": pendingRequest({ expiryAt: PAST_EXPIRY }),
    });

    const { deps } = mockRlsDeps(db);
    const result = await approveRequest(
      authorizedResolver(),
      "req-uuid-pending",
      "Trying to approve an expired request",
      deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// approveRequest — Self-approval (R4.5, design.md §5)
// ---------------------------------------------------------------------------

describe("approveRequest — self-approval blocked (R4.5, design.md §5)", () => {
  it("(AC: self-approval blocked) returns { ok: false } when reviewer's userId matches the request's requesterUserId", async () => {
    // The selfApprovalResolver returns userId = 'user-uuid-requester',
    // which is the same as the request's requesterUserId.
    const db = makeApprovalDb({
      "req-1": pendingRequest({ requesterUserId: "user-uuid-requester" }),
    });

    const { deps } = mockRlsDeps(db);
    const result = await approveRequest(
      selfApprovalResolver(),
      "req-uuid-pending",
      "Self-approving my own request",
      deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// approveRequest — Success (R4.1, R4.2, design.md §5)
// ---------------------------------------------------------------------------

describe("approveRequest — success (R4.1, R4.2, design.md §5)", () => {
  it("(AC: approve inserts decision and updates status) returns { ok: true } and inserts approval_decisions row with outcome='approved' and updates request status", async () => {
    const db = makeApprovalDb({
      "req-1": pendingRequest(),
    });

    const { deps } = mockRlsDeps(db);
    const result = await approveRequest(
      authorizedResolver(),
      "req-uuid-pending",
      "Approved after careful review",
      deps,
    );

    expect(result.ok).toBe(true);

    // A decision row must have been inserted.
    expect(db.insert).toHaveBeenCalled();

    // The update must have been called to flip status to 'approved'.
    expect(db.update).toHaveBeenCalled();

    // The inserted decision must record outcome='approved'.
    const insertedDecision = db._decisions[0] as Record<string, unknown>;
    expect(insertedDecision).toBeDefined();
    expect(insertedDecision["outcome"]).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// rejectRequest — Authorization (R4.4, design.md §4/§6)
// ---------------------------------------------------------------------------

describe("rejectRequest — authorization: missing fifo_override.approve (R4.4, design.md §4)", () => {
  it("(AC: fifo_override.approve required) returns { ok: false } when resolver lacks fifo_override.approve", async () => {
    const db = makeApprovalDb({ "req-1": pendingRequest() });

    const { deps } = mockRlsDeps(db);
    const result = await rejectRequest(
      noApproveCapabilityResolver(),
      "req-uuid-pending",
      "Should not be allowed",
      deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// rejectRequest — State validation (R2.2, design.md §5)
// ---------------------------------------------------------------------------

describe("rejectRequest — invalid state transitions (R2.2, design.md §5)", () => {
  it("(AC: terminal state blocks transition) returns { ok: false } when request is already 'rejected'", async () => {
    const db = makeApprovalDb({
      "req-1": pendingRequest({ status: "rejected" }),
    });

    const { deps } = mockRlsDeps(db);
    const result = await rejectRequest(
      authorizedResolver(),
      "req-uuid-pending",
      "Rejecting a rejected request",
      deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// rejectRequest — Expiry (R2.4, design.md §5)
// ---------------------------------------------------------------------------

describe("rejectRequest — expiry check (R2.4, design.md §5)", () => {
  it("(AC: expired request cannot be rejected) returns { ok: false } when request expiryAt is in the past", async () => {
    const db = makeApprovalDb({
      "req-1": pendingRequest({ expiryAt: PAST_EXPIRY }),
    });

    const { deps } = mockRlsDeps(db);
    const result = await rejectRequest(
      authorizedResolver(),
      "req-uuid-pending",
      "Trying to reject an expired request",
      deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// rejectRequest — Success (R4.1, R4.2, design.md §5)
// ---------------------------------------------------------------------------

describe("rejectRequest — success (R4.1, R4.2, design.md §5)", () => {
  it("(AC: reject inserts decision and updates status) returns { ok: true } on a valid pending request and inserts approval_decisions row with outcome='rejected'", async () => {
    const db = makeApprovalDb({
      "req-1": pendingRequest(),
    });

    const { deps } = mockRlsDeps(db);
    const result = await rejectRequest(
      authorizedResolver(),
      "req-uuid-pending",
      "Does not meet requirements",
      deps,
    );

    expect(result.ok).toBe(true);

    // A decision row must have been inserted.
    expect(db.insert).toHaveBeenCalled();

    // The update must have been called to flip status to 'rejected'.
    expect(db.update).toHaveBeenCalled();

    // The inserted decision must record outcome='rejected'.
    const insertedDecision = db._decisions[0] as Record<string, unknown>;
    expect(insertedDecision).toBeDefined();
    expect(insertedDecision["outcome"]).toBe("rejected");
  });
});

// ---------------------------------------------------------------------------
// rejectRequest — Not found (R7.5, design.md §6)
// ---------------------------------------------------------------------------

describe("rejectRequest — not found (R7.5, design.md §6)", () => {
  it("(AC: not found returns error) returns { ok: false } when requestId does not exist", async () => {
    const db = makeApprovalDb({}); // empty — no rows

    const { deps } = mockRlsDeps(db);
    const result = await rejectRequest(
      authorizedResolver(),
      "non-existent-uuid",
      "Rejected",
      deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error).toBe("string");
    }
  });
});

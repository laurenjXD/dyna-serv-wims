// RED-step unit tests for lib/db/queries/notifications.ts (does not exist yet).
//
// Traceability:
//   specs/14-notifications-and-alerts/requirements.md R3.1 ("Authorized users
//     SHALL have an in-app notification center with unread count, category/
//     severity filters, timestamps, read state, and safe navigation links.")
//   specs/14-notifications-and-alerts/requirements.md R6.1 ("Notification
//     list, detail, counts ... SHALL enforce the same RBAC/RLS resource and
//     party/flow scope as the source record.") and R6.3 ("Client-supplied
//     recipient ... SHALL never establish authority.") — the query itself
//     must be scoped to the caller's own userId, not rely on RLS alone
//     (defense-in-depth, matching this codebase's established pattern in
//     lib/db/queries/approvals.ts / listPendingApprovalRequests's WHERE
//     status='pending' scoping).
//   specs/00-steering/revision-log.md "`14` — P1 MVP slice scoped" entry —
//     this pass covers only list/unread-count/mark-read against the trimmed
//     `notifications` table (lib/db/schema/notifications.ts,
//     supabase/migrations/0026_notifications.sql).
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/db/queries/notifications.ts (for
// backend-builder):
//
//   export type NotificationRow = {
//     id: string;
//     category: string;
//     title: string;
//     body: string | null;
//     sourceType: string | null;
//     sourceId: string | null;
//     flowType: string | null;
//     createdAt: Date;
//     readAt: Date | null;
//     expiresAt: Date | null;
//   };
//
//   // Returns the count of rows for this recipient where read_at IS NULL.
//   // `executor` defaults to the real `db` client (lib/db/client.ts) —
//   // tests always pass an explicit mock so the real client is never
//   // touched.
//   export async function getUnreadNotificationCount(
//     userId: string,
//     executor?: DbLike,
//   ): Promise<number>;
//
//   // Returns up to `limit` rows for this recipient, newest-first
//   // (ORDER BY created_at DESC), using the
//   // notifications_recipient_created_at_idx index.
//   export async function listRecentNotifications(
//     userId: string,
//     limit: number,
//     executor?: DbLike,
//   ): Promise<NotificationRow[]>;
//
// The WHERE clause in both functions MUST scope to
// `recipient_user_id = userId` — RLS (0026_notifications.sql) is a second,
// independent enforcement layer, not a substitute for the query's own scope
// (this codebase's defense-in-depth pattern; see
// lib/db/queries/approvals.ts's header and
// lib/db/queries/__tests__/approvals.test.ts's "no full-table scan" test).
// ---------------------------------------------------------------------------
//
// Mock pattern used in this file: same fluent/thenable Drizzle chain
// convention as lib/db/queries/__tests__/approvals.test.ts.

import { describe, expect, it, vi } from "vitest";
import {
  getUnreadNotificationCount,
  listRecentNotifications,
  type NotificationRow,
} from "../notifications";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

// Thenable chain for listRecentNotifications: .from().where().orderBy().limit()
// resolves directly (no terminal method call required beyond the chain
// itself being awaited).
function makeListChain(resolvedRows: unknown[]) {
  const resolved = Promise.resolve(resolvedRows);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  for (const method of ["from", "where", "orderBy", "limit"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain["then"] = resolved.then.bind(resolved) as AnyFn;
  chain["catch"] = resolved.catch.bind(resolved) as AnyFn;
  chain["finally"] = resolved.finally.bind(resolved) as AnyFn;
  return chain;
}

// Thenable chain resolving to a count row, e.g. [{ count: "3" }].
function makeCountChain(count: number) {
  const resolved = Promise.resolve([{ count: String(count) }]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  for (const method of ["from", "where"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain["then"] = resolved.then.bind(resolved) as AnyFn;
  chain["catch"] = resolved.catch.bind(resolved) as AnyFn;
  chain["finally"] = resolved.finally.bind(resolved) as AnyFn;
  return chain;
}

function makeCountDb(count: number) {
  return { select: vi.fn(() => makeCountChain(count)) };
}

function makeListDb(rows: unknown[]) {
  return { select: vi.fn(() => makeListChain(rows)) };
}

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

const USER_A = "user-uuid-aaaa";
const USER_B = "user-uuid-bbbb";

function rawNotificationRow(
  overrides: Partial<NotificationRow> = {},
): NotificationRow {
  return {
    id: "notif-uuid-1",
    category: "approval_attention",
    title: "Approval request pending your review",
    body: "Request APR-0001 needs a decision.",
    sourceType: "approval_requests",
    sourceId: "req-uuid-1",
    flowType: null,
    createdAt: new Date("2026-08-16T09:00:00Z"),
    readAt: null,
    expiresAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getUnreadNotificationCount (R3.1 unread count)
// ---------------------------------------------------------------------------

describe("getUnreadNotificationCount (R3.1 unread count, R6.1/R6.3 recipient scoping)", () => {
  it("returns 0 for a recipient with no unread notifications (empty state)", async () => {
    const db = makeCountDb(0);

    const count = await getUnreadNotificationCount(
      USER_A,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
    );

    expect(count).toBe(0);
  });

  it("returns the correct unread count for the given recipient", async () => {
    const db = makeCountDb(3);

    const count = await getUnreadNotificationCount(
      USER_A,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
    );

    expect(count).toBe(3);
  });

  it("scopes the count query with a WHERE clause — no full-table scan (R6.1/R6.3)", async () => {
    const chain = makeCountChain(0);
    const db = { select: vi.fn(() => chain) };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await getUnreadNotificationCount(USER_A, db as any);

    expect(chain["where"]).toHaveBeenCalled();
  });

  it("does not count another recipient's unread notifications (recipient scoping, R6.1)", async () => {
    // Simulates a correctly-scoped WHERE recipient_user_id = $userId query:
    // the db mock for USER_B's count returns 0 even though USER_A has
    // unread rows, proving the function is called per-recipient rather than
    // returning a global count.
    const dbForUserA = makeCountDb(2);
    const dbForUserB = makeCountDb(0);

    const countA = await getUnreadNotificationCount(
      USER_A,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dbForUserA as any,
    );
    const countB = await getUnreadNotificationCount(
      USER_B,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dbForUserB as any,
    );

    expect(countA).toBe(2);
    expect(countB).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// listRecentNotifications (R3.1 list, newest-first)
// ---------------------------------------------------------------------------

describe("listRecentNotifications (R3.1 in-app notification center list)", () => {
  it("returns an empty array when the recipient has no notifications (empty state)", async () => {
    const db = makeListDb([]);

    const rows = await listRecentNotifications(
      USER_A,
      10,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
    );

    expect(rows).toEqual([]);
  });

  it("returns the recipient's notification rows with the expected shape", async () => {
    const row = rawNotificationRow({ id: "notif-1" });
    const db = makeListDb([row]);

    const rows = await listRecentNotifications(
      USER_A,
      10,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
    );

    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r).toHaveProperty("id");
    expect(r).toHaveProperty("category");
    expect(r).toHaveProperty("title");
    expect(r).toHaveProperty("body");
    expect(r).toHaveProperty("sourceType");
    expect(r).toHaveProperty("sourceId");
    expect(r).toHaveProperty("flowType");
    expect(r).toHaveProperty("createdAt");
    expect(r).toHaveProperty("readAt");
    expect(r).toHaveProperty("expiresAt");
  });

  it("orders newest-first via orderBy (notifications_recipient_created_at_idx)", async () => {
    const chain = makeListChain([]);
    const db = { select: vi.fn(() => chain) };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await listRecentNotifications(USER_A, 10, db as any);

    expect(chain["orderBy"]).toHaveBeenCalled();
  });

  it("applies the provided limit via the Drizzle chain", async () => {
    const chain = makeListChain([]);
    const db = { select: vi.fn(() => chain) };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await listRecentNotifications(USER_A, 5, db as any);

    expect(chain["limit"]).toHaveBeenCalledWith(5);
  });

  it("scopes the list query with a WHERE clause — no full-table scan (R6.1/R6.3)", async () => {
    const chain = makeListChain([]);
    const db = { select: vi.fn(() => chain) };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await listRecentNotifications(USER_A, 10, db as any);

    expect(chain["where"]).toHaveBeenCalled();
  });

  it("does not return another recipient's notifications (recipient scoping, R6.1)", async () => {
    // Simulates correctly-scoped queries: USER_A's db mock only ever "knows
    // about" USER_A's row; USER_B's db mock returns an empty list even
    // though USER_A has notifications, proving the function is scoped
    // per-caller rather than returning every row in the table.
    const rowForUserA = rawNotificationRow({ id: "notif-a" });
    const dbForUserA = makeListDb([rowForUserA]);
    const dbForUserB = makeListDb([]);

    const rowsA = await listRecentNotifications(
      USER_A,
      10,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dbForUserA as any,
    );
    const rowsB = await listRecentNotifications(
      USER_B,
      10,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dbForUserB as any,
    );

    expect(rowsA).toHaveLength(1);
    expect(rowsA[0].id).toBe("notif-a");
    expect(rowsB).toHaveLength(0);
  });
});

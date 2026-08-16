// RED-step unit tests for lib/actions/notifications.ts (does not exist yet).
//
// Traceability:
//   specs/14-notifications-and-alerts/requirements.md R3.1 ("... read
//     state ...") and R2's "read" lifecycle state, R6.1 ("Notification list,
//     detail, counts ... SHALL enforce the same RBAC/RLS resource and party/
//     flow scope as the source record."), R6.3 ("Client-supplied recipient,
//     category, severity, source ID, or target URL SHALL never establish
//     authority.") — mark-read is scoped to the caller's own row by RLS
//     (0026_notifications.sql: recipient_user_id = auth.uid()), so a bad/
//     foreign notificationId simply matches zero rows rather than needing an
//     application-layer ownership check.
//   specs/14-notifications-and-alerts/requirements.md R2.1 (delivery/
//     presentation lifecycle distinguishes "read" from other states; "read"
//     SHALL not mean "approved" or "completed" — this action only sets
//     read_at, nothing else).
//   specs/00-steering/revision-log.md "`14` — P1 MVP slice scoped" entry.
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/actions/notifications.ts (for
// backend-builder):
//
//   "use server";
//
//   export type NotificationActionResult =
//     | { ok: true }
//     | { ok: false; error: string };
//
//   // Sets read_at = now() for the given notification, scoped to the
//   // caller's own session via withRlsTransaction (lib/db/rls-transaction.ts)
//   // — mirrors lib/actions/approvals.ts's `rlsDeps` trailing-parameter DI
//   // convention so tests can inject a mock pool/connection instead of a
//   // real Postgres connection. No RBAC capability check is required beyond
//   // authentication: RLS's `recipient_user_id = auth.uid()` policy is the
//   // authorization boundary (per design note above), matching the "own row
//   // only, RLS enforces" scoping decision for this MVP slice.
//   export async function markNotificationReadAction(
//     notificationId: string,
//     rlsDeps?: RlsTransactionDeps,
//   ): Promise<NotificationActionResult>;
//
// ---------------------------------------------------------------------------
// Mocking pattern: same DI approach as lib/actions/__tests__/approvals.test.ts
// — inject RlsTransactionDeps via lib/db/__tests__/helpers/mock-rls.ts's
// `mockRlsDeps(mockDb, session)` helper rather than hitting a real pool.

import { describe, expect, it, vi } from "vitest";
import { markNotificationReadAction } from "../notifications";
import { mockRlsDeps } from "@/lib/db/__tests__/helpers/mock-rls";

// ---------------------------------------------------------------------------
// DB mock helpers
// ---------------------------------------------------------------------------

function makeNotificationDb() {
  return {
    update: vi.fn().mockImplementation(() => ({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    })),
  };
}

// ---------------------------------------------------------------------------
// markNotificationReadAction — authentication (R6.1/R6.3)
// ---------------------------------------------------------------------------

describe("markNotificationReadAction — authentication required (R6.1, R6.3)", () => {
  it("(AC: unauthenticated caller cannot mark a notification read) returns { ok: false } when there is no authenticated session", async () => {
    const db = makeNotificationDb();
    const { deps } = mockRlsDeps(db, null);

    const result = await markNotificationReadAction(
      "notif-uuid-1",
      deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error).toBe("string");
      expect(result.error.length).toBeGreaterThan(0);
    }
    // No DB write should have been attempted for an unauthenticated caller.
    expect(db.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// markNotificationReadAction — success (R3.1 read state, R2.1)
// ---------------------------------------------------------------------------

describe("markNotificationReadAction — success (R3.1 read state)", () => {
  it("(AC: mark-read updates read_at) returns { ok: true } and issues an UPDATE against the notifications table for an authenticated caller", async () => {
    const db = makeNotificationDb();
    const { deps } = mockRlsDeps(db);

    const result = await markNotificationReadAction(
      "notif-uuid-1",
      deps,
    );

    expect(result.ok).toBe(true);
    expect(db.update).toHaveBeenCalled();
  });

  it("(AC: caller cannot affect another recipient's row by ID guessing) runs the UPDATE under the caller's own RLS-bound transaction, not a bypassing connection", async () => {
    // This test asserts the *mechanism*, not the SQL predicate: the action
    // must route its write through withRlsTransaction (via the injected
    // rlsDeps) so that Postgres RLS — not application logic — is the actual
    // enforcement boundary for "own row only." A bad/foreign notificationId
    // is expected to match zero rows at the database layer (RLS), not to be
    // rejected by an application-side ownership check this action doesn't
    // (and per the scoping decision, shouldn't) perform.
    const db = makeNotificationDb();
    const { deps, conn } = mockRlsDeps(db);

    await markNotificationReadAction("notif-uuid-does-not-belong-to-caller", deps);

    // withRlsTransaction's pool.connect()/begin()/commit() sequence must
    // actually have been exercised — proving this action didn't run the
    // UPDATE against some other, non-RLS-bound connection.
    expect(conn.begin).toHaveBeenCalled();
    expect(conn.commit).toHaveBeenCalled();
  });
});

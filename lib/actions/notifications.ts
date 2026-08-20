"use server";
// Notification server actions — mark-read.
//
// Traceability:
//   specs/14-notifications-and-alerts/requirements.md R3.1 ("... read
//     state ..."), R2.1 (delivery/presentation lifecycle — "read" is
//     distinct from "approved"/"completed"; this action only sets read_at,
//     nothing else), R6.1/R6.3 (RLS's recipient_user_id = auth.uid() policy
//     is the authorization boundary — a bad/foreign notificationId simply
//     matches zero rows rather than needing an application-layer ownership
//     check).
//   specs/00-steering/revision-log.md "`14` — P1 MVP slice scoped" entry.
//
// Mirrors lib/actions/approvals.ts's withRlsTransaction + DI convention: the
// write runs through the caller's own RLS-bound transaction so Postgres RLS
// — not application logic — enforces "own row only."

import { eq } from "drizzle-orm";
import { notifications } from "@/lib/db/schema/notifications";
import { withRlsTransaction } from "@/lib/db/rls-transaction";
import type { RlsTransactionDeps } from "@/lib/db/rls-transaction";
import { rlsPool } from "@/lib/db/rls-pool";
import { getAuthenticatedSession } from "@/lib/auth/get-authenticated-session";

const defaultRlsDeps: RlsTransactionDeps = {
  getAuthenticatedSession,
  pool: rlsPool,
};

// Minimal structural type that both the real Drizzle db instance and test
// stubs satisfy.
/* eslint-disable @typescript-eslint/no-explicit-any */
type DbLike = {
  update: (...args: any[]) => any;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type NotificationActionResult =
  | { ok: true }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// markNotificationReadAction
// ---------------------------------------------------------------------------

/**
 * Sets read_at = now() for the given notification, scoped to the caller's
 * own session via withRlsTransaction. RLS's recipient_user_id = auth.uid()
 * policy is the authorization boundary — no additional ownership check is
 * performed here.
 */
export async function markNotificationReadAction(
  notificationId: string,
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<NotificationActionResult> {
  const rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;

    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(eq(notifications.id, notificationId));

    return { ok: true } as const;
  });

  if (rlsResult.kind === "unauthenticated") {
    return { ok: false, error: "Forbidden" };
  }
  return rlsResult.value;
}

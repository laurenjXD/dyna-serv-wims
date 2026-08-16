// Notification query helpers.
//
// Traceability:
//   specs/14-notifications-and-alerts/requirements.md R3.1 (in-app
//     notification center: unread count, list, timestamps, read state),
//     R6.1/R6.3 (recipient scoping — client-supplied recipient never
//     establishes authority; the query itself scopes to the caller's own
//     userId in the WHERE clause).
//   specs/00-steering/revision-log.md "`14` — P1 MVP slice scoped" entry.
//
// `db` defaults to the real client (lib/db/client.ts), a plain connection
// that never calls set_config('request.jwt.claims', ...) — so auth.uid()
// is not populated and RLS is not actually live on this read path. The
// server-derived `userId` in the WHERE clause below is the real
// enforcement here, matching lib/db/queries/approvals.ts:76-78's
// "authorization is enforced at the call site... not re-checked here"
// pattern. RLS only becomes live for notifications once a write is routed
// through withRlsTransaction (lib/db/rls-transaction.ts), as
// lib/actions/notifications.ts's markNotificationReadAction does.

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db/client";
import { notifications } from "@/lib/db/schema/notifications";

// Minimal structural type that both the real Drizzle db instance and test
// stubs satisfy.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbLike = { select: (...args: any[]) => any };

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type NotificationRow = {
  id: string;
  category: string;
  title: string;
  body: string | null;
  sourceType: string | null;
  sourceId: string | null;
  flowType: string | null;
  createdAt: Date;
  readAt: Date | null;
  expiresAt: Date | null;
};

// ---------------------------------------------------------------------------
// getUnreadNotificationCount
// ---------------------------------------------------------------------------

/**
 * Returns the count of notifications for this recipient where read_at IS
 * NULL. Scoped to `recipientUserId` in the WHERE clause, which is the
 * actual enforcement for this read — it runs through `defaultDb`
 * (no RLS claims set), so 0026_notifications.sql's RLS policy is not live
 * on this path.
 */
export async function getUnreadNotificationCount(
  userId: string,
  executor: DbLike = defaultDb,
): Promise<number> {
  const [countRow] = await executor
    .select({ count: sql<string>`count(*)` })
    .from(notifications)
    .where(
      and(
        eq(notifications.recipientUserId, userId),
        isNull(notifications.readAt),
      ),
    );

  return Number(countRow.count);
}

// ---------------------------------------------------------------------------
// listRecentNotifications
// ---------------------------------------------------------------------------

/**
 * Returns up to `limit` notification rows for this recipient, newest-first
 * (ORDER BY created_at DESC), using the
 * notifications_recipient_created_at_idx index. Scoped to `recipientUserId`
 * in the WHERE clause, which is the actual enforcement for this read — it
 * runs through `defaultDb` (no RLS claims set), so RLS is not live here.
 */
export async function listRecentNotifications(
  userId: string,
  limit: number,
  executor: DbLike = defaultDb,
): Promise<NotificationRow[]> {
  const rows: NotificationRow[] = await executor
    .select({
      id: notifications.id,
      category: notifications.category,
      title: notifications.title,
      body: notifications.body,
      sourceType: notifications.sourceType,
      sourceId: notifications.sourceId,
      flowType: notifications.flowType,
      createdAt: notifications.createdAt,
      readAt: notifications.readAt,
      expiresAt: notifications.expiresAt,
    })
    .from(notifications)
    .where(eq(notifications.recipientUserId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);

  return rows;
}

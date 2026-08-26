"use server";

// Server Action backing the authenticated shell's authorization resolution.
//
// Why this exists as a Server Action rather than a plain function built and
// passed from app/(authenticated)/layout.tsx: `RequestAuthorizationResolver`
// (lib/rbac/session.ts) is a `{ getContext(): Promise<...> }` object whose
// method is a real closure — a plain function reference cannot cross the
// Server Component -> Client Component boundary (AuthenticatedShellBoundary
// is a Client Component per its own test contract). A Server Action
// reference is the one function shape Next.js can serialize across that
// boundary, so it is the correct mechanism here, not a workaround.
//
// FORMER SEAM GAP, CLOSED (2026-08-08): this file used to construct its own
// resolver with `loadAuthorizationRecord` hardcoded to return `null` —
// meaning every session, however genuinely authenticated, resolved to
// forbidden. Meanwhile `lib/auth/page-resolver.ts`'s `createPageResolver()`
// already had a complete, real implementation of the exact same query
// (user_profiles -> user_roles -> roles -> role_permissions -> permissions,
// plus active user_party_scopes), already in production use by every other
// authenticated route (`/settings`, `/profile`, `/master-data`, `/receiving`,
// etc.) — just never wired into the one resolver gating the shell itself.
// Fixed by delegating to that existing resolver instead of maintaining a
// second, divergent implementation of the same query.
import { createPageResolver } from "@/lib/auth/page-resolver";
import { db } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";
import { listPendingApprovalRequests } from "@/lib/db/queries/approvals";
import type { AuthorizationResolution } from "@/lib/rbac/session";
import type { NotificationRow } from "@/lib/db/queries/notifications";
import { redirect } from "next/navigation";

export async function resolveShellAuthorization(): Promise<AuthorizationResolution> {
  const resolver = await createPageResolver();
  return resolver.getContext();
}

export async function resolveShellPendingApprovalCount(): Promise<number> {
  const resolver = await createPageResolver();
  const permission = await requirePermission(resolver, "fifo_override.approve");
  if (permission.kind !== "authorized") return 0;
  return (await listPendingApprovalRequests(db, { limit: 1, offset: 0 })).total;
}

// Backs the sidebar/tab-bar identity card (real display name + role label
// instead of a hardcoded "Admin User" placeholder). Deliberately reuses the
// same resolver as resolveShellAuthorization rather than adding a second
// user_profiles query path — this call is cheap (one resolver instance is
// memoized per request) and keeps display name and role derivation from
// ever disagreeing with the actual authorization context.
export async function resolveShellUserDisplay(): Promise<{
  displayName: string | null;
  email: string | null;
  activeRoleKeys: string[];
  organizationScope: string | null;
}> {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email ?? null;

  const resolver = await createPageResolver();
  const resolution = await resolver.getContext();
  if (resolution.kind !== "authorized") {
    return { displayName: null, email, activeRoleKeys: [], organizationScope: null };
  }
  const { userProfiles, parties } = await import("@/lib/db/schema");
  const { db } = await import("@/lib/db/client");
  const { eq, inArray } = await import("drizzle-orm");
  const rows = await db
    .select({ displayName: userProfiles.displayName })
    .from(userProfiles)
    .where(eq(userProfiles.id, resolution.context.userId))
    .limit(1);

  let organizationScope: string | null = null;
  const partyIds = resolution.context.partyScopes.map((scope) => scope.partyId);
  if (partyIds.length > 0) {
    const partyRows = await db
      .select({ id: parties.id, name: parties.name })
      .from(parties)
      .where(inArray(parties.id, partyIds));
    organizationScope = partyRows.map((row) => row.name).join(", ") || null;
  }

  return {
    displayName: rows[0]?.displayName ?? null,
    email,
    activeRoleKeys: resolution.context.activeRoleKeys,
    organizationScope,
  };
}

// Signs the current session out and redirects to /login. Called directly
// from the AccountControl's Sign Out button in ShellChrome.
export async function signOutAction(): Promise<void> {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// Client-facing shape of a notification row: Server Actions serialize `Date`
// fields to ISO strings when crossing the Server -> Client Component
// boundary, so the resolved shape ShellChrome actually receives has string
// timestamps, not `Date` instances (unlike the raw NotificationRow query
// result). Only `id`, `title`, and `createdAt` are required -- the bell
// dropdown only ever reads those three fields; the remaining query columns
// are carried through as optional so callers (and tests) aren't forced to
// populate fields the UI doesn't consume.
export type ShellNotification = Pick<NotificationRow, "id" | "title"> & {
  createdAt: string;
  category?: NotificationRow["category"];
  body?: NotificationRow["body"];
  sourceType?: NotificationRow["sourceType"];
  sourceId?: NotificationRow["sourceId"];
  flowType?: NotificationRow["flowType"];
  readAt?: string | null;
  expiresAt?: string | null;
};

// Backs the shared shell header's notification bell (specs/14-notifications-
// and-alerts P1 MVP slice). Mirrors resolveShellUserDisplay's pattern: same
// createPageResolver() resolution, same early-return-on-unauthorized shape.
// Resolves the current session's unread count and 5 most recent
// notifications — the bell dropdown's realistic scope, not the full
// notification center list view.
export async function resolveShellNotifications(): Promise<{
  unreadCount: number;
  notifications: ShellNotification[];
}> {
  const resolver = await createPageResolver();
  const resolution = await resolver.getContext();
  if (resolution.kind !== "authorized") {
    return { unreadCount: 0, notifications: [] };
  }

  const { getUnreadNotificationCount, listRecentNotifications } = await import(
    "@/lib/db/queries/notifications"
  );

  const [unreadCount, rows] = await Promise.all([
    getUnreadNotificationCount(resolution.context.userId),
    listRecentNotifications(resolution.context.userId, 5),
  ]);

  const notifications: ShellNotification[] = rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt ? row.readAt.toISOString() : null,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
  }));

  return { unreadCount, notifications };
}

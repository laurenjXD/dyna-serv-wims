"use server";

// Server Actions backing `/settings/team` — specs/21-user-profile-and-settings
// Tasks 21.6/21.7/21.8, built against `02-rbac-roles`' real schema
// (lib/db/schema/rbac.ts) and capability catalog (design.md §3.2's `users`
// resource: `read`, `invite`, `activate`, `deactivate`, default role
// `administrator`).
//
// Every mutating action here re-checks `requirePermission()` itself (never
// trusts that RouteGuard/the settings layout already gated the request) —
// same defense-in-depth requirement `02` design.md §8 states for every
// privileged operation ("a privileged function that only performed its side
// effects without its own authorization check would be a bypass path").
//
// KNOWN SEAM GAPS (flag for integration-reviewer and rbac-rls-reviewer —
// these are real, not silently faked, but they are a pragmatic v1 direct
// implementation, not `02` §8's fully-specified controlled
// SECURITY DEFINER/service-layer function):
// 1. `02` §8.1's invitation flow calls for IP/normalized-email rate limits
//    and idempotent retry/reconciliation between the Supabase Auth
//    invitation call and the `user_profiles` insert (they are not one
//    transaction). Not implemented here — `inviteUser` below is a
//    best-effort direct sequence, not idempotent against partial failure.
// 2. `02` §8.5's last-administrator invariant (a `pg_advisory_xact_lock`
//    guarding against concurrently deactivating/revoking the final active
//    administrator) is NOT implemented in `suspendUser` below. This is a
//    real gap, not a cosmetic one — flagging explicitly rather than
//    silently shipping an unguarded deactivation path.
// 3. `roles`/`role_permissions` seed data (02 design.md §3.1/§3.2) is
//    migration-owned and may not exist in every environment yet; role
//    lookups here fail closed (a clear error, not a silent no-op) when a
//    role key has no matching `roles` row.

import { eq, isNull, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  userProfiles,
  userRoles,
  roles,
  userPartyScopes,
  parties,
  rbacSecurityEvents,
} from "@/lib/db/schema";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/guard";
import type { RequestAuthorizationResolver } from "@/lib/rbac/session";
import { resolveShellAuthorization } from "@/app/(authenticated)/actions";
import { inviteUserSchema, suspendUserSchema, type InviteUserInput } from "@/lib/user-settings/schemas";

// Reuses the single canonical shell-authorization resolution
// (app/(authenticated)/actions.ts) rather than re-deriving a second
// getAuthenticatedSession/loadAuthorizationRecord pair — see that file's
// own KNOWN SEAM GAP note (loadAuthorizationRecord currently always
// resolves `null`, so every capability check below currently fails closed
// to "forbidden" until 02's DB-backed lookup is wired in there).
const resolver: RequestAuthorizationResolver = { getContext: resolveShellAuthorization };

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function requireUsersCapability(action: "read" | "invite" | "activate" | "deactivate") {
  return requirePermission(resolver, `users.${action}`);
}

export interface TeamMember {
  id: string;
  email: string | null;
  displayName: string;
  status: string;
  roleKeys: string[];
  partyNames: string[];
  lastSignInAt: string | null;
}

export async function listTeamMembers(): Promise<ActionResult<TeamMember[]>> {
  const permission = await requireUsersCapability("read");
  if (permission.kind !== "authorized") {
    return { ok: false, error: "You don't have access to view team members." };
  }

  const [profiles, activeRoleRows, activeScopeRows] = await Promise.all([
    db.select({ id: userProfiles.id, displayName: userProfiles.displayName, status: userProfiles.status }).from(userProfiles),
    db
      .select({ userId: userRoles.userId, roleKey: roles.key })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(isNull(userRoles.revokedAt)),
    db
      .select({ userId: userPartyScopes.userId, partyName: parties.name })
      .from(userPartyScopes)
      .innerJoin(parties, eq(userPartyScopes.partyId, parties.id))
      .where(isNull(userPartyScopes.revokedAt)),
  ]);

  // Email/last-sign-in live in Supabase Auth (`auth.users`), not the
  // application `user_profiles` table — fetched via the Admin API using the
  // service-role client, never exposed to the browser.
  const serviceClient = createServiceRoleClient();
  const { data: authUsers } = await serviceClient.auth.admin.listUsers();
  const authById = new Map((authUsers?.users ?? []).map((u) => [u.id, u]));

  const members: TeamMember[] = profiles.map((profile) => ({
    id: profile.id,
    displayName: profile.displayName,
    status: profile.status,
    email: authById.get(profile.id)?.email ?? null,
    lastSignInAt: authById.get(profile.id)?.last_sign_in_at ?? null,
    roleKeys: activeRoleRows.filter((r) => r.userId === profile.id).map((r) => r.roleKey),
    partyNames: activeScopeRows.filter((s) => s.userId === profile.id).map((s) => s.partyName),
  }));

  return { ok: true, data: members };
}

export interface ActivePartyOption {
  id: string;
  name: string;
}

export async function listActiveParties(): Promise<ActionResult<ActivePartyOption[]>> {
  const permission = await requireUsersCapability("read");
  if (permission.kind !== "authorized") {
    return { ok: false, error: "You don't have access to view parties." };
  }

  const rows = await db
    .select({ id: parties.id, name: parties.name })
    .from(parties)
    .where(eq(parties.isActive, true))
    .orderBy(parties.name);

  return { ok: true, data: rows };
}

export async function inviteUser(input: InviteUserInput): Promise<ActionResult> {
  const parsed = inviteUserSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid invitation" };
  }

  const permission = await requireUsersCapability("invite");
  if (permission.kind !== "authorized") {
    return { ok: false, error: "You don't have permission to invite users." };
  }
  const actorId = permission.context.userId;

  const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, parsed.data.role)).limit(1);
  if (!role) {
    return { ok: false, error: `Role "${parsed.data.role}" is not seeded in this environment.` };
  }

  const serviceClient = createServiceRoleClient();
  const { data: invited, error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(
    parsed.data.email,
  );
  if (inviteError || !invited?.user) {
    return { ok: false, error: inviteError?.message ?? "Failed to send invitation." };
  }

  const invitedUserId = invited.user.id;

  await db
    .insert(userProfiles)
    .values({ id: invitedUserId, displayName: parsed.data.displayName, status: "invited" })
    .onConflictDoUpdate({
      target: userProfiles.id,
      set: { displayName: parsed.data.displayName },
    });

  await db.insert(userRoles).values({
    userId: invitedUserId,
    roleId: role.id,
    grantedByUserId: actorId,
    grantReason: "Initial invitation role assignment",
  });

  if (parsed.data.role === "party_user" && parsed.data.partyId) {
    await db.insert(userPartyScopes).values({
      userId: invitedUserId,
      partyId: parsed.data.partyId,
      grantedByUserId: actorId,
      grantReason: "Initial invitation party scope",
    });
  }

  await db.insert(rbacSecurityEvents).values({
    eventType: "user_invited",
    actorUserId: actorId,
    executorType: "user",
    targetType: "user_profiles",
    targetId: invitedUserId,
    details: { role: parsed.data.role, partyId: parsed.data.partyId ?? null },
  });

  return { ok: true, data: undefined };
}

export async function suspendUser(input: { userId: string; reason: string }): Promise<ActionResult> {
  const parsed = suspendUserSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request" };
  }

  const permission = await requireUsersCapability("deactivate");
  if (permission.kind !== "authorized") {
    return { ok: false, error: "You don't have permission to suspend users." };
  }
  const actorId = permission.context.userId;

  // §8.5's last-administrator invariant lock is NOT applied here — see this
  // file's header seam-gap note 2.
  await db
    .update(userProfiles)
    .set({
      status: "inactive",
      deactivatedAt: new Date(),
      deactivatedByUserId: actorId,
      deactivationReason: parsed.data.reason,
      updatedAt: new Date(),
    })
    .where(and(eq(userProfiles.id, parsed.data.userId), isNull(userProfiles.deactivatedAt)));

  await db.insert(rbacSecurityEvents).values({
    eventType: "user_deactivated",
    actorUserId: actorId,
    executorType: "user",
    targetType: "user_profiles",
    targetId: parsed.data.userId,
    reason: parsed.data.reason,
  });

  // §8.4 step 5 — revoking the user's live Supabase Auth sessions through
  // the Admin API, so denial is not only a next-request DB check.
  const serviceClient = createServiceRoleClient();
  await serviceClient.auth.admin.signOut(parsed.data.userId, "global").catch(() => {
    // Best-effort: DB authorization already stops on the next protected
    // request even if this external session revocation call fails (02
    // design.md §8.4's own stated fallback).
  });

  return { ok: true, data: undefined };
}

export async function reactivateUser(userId: string): Promise<ActionResult> {
  const permission = await requireUsersCapability("activate");
  if (permission.kind !== "authorized") {
    return { ok: false, error: "You don't have permission to reactivate users." };
  }
  const actorId = permission.context.userId;

  await db
    .update(userProfiles)
    .set({
      status: "active",
      activatedAt: new Date(),
      activatedByUserId: actorId,
      deactivatedAt: null,
      deactivatedByUserId: null,
      deactivationReason: null,
      updatedAt: new Date(),
    })
    .where(eq(userProfiles.id, userId));

  await db.insert(rbacSecurityEvents).values({
    eventType: "user_activated",
    actorUserId: actorId,
    executorType: "user",
    targetType: "user_profiles",
    targetId: userId,
  });

  return { ok: true, data: undefined };
}

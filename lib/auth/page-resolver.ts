// Server-only: creates a RequestAuthorizationResolver from the Supabase SSR
// session and the RBAC tables for use in Server Components and Server Actions.
//
// One resolver instance = one request's memoization boundary (session.ts §6.4).
// Each Server Component or Server Action that needs auth creates its own
// instance via this factory; it never returns a module-level singleton.
//
// Traceability:
//   specs/02-rbac-roles/design.md §6.1 (server request flow), §6.4 (memoization)
//   lib/rbac/session.ts — createRequestAuthorizationResolver
//   lib/supabase/server.ts — createClient (SSR-safe)

import { and, eq, gt, isNull, lte, or } from "drizzle-orm";
import { createRequestAuthorizationResolver } from "@/lib/rbac/session";
import type { RawAuthorizationRecord } from "@/lib/rbac/session";
import { getAuthenticatedSession } from "@/lib/auth/get-authenticated-session";
import { db } from "@/lib/db/client";
import { createClient } from "@/lib/supabase/server";
import {
  userProfiles,
  userRoles,
  roles,
  rolePermissions,
  permissions,
  userPartyScopes,
} from "@/lib/db/schema";

async function loadAuthorizationRecordViaSupabase(
  userId: string,
): Promise<RawAuthorizationRecord | null> {
  const supabase = await createClient();
  const now = new Date().toISOString();

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("status")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) return null;

  const { data: assignments, error: assignmentError } = await supabase
    .from("user_roles")
    .select("role_id")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .lte("valid_from", now)
    .or(`valid_until.is.null,valid_until.gt.${now}`);
  if (assignmentError) throw assignmentError;

  const roleIds = [...new Set((assignments ?? []).map((row) => row.role_id))];
  if (roleIds.length === 0) {
    return { profileStatus: profile.status, activeRoleKeys: [], grants: [], partyScopes: [] };
  }

  const [{ data: activeRoles, error: roleError }, { data: scopeRows, error: scopeError }] = await Promise.all([
    supabase.from("roles").select("id,key").in("id", roleIds).eq("is_active", true),
    supabase
      .from("user_party_scopes")
      .select("party_id,flow_type")
      .eq("user_id", userId)
      .is("revoked_at", null)
      .lte("valid_from", now)
      .or(`valid_until.is.null,valid_until.gt.${now}`),
  ]);
  if (roleError) throw roleError;
  if (scopeError) throw scopeError;

  const rolesById = new Map((activeRoles ?? []).map((role) => [role.id, role.key]));
  const activeRoleIds = [...rolesById.keys()];
  if (activeRoleIds.length === 0) {
    return { profileStatus: profile.status, activeRoleKeys: [], grants: [], partyScopes: (scopeRows ?? []).map((scope) => ({ partyId: scope.party_id, flowType: scope.flow_type ?? null })) };
  }

  const { data: permissionLinks, error: permissionLinkError } = await supabase
    .from("role_permissions")
    .select("role_id,permission_id,scope_kind")
    .in("role_id", activeRoleIds);
  if (permissionLinkError) throw permissionLinkError;

  const permissionIds = [...new Set((permissionLinks ?? []).map((link) => link.permission_id))];
  const { data: activePermissions, error: permissionError } = permissionIds.length > 0
    ? await supabase.from("permissions").select("id,resource,action").in("id", permissionIds).eq("is_active", true)
    : { data: [], error: null };
  if (permissionError) throw permissionError;
  const permissionsById = new Map((activePermissions ?? []).map((permission) => [permission.id, permission]));

  return {
    profileStatus: profile.status,
    activeRoleKeys: [...rolesById.values()],
    grants: (permissionLinks ?? []).flatMap((link) => {
      const permission = permissionsById.get(link.permission_id);
      return permission ? [{ resource: permission.resource, action: permission.action, scopeKind: link.scope_kind as "global" | "assigned_party" }] : [];
    }),
    partyScopes: (scopeRows ?? []).map((scope) => ({ partyId: scope.party_id, flowType: scope.flow_type ?? null })),
  };
}

export async function createPageResolver() {
  return createRequestAuthorizationResolver({
    getAuthenticatedSession,

    async loadAuthorizationRecord(
      userId: string,
    ): Promise<RawAuthorizationRecord | null> {
      try {
      // Check user profile exists and is active
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const queryPromise = db
        .select({ status: userProfiles.status })
        .from(userProfiles)
        .where(eq(userProfiles.id, userId))
        .limit(1);
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Database profile query timed out")), 2500);
      });

      const profileRows = await Promise.race([queryPromise, timeoutPromise]).finally(() => {
        if (timeoutId) clearTimeout(timeoutId);
      });

      const profile = profileRows[0];
      if (!profile) return null;

      // Load grants: user_roles → roles → role_permissions → permissions
      const grantRows = await db
        .select({
          roleKey: roles.key,
          resource: permissions.resource,
          action: permissions.action,
          scopeKind: rolePermissions.scopeKind,
        })
        .from(userRoles)
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
        .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
        .where(
          and(
            eq(userRoles.userId, userId),
            isNull(userRoles.revokedAt),
            lte(userRoles.validFrom, new Date()),
            or(isNull(userRoles.validUntil), gt(userRoles.validUntil, new Date())),
            eq(roles.isActive, true),
            eq(permissions.isActive, true),
          ),
        );

      // Load party scopes (active assignments only)
      const scopeRows = await db
        .select({
          partyId: userPartyScopes.partyId,
          flowType: userPartyScopes.flowType,
        })
        .from(userPartyScopes)
        .where(
          and(
            eq(userPartyScopes.userId, userId),
            isNull(userPartyScopes.revokedAt),
            lte(userPartyScopes.validFrom, new Date()),
            or(isNull(userPartyScopes.validUntil), gt(userPartyScopes.validUntil, new Date())),
          ),
        );

      const activeRoleKeys = [...new Set(grantRows.map((r) => r.roleKey))];

      const grants = grantRows.map((r) => ({
        resource: r.resource,
        action: r.action,
        scopeKind: r.scopeKind as "global" | "assigned_party",
      }));

      return {
        profileStatus: profile.status,
        activeRoleKeys,
        grants,
        partyScopes: scopeRows.map((s) => ({
          partyId: s.partyId,
          flowType: s.flowType ?? null,
        })),
      };
      } catch (databaseError) {
        // A Vercel deployment can authenticate through Supabase while its
        // direct Postgres runtime URL is absent. This fallback still uses the
        // current user's verified JWT and database RLS policies; it never
        // trusts browser-supplied role data.
        try {
          return await loadAuthorizationRecordViaSupabase(userId);
        } catch (supabaseError) {
          console.error("[auth/page-resolver] both authorization sources failed", {
            databaseError,
            supabaseError,
          });
          throw supabaseError;
        }
      }
    },
  });
}

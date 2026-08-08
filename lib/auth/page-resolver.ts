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
import { createClient } from "@/lib/supabase/server";
import { createRequestAuthorizationResolver } from "@/lib/rbac/session";
import type { RawAuthorizationRecord } from "@/lib/rbac/session";
import { db } from "@/lib/db/client";
import {
  userProfiles,
  userRoles,
  roles,
  rolePermissions,
  permissions,
  userPartyScopes,
} from "@/lib/db/schema";

export async function createPageResolver() {
  const supabase = await createClient();

  return createRequestAuthorizationResolver({
    async getAuthenticatedSession() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      return { userId: user.id };
    },

    async loadAuthorizationRecord(
      userId: string,
    ): Promise<RawAuthorizationRecord | null> {
      // Check user profile exists and is active
      const profileRows = await db
        .select({ status: userProfiles.status })
        .from(userProfiles)
        .where(eq(userProfiles.id, userId))
        .limit(1);

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
    },
  });
}

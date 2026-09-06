import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { db } from '../lib/db/client.js';
import { userProfiles, userRoles, roles, rolePermissions, permissions, userPartyScopes } from '../lib/db/schema/index.js';
import { eq, and, isNull, lte, or, gt } from 'drizzle-orm';
import { createRequestAuthorizationResolver } from '../lib/rbac/session.js';
import { requirePermission } from '../lib/rbac/guard.js';

async function main() {
  const adminEmail = 'admin@dyna-serv.com';
  console.log('Checking auth resolution for:', adminEmail);

  const [profile] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.id, 'a03a0722-a321-42ac-8ee4-7abfba4349a6'));

  console.log('Profile found:', profile);

  const resolver = createRequestAuthorizationResolver({
    getAuthenticatedSession: async () => ({ userId: 'a03a0722-a321-42ac-8ee4-7abfba4349a6' }),
    async loadAuthorizationRecord(userId) {
      const profileRows = await db
        .select({ status: userProfiles.status })
        .from(userProfiles)
        .where(eq(userProfiles.id, userId))
        .limit(1);

      const profile = profileRows[0];
      if (!profile) return null;

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
        scopeKind: r.scopeKind,
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

  const ctx = await resolver.getContext();
  console.log('Context resolution kind:', ctx.kind);
  if (ctx.kind === 'authorized') {
    console.log('Active roles:', ctx.context.activeRoleKeys);
    console.log('Total grants:', ctx.context.grants.length);
  }

  // Now test every capability check
  const capabilities = [
    'receiving.view',
    'receiving.confirm',
    'pick_list.read',
    'pick_list.execute',
    'transfer.view',
    'inspection.perform',
    'fifo_override.approve',
    'reporting.read',
    'reporting.financial_read',
    'documents.read',
    'parties.read',
    'users.read',
  ];

  for (const cap of capabilities) {
    const res = await requirePermission(resolver, cap);
    console.log(`Capability [${cap.padEnd(25)}]: ${res.kind}`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

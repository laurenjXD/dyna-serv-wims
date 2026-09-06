import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createRequestAuthorizationResolver } from './lib/rbac/session.js';
import { db } from './lib/db/client.js';
import { userProfiles, userRoles, roles, rolePermissions, permissions, userPartyScopes } from './lib/db/schema/index.js';
import { eq, and, isNull, lte, or, gt } from 'drizzle-orm';
import { requirePermission } from './lib/rbac/guard.js';

async function testAdminRoutes() {
  const adminId = 'a03a0722-a321-42ac-8ee4-7abfba4349a6'; // admin@dyna-serv.com
  
  const resolver = createRequestAuthorizationResolver({
    getAuthenticatedSession: async () => ({ userId: adminId }),
    async loadAuthorizationRecord(userId) {
      const profileRows = await db.select({ status: userProfiles.status }).from(userProfiles).where(eq(userProfiles.id, userId)).limit(1);
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
        .select({ partyId: userPartyScopes.partyId, flowType: userPartyScopes.flowType })
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
        partyScopes: scopeRows.map((s) => ({ partyId: s.partyId, flowType: s.flowType ?? null })),
      };
    },
  });

  const routes = [
    { name: 'Dashboard (/)', perm: 'receiving.view' },
    { name: 'Receiving (/receiving)', perm: 'receiving.view' },
    { name: 'Inventory (/inventory)', perm: 'pick_list.read' },
    { name: 'Outgoing (/outgoing)', perm: 'pick_list.execute' },
    { name: 'Approvals (/approvals)', perm: 'fifo_override.approve' },
    { name: 'Reports (/reports)', perm: 'reporting.read' },
    { name: 'Reports Financial (/reports)', perm: 'reporting.financial_read' },
    { name: 'Documents (/documents)', perm: 'documents.read' },
    { name: 'Enrollment (/enrollment)', perm: 'parties.read' },
    { name: 'Billing & Pricing (/billing-pricing)', perm: 'reporting.financial_read' },
    { name: 'Settings (/settings)', perm: 'users.read' },
  ];

  console.log('--- Testing Route Permissions for admin@dyna-serv.com ---');
  for (const r of routes) {
    const res = await requirePermission(resolver, r.perm);
    console.log(`${r.name} [${r.perm}]: ${res.kind === 'authorized' ? '✅ AUTHORIZED' : '❌ ' + res.kind}`);
  }
}

testAdminRoutes().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

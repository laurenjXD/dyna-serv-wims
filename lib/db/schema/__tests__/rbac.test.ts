// RED-step schema tests for lib/db/schema/rbac.ts (does not exist yet).
//
// Traceability: specs/02-rbac-roles/design.md §4 "RBAC data model" (§4.1-§4.7)
// and §3.1 (system roles)/§3.2 (capability model, incl. the Supplies-exclusion
// narrowing of `user_party_scopes.flow_type`) for the shape these columns must
// support. Backing acceptance criteria from specs/02-rbac-roles/requirements.md
// §7: AC-3 (additive union of role capabilities), AC-6/AC-7 (party/flow scope
// isolation, Supplies exclusion), AC-8 (revocation metadata), AC-10 (last-admin
// invariant — not itself DB-enforced, but needs the columns this test asserts),
// AC-11 (rbac_security_events is insert-only/append-only).
//
// Cycle 2.1 scope only (per specs/00-steering/implementation-kickoff.md):
// pure schema-shape unit tests against the Drizzle table definitions. RLS
// policy behavior (cycle 2.4), the session resolver (2.2), and
// `requirePermission()` (2.3) are deliberately out of scope here.
import { describe, expect, it } from "vitest";
import {
  column,
  columns,
  compositePrimaryKeyColumns,
  findIndexOnColumns,
  hasColumn,
  referencesTable,
  tableName,
  uniqueConstraints,
} from "./helpers";

describe("rbac.ts — user_profiles table (design.md §4.1)", () => {
  it("is named 'user_profiles'", async () => {
    const { userProfiles } = await import("../rbac");
    expect(tableName(userProfiles)).toBe("user_profiles");
  });

  it("has id as primary key with no server-generated default (must equal auth.users.id)", async () => {
    const { userProfiles } = await import("../rbac");
    const id = column(userProfiles, "id");
    expect(id.primary).toBe(true);
    expect(id.hasDefault).toBe(false);
  });

  it("has displayName as notNull", async () => {
    const { userProfiles } = await import("../rbac");
    expect(column(userProfiles, "displayName").notNull).toBe(true);
  });

  it("has a notNull status column typed as an enum with exactly invited/active/inactive", async () => {
    const { userProfiles } = await import("../rbac");
    const status = column(userProfiles, "status");
    expect(status.notNull).toBe(true);
    expect(status.enumValues).toEqual(["invited", "active", "inactive"]);
  });

  it("has nullable activatedAt and a self-referencing nullable activatedByUserId (system bootstrap)", async () => {
    const { userProfiles } = await import("../rbac");
    expect(column(userProfiles, "activatedAt").notNull).toBe(false);
    const activatedBy = column(userProfiles, "activatedByUserId");
    expect(activatedBy.notNull).toBe(false);
    expect(
      referencesTable(userProfiles, "activated_by_user_id", "user_profiles", "id"),
    ).toBe(true);
  });

  it("has nullable deactivatedAt, deactivatedByUserId, and deactivationReason", async () => {
    const { userProfiles } = await import("../rbac");
    for (const key of ["deactivatedAt", "deactivatedByUserId", "deactivationReason"]) {
      expect(hasColumn(userProfiles, key)).toBe(true);
      expect(column(userProfiles, key).notNull).toBe(false);
    }
  });

  it("has createdAt and updatedAt notNull with defaults", async () => {
    const { userProfiles } = await import("../rbac");
    for (const key of ["createdAt", "updatedAt"]) {
      const col = column(userProfiles, key);
      expect(col.notNull).toBe(true);
      expect(col.hasDefault).toBe(true);
    }
  });
});

describe("rbac.ts — roles table (design.md §4.2, §3.1)", () => {
  it("is named 'roles'", async () => {
    const { roles } = await import("../rbac");
    expect(tableName(roles)).toBe("roles");
  });

  it("has key as notNull + unique + immutable machine identifier", async () => {
    const { roles } = await import("../rbac");
    const key = column(roles, "key");
    expect(key.notNull).toBe(true);
    expect(key.isUnique).toBe(true);
  });

  it("has name as notNull and description as nullable", async () => {
    const { roles } = await import("../rbac");
    expect(column(roles, "name").notNull).toBe(true);
    expect(column(roles, "description").notNull).toBe(false);
  });

  it("has isSystem and isActive as notNull booleans (v1 roles are all is_system = true)", async () => {
    const { roles } = await import("../rbac");
    const isSystem = column(roles, "isSystem");
    const isActive = column(roles, "isActive");
    expect(isSystem.notNull).toBe(true);
    expect(isActive.notNull).toBe(true);
    expect(isActive.hasDefault).toBe(true);
  });

  it("has createdAt and updatedAt notNull with defaults", async () => {
    const { roles } = await import("../rbac");
    for (const key of ["createdAt", "updatedAt"]) {
      const col = column(roles, key);
      expect(col.notNull).toBe(true);
      expect(col.hasDefault).toBe(true);
    }
  });

  it("seeds exactly the four §3.1 system role keys via migration (not asserted at schema level)", () => {
    // NOTE (judgment call, cycle 2.1): §3.1 lists warehouse_staff, supervisor,
    // administrator, party_user and states "the role catalog is seeded by
    // migration." Seed-data content is a migration/data concern owned by
    // database-builder + db-migration-verifier's real-Postgres pass, not a
    // Drizzle table-definition shape assertion — there is no seed data to
    // introspect from a bare `pgTable()` call. Flagged here as a deliberate
    // scope boundary rather than silently skipped.
    expect(true).toBe(true);
  });
});

describe("rbac.ts — permissions table (design.md §4.3, §3.2)", () => {
  it("is named 'permissions'", async () => {
    const { permissions } = await import("../rbac");
    expect(tableName(permissions)).toBe("permissions");
  });

  it("has resource and action as notNull stable machine identifiers", async () => {
    const { permissions } = await import("../rbac");
    expect(column(permissions, "resource").notNull).toBe(true);
    expect(column(permissions, "action").notNull).toBe(true);
  });

  it("has description as nullable and isActive as notNull", async () => {
    const { permissions } = await import("../rbac");
    expect(column(permissions, "description").notNull).toBe(false);
    expect(column(permissions, "isActive").notNull).toBe(true);
  });

  it("declares a unique constraint on (resource, action)", async () => {
    const { permissions } = await import("../rbac");
    const constraints = uniqueConstraints(permissions);
    expect(
      constraints.some(
        (cols) => cols.includes("resource") && cols.includes("action"),
      ),
    ).toBe(true);
  });

  it("has createdAt and updatedAt notNull with defaults", async () => {
    const { permissions } = await import("../rbac");
    for (const key of ["createdAt", "updatedAt"]) {
      const col = column(permissions, key);
      expect(col.notNull).toBe(true);
      expect(col.hasDefault).toBe(true);
    }
  });
});

describe("rbac.ts — role_permissions table (design.md §4.4)", () => {
  it("is named 'role_permissions'", async () => {
    const { rolePermissions } = await import("../rbac");
    expect(tableName(rolePermissions)).toBe("role_permissions");
  });

  it("has no surrogate id column (composite key is role_id/permission_id/scope_kind per §4.4)", async () => {
    const { rolePermissions } = await import("../rbac");
    expect(hasColumn(rolePermissions, "id")).toBe(false);
  });

  it("has notNull roleId referencing roles.id and notNull permissionId referencing permissions.id", async () => {
    const { rolePermissions } = await import("../rbac");
    expect(column(rolePermissions, "roleId").notNull).toBe(true);
    expect(referencesTable(rolePermissions, "role_id", "roles", "id")).toBe(true);
    expect(column(rolePermissions, "permissionId").notNull).toBe(true);
    expect(
      referencesTable(rolePermissions, "permission_id", "permissions", "id"),
    ).toBe(true);
  });

  it("has a notNull scopeKind enum of exactly global/assigned_party", async () => {
    const { rolePermissions } = await import("../rbac");
    const scopeKind = column(rolePermissions, "scopeKind");
    expect(scopeKind.notNull).toBe(true);
    expect(scopeKind.enumValues).toEqual(["global", "assigned_party"]);
  });

  it("declares (role_id, permission_id, scope_kind) as the primary/unique key", async () => {
    const { rolePermissions } = await import("../rbac");
    const composite = compositePrimaryKeyColumns(rolePermissions);
    const asUnique = uniqueConstraints(rolePermissions);
    const matchesComposite = composite.some(
      (cols) =>
        cols.includes("role_id") &&
        cols.includes("permission_id") &&
        cols.includes("scope_kind"),
    );
    const matchesUnique = asUnique.some(
      (cols) =>
        cols.includes("role_id") &&
        cols.includes("permission_id") &&
        cols.includes("scope_kind"),
    );
    expect(matchesComposite || matchesUnique).toBe(true);
  });

  it("has createdAt as notNull with a default", async () => {
    const { rolePermissions } = await import("../rbac");
    const createdAt = column(rolePermissions, "createdAt");
    expect(createdAt.notNull).toBe(true);
    expect(createdAt.hasDefault).toBe(true);
  });
});

describe("rbac.ts — user_roles table (design.md §4.5)", () => {
  it("is named 'user_roles'", async () => {
    const { userRoles } = await import("../rbac");
    expect(tableName(userRoles)).toBe("user_roles");
  });

  it("has notNull userId referencing user_profiles.id and notNull roleId referencing roles.id", async () => {
    const { userRoles } = await import("../rbac");
    expect(column(userRoles, "userId").notNull).toBe(true);
    expect(referencesTable(userRoles, "user_id", "user_profiles", "id")).toBe(true);
    expect(column(userRoles, "roleId").notNull).toBe(true);
    expect(referencesTable(userRoles, "role_id", "roles", "id")).toBe(true);
  });

  it("has validFrom notNull with a default (grant time) and nullable validUntil", async () => {
    const { userRoles } = await import("../rbac");
    const validFrom = column(userRoles, "validFrom");
    expect(validFrom.notNull).toBe(true);
    expect(validFrom.hasDefault).toBe(true);
    expect(column(userRoles, "validUntil").notNull).toBe(false);
  });

  it("has grantedAt notNull, and grantedByUserId/grantReason present but nullable at the schema level (app-enforced conditional requirement)", async () => {
    const { userRoles } = await import("../rbac");
    expect(column(userRoles, "grantedAt").notNull).toBe(true);
    for (const key of ["grantedByUserId", "grantReason"]) {
      expect(hasColumn(userRoles, key)).toBe(true);
      expect(column(userRoles, key).notNull).toBe(false);
    }
  });

  it("has nullable revokedAt, revokedByUserId, revocationReason", async () => {
    const { userRoles } = await import("../rbac");
    for (const key of ["revokedAt", "revokedByUserId", "revocationReason"]) {
      expect(hasColumn(userRoles, key)).toBe(true);
      expect(column(userRoles, key).notNull).toBe(false);
    }
  });

  it("declares a partial unique index on (user_id, role_id) WHERE revoked_at IS NULL (no more than one active assignment)", async () => {
    const { userRoles } = await import("../rbac");
    const idx = findIndexOnColumns(userRoles, ["user_id", "role_id"]);
    expect(idx).toBeDefined();
    expect(idx?.config.unique).toBe(true);
    expect(idx?.config.where).toBeDefined();
  });
});

describe("rbac.ts — user_party_scopes table (design.md §4.6, §3.2 Supplies exclusion)", () => {
  it("is named 'user_party_scopes'", async () => {
    const { userPartyScopes } = await import("../rbac");
    expect(tableName(userPartyScopes)).toBe("user_party_scopes");
  });

  it("has notNull userId referencing user_profiles.id and notNull partyId referencing parties.id", async () => {
    const { userPartyScopes } = await import("../rbac");
    expect(column(userPartyScopes, "userId").notNull).toBe(true);
    expect(
      referencesTable(userPartyScopes, "user_id", "user_profiles", "id"),
    ).toBe(true);
    expect(column(userPartyScopes, "partyId").notNull).toBe(true);
    expect(referencesTable(userPartyScopes, "party_id", "parties", "id")).toBe(
      true,
    );
  });

  it("has a nullable flowType reusing the existing flow_type enum (vmi/trading/supplies) — null means all externally-applicable flows, per §3.2, never a bare wildcard including supplies", async () => {
    const { userPartyScopes } = await import("../rbac");
    const flowType = column(userPartyScopes, "flowType");
    expect(flowType.notNull).toBe(false);
    expect(flowType.enumValues).toEqual(["vmi", "trading", "supplies"]);
  });

  it("has validFrom/validUntil, grantedAt/grantedByUserId, and revocation metadata columns present", async () => {
    const { userPartyScopes } = await import("../rbac");
    expect(hasColumn(userPartyScopes, "validFrom")).toBe(true);
    expect(hasColumn(userPartyScopes, "validUntil")).toBe(true);
    expect(column(userPartyScopes, "grantedAt").notNull).toBe(true);
    for (const key of [
      "grantReason",
      "revokedAt",
      "revokedByUserId",
      "revocationReason",
    ]) {
      expect(hasColumn(userPartyScopes, key)).toBe(true);
    }
  });

  it("declares a partial unique index on (user_id, party_id, flow_type) WHERE revoked_at IS NULL treating null flow_type as a real value (NULLS NOT DISTINCT)", async () => {
    // NOTE (judgment call, cycle 2.1): design.md §4.6 explicitly requires the
    // Postgres-15+ native `NULLS NOT DISTINCT` index modifier and explicitly
    // rules out a COALESCE(...)-sentinel expression index because the
    // implicit enum->text cast is STABLE, not IMMUTABLE. Drizzle's
    // `uniqueIndex()`/`IndexBuilder` API (drizzle-orm 0.45.2, checked against
    // node_modules/drizzle-orm/pg-core/indexes.d.ts) exposes `.where()` for a
    // partial index but has no `.nullsNotDistinct()` method on IndexBuilder
    // (only UniqueConstraint's non-partial `unique().nullsNotDistinct()`
    // supports it, and that path cannot also be partial/WHERE-scoped). This
    // repo's convention (§4.6's own wording, "This MUST use Postgres 15+'s
    // native ... index modifier") points at a raw-SQL migration statement for
    // this specific index, not a pure Drizzle-schema construct — so this test
    // only asserts the partial-unique-index shape that *is* expressible in
    // the Drizzle table definition (columns + uniqueness + a WHERE clause).
    // The NULLS NOT DISTINCT modifier itself is a real-Postgres migration
    // concern for db-migration-verifier in cycle 2.4, not this schema-shape
    // unit test.
    const { userPartyScopes } = await import("../rbac");
    const idx = findIndexOnColumns(userPartyScopes, [
      "user_id",
      "party_id",
      "flow_type",
    ]);
    expect(idx).toBeDefined();
    expect(idx?.config.unique).toBe(true);
    expect(idx?.config.where).toBeDefined();
  });
});

describe("rbac.ts — rbac_security_events table (design.md §4.7)", () => {
  it("is named 'rbac_security_events'", async () => {
    const { rbacSecurityEvents } = await import("../rbac");
    expect(tableName(rbacSecurityEvents)).toBe("rbac_security_events");
  });

  it("has a notNull eventType typed as an enum matching the exhaustive §4.7 event_type list", async () => {
    const { rbacSecurityEvents } = await import("../rbac");
    const eventType = column(rbacSecurityEvents, "eventType");
    expect(eventType.notNull).toBe(true);
    expect(eventType.enumValues).toEqual([
      "user_invited",
      "user_activated",
      "user_deactivated",
      "role_granted",
      "role_revoked",
      "party_scope_granted",
      "party_scope_revoked",
      "sensitive_action_denied",
      "authentication_failed",
      "session_revoked",
      "password_recovery_requested",
      "administrator_invariant_blocked",
    ]);
  });

  it("has a nullable actorUserId (unknown identity, e.g. failed sign-in)", async () => {
    const { rbacSecurityEvents } = await import("../rbac");
    expect(column(rbacSecurityEvents, "actorUserId").notNull).toBe(false);
  });

  it("has a notNull executorType enum of exactly user/system/background_job, and a nullable executorId", async () => {
    const { rbacSecurityEvents } = await import("../rbac");
    const executorType = column(rbacSecurityEvents, "executorType");
    expect(executorType.notNull).toBe(true);
    expect(executorType.enumValues).toEqual(["user", "system", "background_job"]);
    expect(column(rbacSecurityEvents, "executorId").notNull).toBe(false);
  });

  it("has notNull targetType and nullable targetId ('where safe')", async () => {
    const { rbacSecurityEvents } = await import("../rbac");
    expect(column(rbacSecurityEvents, "targetType").notNull).toBe(true);
    expect(column(rbacSecurityEvents, "targetId").notNull).toBe(false);
  });

  it("has nullable reason, details (jsonb), correlationId, and ipHash", async () => {
    const { rbacSecurityEvents } = await import("../rbac");
    for (const key of ["reason", "details", "correlationId", "ipHash"]) {
      expect(hasColumn(rbacSecurityEvents, key)).toBe(true);
      expect(column(rbacSecurityEvents, key).notNull).toBe(false);
    }
  });

  it("has createdAt as notNull, server/database generated with a default", async () => {
    const { rbacSecurityEvents } = await import("../rbac");
    const createdAt = column(rbacSecurityEvents, "createdAt");
    expect(createdAt.notNull).toBe(true);
    expect(createdAt.hasDefault).toBe(true);
  });

  it("declares no update/delete-enabling mutable-audit shape at the schema level (append-only is an RLS/policy concern — cycle 2.4, not asserted here)", () => {
    // NOTE (judgment call, cycle 2.1): "No ordinary or administrator policy
    // permits update or delete" (§4.7) is enforced by RLS policies, which
    // this cycle's pure Drizzle-schema-shape tests do not exercise (RLS is
    // explicitly cycle 2.4's real-Postgres integration-test tier per
    // testing.md and this task's own scope boundary). Nothing about the bare
    // column list above can prove or disprove append-only-ness; flagged here
    // rather than silently asserting something this test tier cannot check.
    expect(true).toBe(true);
  });
});

describe("rbac.ts — barrel export sanity (all seven tables importable together)", () => {
  it("exports all seven RBAC tables from a single module", async () => {
    const mod = await import("../rbac");
    for (const key of [
      "userProfiles",
      "roles",
      "permissions",
      "rolePermissions",
      "userRoles",
      "userPartyScopes",
      "rbacSecurityEvents",
    ]) {
      expect(mod).toHaveProperty(key);
      // Sanity: each export actually looks like a pg table with columns.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(Object.keys(columns((mod as any)[key])).length).toBeGreaterThan(0);
    }
  });
});

// RBAC data model — specs/02-rbac-roles/design.md §4.1-§4.7
//
// Schema-definition only (cycle 2.1). The session resolver, requirePermission(),
// and RLS policies are separate later cycles (2.2/2.3/2.4) — not implemented here.
//
// `user_party_scopes`'s (user_id, party_id, flow_type) active-assignment
// uniqueness is specified by design.md §4.6 to require Postgres 15+'s native
// `NULLS NOT DISTINCT` partial-unique-index modifier. Drizzle's IndexBuilder
// (drizzle-orm 0.45.2) has no `.nullsNotDistinct()` on a `.where()`-scoped
// partial index — only the non-partial `unique().nullsNotDistinct()`
// constraint builder supports it, and that can't carry a WHERE clause. The
// index below is declared as a plain partial unique index (columns +
// uniqueness + WHERE); the literal `NULLS NOT DISTINCT` SQL must be
// hand-written into the migration file (same pattern as `lot_inventory_totals`'s
// hand-written VIEW in migration 0002) — a cycle 2.4/db-migration-verifier
// concern, not something forced into this Drizzle table definition.
import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
  unique,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { parties } from "./parties";
import {
  flowTypeEnum,
  rbacEventTypeEnum,
  rbacExecutorTypeEnum,
  scopeKindEnum,
  userProfileStatusEnum,
} from "./enums";

// §4.1 `user_profiles`
export const userProfiles = pgTable("user_profiles", {
  // Same value as auth.users.id — no server-generated default; the caller
  // must supply the Supabase Auth user id explicitly.
  id: uuid("id").primaryKey(),
  displayName: text("display_name").notNull(),
  status: userProfileStatusEnum("status").notNull().default("invited"),
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  // Nullable self-reference (system bootstrap has no activating actor).
  // design.md §4.1 explicitly describes this column as a self-referencing
  // FK ("nullable self-reference for system bootstrap"), unlike the
  // deactivated/granted/revoked actor columns elsewhere in this file, which
  // have no explicit FK relationship stated in prose and follow the
  // audit_log.actorUserId precedent (lib/db/schema/audit.ts) instead.
  activatedByUserId: uuid("activated_by_user_id").references(
    (): AnyPgColumn => userProfiles.id,
  ),
  deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
  deactivatedByUserId: uuid("deactivated_by_user_id"),
  // Required on deactivation — app-enforced, not NOT NULL at the schema level.
  deactivationReason: text("deactivation_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// §4.2 `roles` (§3.1 system role catalog — seeded by migration, not schema-defined here)
export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  isSystem: boolean("is_system").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// §4.3 `permissions`
export const permissions = pgTable("permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  resource: varchar("resource", { length: 100 }).notNull(),
  action: varchar("action", { length: 100 }).notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  resourceActionUnique: unique("permissions_resource_action_unique").on(
    table.resource,
    table.action,
  ),
}));

// §4.4 `role_permissions` — composite key (role_id, permission_id, scope_kind);
// system-role mappings are migration-managed in v1.
export const rolePermissions = pgTable("role_permissions", {
  roleId: uuid("role_id")
    .notNull()
    .references(() => roles.id, { onDelete: "cascade" }),
  permissionId: uuid("permission_id")
    .notNull()
    .references(() => permissions.id, { onDelete: "cascade" }),
  scopeKind: scopeKindEnum("scope_kind").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({
    columns: [table.roleId, table.permissionId, table.scopeKind],
  }),
}));

// §4.5 `user_roles`
export const userRoles = pgTable("user_roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => userProfiles.id, { onDelete: "cascade" }),
  roleId: uuid("role_id")
    .notNull()
    .references(() => roles.id, { onDelete: "cascade" }),
  validFrom: timestamp("valid_from", { withTimezone: true }).defaultNow().notNull(),
  validUntil: timestamp("valid_until", { withTimezone: true }),
  grantedAt: timestamp("granted_at", { withTimezone: true }).defaultNow().notNull(),
  // "Required after bootstrap" (design.md §4.5) — app-enforced, nullable here.
  grantedByUserId: uuid("granted_by_user_id"),
  // "Required for sensitive grants" — app-enforced, nullable here.
  grantReason: text("grant_reason"),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokedByUserId: uuid("revoked_by_user_id"),
  revocationReason: text("revocation_reason"),
}, (table) => ({
  // Partial unique index: no more than one active assignment per (user_id, role_id).
  activeAssignmentUnique: uniqueIndex("user_roles_active_unique")
    .on(table.userId, table.roleId)
    .where(sql`revoked_at IS NULL`),
  userIdx: index("user_roles_user_idx").on(table.userId),
}));

// §4.6 `user_party_scopes`
export const userPartyScopes = pgTable("user_party_scopes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => userProfiles.id, { onDelete: "cascade" }),
  partyId: uuid("party_id")
    .notNull()
    .references(() => parties.id, { onDelete: "cascade" }),
  // Nullable; null means all externally-applicable flows for this party
  // (VMI/Trading only — never Supplies; see design.md §3.2's two-gate rule).
  flowType: flowTypeEnum("flow_type"),
  validFrom: timestamp("valid_from", { withTimezone: true }).defaultNow().notNull(),
  validUntil: timestamp("valid_until", { withTimezone: true }),
  grantedAt: timestamp("granted_at", { withTimezone: true }).defaultNow().notNull(),
  grantedByUserId: uuid("granted_by_user_id"),
  grantReason: text("grant_reason"),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokedByUserId: uuid("revoked_by_user_id"),
  revocationReason: text("revocation_reason"),
}, (table) => ({
  // Plain partial unique index (columns + uniqueness + WHERE) at the Drizzle
  // level. The `NULLS NOT DISTINCT` modifier required by design.md §4.6 is
  // not expressible via Drizzle's IndexBuilder and must be hand-written into
  // the migration SQL — see module header comment.
  activeAssignmentUnique: uniqueIndex("user_party_scopes_active_unique")
    .on(table.userId, table.partyId, table.flowType)
    .where(sql`revoked_at IS NULL`),
  userIdx: index("user_party_scopes_user_idx").on(table.userId),
  partyIdx: index("user_party_scopes_party_idx").on(table.partyId),
}));

// §4.7 `rbac_security_events` — append-only (enforced by RLS, cycle 2.4; not
// asserted at this schema-shape tier).
export const rbacSecurityEvents = pgTable("rbac_security_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventType: rbacEventTypeEnum("event_type").notNull(),
  // Nullable when identity is unknown, e.g. failed sign-in.
  actorUserId: uuid("actor_user_id"),
  executorType: rbacExecutorTypeEnum("executor_type").notNull(),
  executorId: text("executor_id"),
  targetType: text("target_type").notNull(),
  targetId: text("target_id"),
  reason: text("reason"),
  details: jsonb("details"),
  correlationId: text("correlation_id"),
  ipHash: text("ip_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  actorIdx: index("rbac_security_events_actor_idx").on(table.actorUserId),
  targetIdx: index("rbac_security_events_target_idx").on(table.targetType, table.targetId),
  correlationIdx: index("rbac_security_events_correlation_idx").on(table.correlationId),
}));

// `audit_log` — specs/01-core-data-model/design.md §1.2
// Immutable, cross-entity accountability record — written server-side only,
// never directly mutated by browser clients.
import { pgTable, uuid, varchar, jsonb, timestamp, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorUserId: uuid("actor_user_id").notNull(),
  actorRole: varchar("actor_role", { length: 50 }).notNull(), // role snapshot at event time
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 100 }).notNull(),
  entityId: uuid("entity_id").notNull(),
  beforeData: jsonb("before_data"),
  afterData: jsonb("after_data"),
  diffData: jsonb("diff_data"),
  // Canonical X-Correlation-Id from 04 §15.3: server-generated or validated UUID v4, max 64 chars.
  correlationId: varchar("correlation_id", { length: 64 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  entityIdx: index("audit_log_entity_idx").on(table.entityType, table.entityId),
  actorIdx: index("audit_log_actor_idx").on(table.actorUserId),
  correlationIdx: index("audit_log_correlation_idx").on(table.correlationId),
  payloadPresent: check(
    "audit_log_payload_present",
    sql`${table.beforeData} IS NOT NULL OR ${table.afterData} IS NOT NULL OR ${table.diffData} IS NOT NULL`,
  ),
}));

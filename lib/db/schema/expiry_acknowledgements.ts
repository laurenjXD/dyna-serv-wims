// Immutable command evidence; canonical 01 material-expiry amendment R1–R8.
// Actor FK to auth.users and polymorphic source validation live in migration 0076.
import { check, date, index, jsonb, pgTable, text, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const expiryAcknowledgements = pgTable("expiry_acknowledgements", {
  id: uuid("id").primaryKey().defaultRandom(),
  stage: text("stage").$type<"receiving" | "generation" | "dispatch">().notNull(),
  sourceId: uuid("source_id").notNull(),
  actorUserId: uuid("actor_user_id").notNull(),
  reason: text("reason").notNull(),
  businessDate: date("business_date").notNull(),
  fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
  lines: jsonb("lines").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  commandFingerprint: unique("expiry_acknowledgements_command_fingerprint_unique").on(table.stage, table.sourceId, table.fingerprint),
  sourceLookup: index("expiry_acknowledgements_source_idx").on(table.stage, table.sourceId),
  actorLookup: index("expiry_acknowledgements_actor_idx").on(table.actorUserId, table.createdAt),
  stageValid: check("expiry_acknowledgements_stage_valid", sql`${table.stage} IN ('receiving', 'generation', 'dispatch')`),
  reasonValid: check("expiry_acknowledgements_reason_valid", sql`length(btrim(${table.reason})) BETWEEN 1 AND 1000`),
  fingerprintValid: check("expiry_acknowledgements_fingerprint_valid", sql`${table.fingerprint} ~ '^[0-9a-f]{64}$'`),
  linesValid: check("expiry_acknowledgements_lines_valid", sql`jsonb_typeof(${table.lines}) = 'array' AND jsonb_array_length(${table.lines}) > 0`),
}));

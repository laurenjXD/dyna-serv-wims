import { index, integer, pgTable, timestamp, unique, uuid, varchar, text } from "drizzle-orm/pg-core";
import { locations } from "./locations";
import { items } from "./items";
import { lots } from "./lots";
import { lotLocationBalances } from "./lot_location_balances";

export const cycleCountSessions = pgTable("cycle_count_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  countNumber: varchar("count_number", { length: 50 }).notNull().unique(),
  locationId: uuid("location_id").references(() => locations.id).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("counting"),
  snapshotAt: timestamp("snapshot_at", { withTimezone: true }).defaultNow().notNull(),
  createdByUserId: uuid("created_by_user_id").notNull(),
  submittedByUserId: uuid("submitted_by_user_id"),
  approvedByUserId: uuid("approved_by_user_id"),
  postedByUserId: uuid("posted_by_user_id"),
  rejectionReason: text("rejection_reason"),
  version: integer("version").notNull().default(1),
  idempotencyKey: varchar("idempotency_key", { length: 120 }).notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  locationStatusIdx: index("cycle_count_sessions_location_status_idx").on(table.locationId, table.status),
}));

export const cycleCountLines = pgTable("cycle_count_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").references(() => cycleCountSessions.id, { onDelete: "cascade" }).notNull(),
  balanceId: uuid("balance_id").references(() => lotLocationBalances.id).notNull(),
  itemId: uuid("item_id").references(() => items.id).notNull(),
  lotId: uuid("lot_id").references(() => lots.id).notNull(),
  locationId: uuid("location_id").references(() => locations.id).notNull(),
  systemQty: integer("system_qty").notNull(),
  countedQty: integer("counted_qty"),
  variance: integer("variance"),
  balanceVersion: integer("balance_version").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("uncounted"),
  countedByUserId: uuid("counted_by_user_id"),
  countedAt: timestamp("counted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  sessionBalanceUnique: unique("cycle_count_lines_session_balance_unique").on(table.sessionId, table.balanceId),
  sessionStatusIdx: index("cycle_count_lines_session_status_idx").on(table.sessionId, table.status),
}));

export const cycleCountEvents = pgTable("cycle_count_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").references(() => cycleCountSessions.id, { onDelete: "cascade" }).notNull(),
  lineId: uuid("line_id").references(() => cycleCountLines.id, { onDelete: "cascade" }),
  eventType: varchar("event_type", { length: 30 }).notNull(),
  rawValue: text("raw_value"),
  countedQty: integer("counted_qty"),
  note: text("note"),
  actorUserId: uuid("actor_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  sessionCreatedIdx: index("cycle_count_events_session_created_idx").on(table.sessionId, table.createdAt),
}));

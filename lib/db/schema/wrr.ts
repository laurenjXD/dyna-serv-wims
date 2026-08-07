// Skeleton only — Phase 0 scaffolding. Full column set specified in
// specs/01-core-data-model/design.md §1.2 (`wrr_documents`, `wrr_items`,
// `wrr_inspection_logs`).
//
// Note: `wrr_advance_notices` (design.md §6) is a separate, not-yet
// independently `db-migration-verifier`-verified schema amendment and is
// intentionally NOT scaffolded here — it is added once its own
// verification pass is complete.
import { pgTable, uuid, timestamp } from "drizzle-orm/pg-core";

export const wrrDocuments = pgTable("wrr_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const wrrItems = pgTable("wrr_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const wrrInspectionLogs = pgTable("wrr_inspection_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

import { boolean, integer, pgTable, text, timestamp, uuid, varchar, uniqueIndex } from "drizzle-orm/pg-core";
import { wrrDocuments, wrrItems } from "./wrr";

export const receivingDiscrepancies = pgTable("receiving_discrepancies", {
  id: uuid("id").primaryKey().defaultRandom(),
  wrrId: uuid("wrr_id").references(() => wrrDocuments.id, { onDelete: "cascade" }).notNull(),
  wrrItemId: uuid("wrr_item_id").references(() => wrrItems.id, { onDelete: "cascade" }).notNull(),
  expectedCartons: integer("expected_cartons").notNull(),
  receivedCartons: integer("received_cartons").notNull(),
  missingCartons: integer("missing_cartons").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("open"),
  resolution: varchar("resolution", { length: 50 }),
  resolutionNotes: text("resolution_notes"),
  resolvedByUserId: uuid("resolved_by_user_id"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  onePerLine: uniqueIndex("receiving_discrepancies_wrr_item_unique").on(table.wrrItemId),
}));

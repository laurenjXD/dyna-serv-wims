import { index, integer, pgTable, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { wrrItems } from "./wrr";
import { lots } from "./lots";
import { locations } from "./locations";
import { pickListItems } from "./pick_lists";

/** One durable row per physical carton/box QR. Aggregate stock remains in lot_location_balances. */
export const inventoryUnits = pgTable("inventory_units", {
  id: uuid("id").primaryKey().defaultRandom(),
  unitId: uuid("unit_id").notNull().unique(),
  unitIndex: integer("unit_index").notNull(),
  wrrItemId: uuid("wrr_item_id").references(() => wrrItems.id).notNull(),
  lotId: uuid("lot_id").references(() => lots.id).notNull(),
  locationId: uuid("location_id").references(() => locations.id).notNull(),
  status: varchar("status", { length: 20 }).default("available").notNull(),
  pickListItemId: uuid("pick_list_item_id").references(() => pickListItems.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueLineIndex: unique("inventory_units_wrr_item_index_unique").on(table.wrrItemId, table.unitIndex),
  sourceLookup: index("inventory_units_source_idx").on(table.lotId, table.locationId, table.status),
  pickLineLookup: index("inventory_units_pick_list_item_idx").on(table.pickListItemId),
}));

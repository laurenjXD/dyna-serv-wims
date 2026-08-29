import { index, integer, pgTable, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { wrrItems } from "./wrr";
import { lots } from "./lots";
import { locations } from "./locations";
import { pickListItems } from "./pick_lists";

/** One durable row per physical carton/box QR. Aggregate stock remains in lot_location_balances. */
export const inventoryUnits = pgTable("inventory_units", {
  id: uuid("id").primaryKey().defaultRandom(),
  unitId: uuid("unit_id").notNull().unique(),
  // Stable human-readable identity for the physical carton. The UUID remains
  // the internal unit identity used by existing exact-pick code.
  cartonId: varchar("carton_id", { length: 80 }).notNull().unique(),
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

/** Immutable lifecycle events for a physical carton. */
export const cartonStatusHistory = pgTable("carton_status_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  inventoryUnitId: uuid("inventory_unit_id").references(() => inventoryUnits.id).notNull(),
  cartonId: varchar("carton_id", { length: 80 }).notNull(),
  previousStatus: varchar("previous_status", { length: 30 }),
  newStatus: varchar("new_status", { length: 30 }).notNull(),
  previousQuantity: integer("previous_quantity"),
  newQuantity: integer("new_quantity"),
  locationId: uuid("location_id").references(() => locations.id),
  sourceTransactionId: uuid("source_transaction_id"),
  changedByUserId: uuid("changed_by_user_id").notNull(),
  reason: varchar("reason", { length: 500 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  cartonTimeline: index("carton_status_history_carton_timeline_idx").on(table.cartonId, table.createdAt),
  inventoryUnitTimeline: index("carton_status_history_unit_timeline_idx").on(table.inventoryUnitId, table.createdAt),
}));

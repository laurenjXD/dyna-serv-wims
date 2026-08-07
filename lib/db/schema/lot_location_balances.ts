// `lot_location_balances` — specs/01-core-data-model/design.md §1.2
//
// `lots` is the identity and lifecycle record for a received physical lot.
// Physical quantity is held in this child table because one lot may be split
// across multiple locations. This is the authoritative placement and quantity
// model; there is no `stock_levels` or other aggregate inventory ledger.
//
// The `lot_inventory_totals` read-model view (design.md §1.2) is a plain SQL
// view, not a Drizzle-managed table, and belongs in a migration file, not
// here. `qty_available = qty_remaining - qty_committed` is derived-only and
// is never a stored column on this table.
import { pgTable, uuid, integer, timestamp, unique, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { lots } from "./lots";
import { locations } from "./locations";

export const lotLocationBalances = pgTable("lot_location_balances", {
  id: uuid("id").primaryKey().defaultRandom(),
  lotId: uuid("lot_id").references(() => lots.id).notNull(),
  locationId: uuid("location_id").references(() => locations.id).notNull(),
  qtyReceived: integer("qty_received").notNull(),
  qtyRemaining: integer("qty_remaining").notNull(),
  qtyCommitted: integer("qty_committed").default(0).notNull(),
  version: integer("version").default(1).notNull(), // optimistic concurrency token, incremented on every update
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  uniqueLotLocation: unique().on(table.lotId, table.locationId),
  qtyReceivedNonNegative: check("qty_received_non_negative", sql`${table.qtyReceived} >= 0`),
  qtyRemainingNonNegative: check("qty_remaining_non_negative", sql`${table.qtyRemaining} >= 0`),
  qtyCommittedWithinRemaining: check(
    "qty_committed_within_remaining",
    sql`${table.qtyCommitted} >= 0 AND ${table.qtyCommitted} <= ${table.qtyRemaining}`
  ),
}));

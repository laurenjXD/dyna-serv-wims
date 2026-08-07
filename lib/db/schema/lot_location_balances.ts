// Skeleton only — Phase 0 scaffolding. Full column set (incl. qty_received,
// qty_remaining, qty_committed, version, and check constraints) specified in
// specs/01-core-data-model/design.md §1.2 (`lot_location_balances`).
// The `lot_inventory_totals` read-model view (§1.2) is a plain SQL view,
// not a Drizzle-managed table, and belongs in a migration file, not here.
import { pgTable, uuid, timestamp } from "drizzle-orm/pg-core";

export const lotLocationBalances = pgTable("lot_location_balances", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

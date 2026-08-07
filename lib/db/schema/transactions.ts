// Skeleton only — Phase 0 scaffolding. Full column set specified in
// specs/01-core-data-model/design.md §1.2 (`inventory_transactions`).
// One table, differentiated by `movement_type` — never split into separate
// per-flow tables (see tech.md's cross-cutting architecture principles).
import { pgTable, uuid, timestamp } from "drizzle-orm/pg-core";

export const inventoryTransactions = pgTable("inventory_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

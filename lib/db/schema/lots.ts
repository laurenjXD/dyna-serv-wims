// Skeleton only — Phase 0 scaffolding. Full column set specified in
// specs/01-core-data-model/design.md §1.2 (`lots`).
import { pgTable, uuid, timestamp } from "drizzle-orm/pg-core";

export const lots = pgTable("lots", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

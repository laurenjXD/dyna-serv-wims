// Skeleton only — Phase 0 scaffolding. Full column set specified in
// specs/01-core-data-model/design.md §1.2 (`locations`).
import { pgTable, uuid, timestamp } from "drizzle-orm/pg-core";

export const locations = pgTable("locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

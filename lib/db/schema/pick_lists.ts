// Skeleton only — Phase 0 scaffolding. Full column set specified in
// specs/01-core-data-model/design.md §1.2 (`pick_lists` & `pick_list_items`).
import { pgTable, uuid, timestamp } from "drizzle-orm/pg-core";

export const pickLists = pgTable("pick_lists", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const pickListItems = pgTable("pick_list_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

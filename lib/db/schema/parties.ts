// Skeleton only — Phase 0 scaffolding. Full column set specified in
// specs/01-core-data-model/design.md §1.2 (`parties` & `party_roles`).
// Table names below are final; columns are filled in by `database-builder`
// against the approved spec.
import { pgTable, uuid, timestamp } from "drizzle-orm/pg-core";

export const parties = pgTable("parties", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const partyRoles = pgTable("party_roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

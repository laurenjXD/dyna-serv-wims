// Skeleton only — Phase 0 scaffolding. Full column set specified in
// specs/01-core-data-model/design.md §1.2 (`inventory_commitments` &
// `inventory_commitment_lines`).
import { pgTable, uuid, timestamp } from "drizzle-orm/pg-core";

export const inventoryCommitments = pgTable("inventory_commitments", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const inventoryCommitmentLines = pgTable("inventory_commitment_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

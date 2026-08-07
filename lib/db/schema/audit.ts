// Skeleton only — Phase 0 scaffolding. Full column set specified in
// specs/01-core-data-model/design.md §1.2 (`audit_log`).
// Immutable, cross-entity accountability record — written server-side only,
// never directly mutated by browser clients.
import { pgTable, uuid, timestamp } from "drizzle-orm/pg-core";

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

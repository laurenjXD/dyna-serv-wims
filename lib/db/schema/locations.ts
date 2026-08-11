// `locations` — specs/01-core-data-model/design.md §1.2
import { pgTable, uuid, varchar, decimal, boolean, timestamp } from "drizzle-orm/pg-core";
import { locationTypeEnum } from "./enums";

export const locations = pgTable("locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  zone: varchar("zone", { length: 50 }).notNull(),
  rack: varchar("rack", { length: 50 }).notNull(),
  level: varchar("level", { length: 50 }).notNull(),
  position: varchar("position", { length: 50 }).notNull(),
  label: varchar("label", { length: 100 }).notNull().unique(), // Format: Rack+Level-Position (e.g. 'A1-01' for Rack A, Level 1, Position 01)
  locationType: locationTypeEnum("location_type").default("storage").notNull(),
  maxCbmCapacity: decimal("max_cbm_capacity", { precision: 10, scale: 4 }).notNull(),
  maxWeightCapacity: decimal("max_weight_capacity", { precision: 10, scale: 3 }).default("0").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

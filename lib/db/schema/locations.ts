// `locations` — specs/01-core-data-model/design.md §1.2
import { check, pgTable, uuid, varchar, decimal, boolean, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { locationTypeEnum } from "./enums";

export const locations = pgTable("locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  zone: varchar("zone", { length: 50 }).notNull(),
  rack: varchar("rack", { length: 50 }),
  level: varchar("level", { length: 50 }),
  position: varchar("position", { length: 50 }),
  label: varchar("label", { length: 100 }).unique(), // Storage only: Rack+Level-Position (e.g. 'A1-01')
  locationType: locationTypeEnum("location_type").default("storage").notNull(),
  maxCbmCapacity: decimal("max_cbm_capacity", { precision: 10, scale: 4 }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  zoneAllowed: check("locations_zone_allowed", sql`${table.zone} in ('storage', 'rcv', 'hold')`),
  conditionalFields: check(
    "locations_zone_fields_valid",
    sql`(
      (${table.zone} = 'storage'
        and ${table.rack} ~ '^[A-I]$'
        and ${table.level} ~ '^[1-4]$'
        and ${table.position} ~ '^[0-9]{2}$'
        and ${table.position}::integer between 1 and case when ${table.rack} = 'A' then 30 else 15 end
        and ${table.label} = ${table.rack} || ${table.level} || '-' || ${table.position}
        and ${table.maxCbmCapacity} is not null
        and ${table.maxCbmCapacity} > 0)
      or
      (${table.zone} in ('rcv', 'hold')
        and ${table.rack} is null
        and ${table.level} is null
        and ${table.position} is null
        and ${table.label} is null
        and ${table.maxCbmCapacity} is null)
    )`,
  ),
}));

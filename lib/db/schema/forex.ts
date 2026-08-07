// `forex_rates` — specs/01-core-data-model/design.md §1.2
import { pgTable, uuid, varchar, date, decimal, timestamp } from "drizzle-orm/pg-core";

export const forexRates = pgTable("forex_rates", {
  id: uuid("id").primaryKey().defaultRandom(),
  effectiveDate: date("effective_date").notNull().unique(), // Daily Forex date
  usdToPhpRate: decimal("usd_to_php_rate", { precision: 10, scale: 4 }).notNull(), // USD to PHP daily exchange rate
  source: varchar("source", { length: 100 }).default("manual").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// `lots` — specs/01-core-data-model/design.md §1.2
import { pgTable, uuid, varchar, decimal, date, timestamp } from "drizzle-orm/pg-core";
import { flowTypeEnum, lotStatusEnum } from "./enums";
import { items } from "./items";
import { parties } from "./parties";
import { wrrItems } from "./wrr";

export const lots = pgTable("lots", {
  id: uuid("id").primaryKey().defaultRandom(),
  lotNumber: varchar("lot_number", { length: 100 }).notNull(), // Business lot number copied from the WRR item
  wrrItemId: uuid("wrr_item_id").references(() => wrrItems.id).notNull(), // Source WRR line
  itemId: uuid("item_id").references(() => items.id).notNull(),
  flowType: flowTypeEnum("flow_type").notNull(), // 'vmi' | 'trading' | 'supplies'
  ownerPartyId: uuid("owner_party_id").references(() => parties.id), // Required for VMI, optional for Trading/Supplies
  status: lotStatusEnum("status").default("staged").notNull(), // FIFO/FEFO eligibility gate
  pezaNumber: varchar("peza_number", { length: 100 }), // PEZA Permit Number (manual)
  commercialInvoiceNo: varchar("commercial_invoice_no", { length: 100 }), // Commercial Invoice (CIPL)
  ipNumber: varchar("ip_number", { length: 100 }), // Import Permit (IP) Number
  manufactureDate: date("manufacture_date"),
  expiryDate: date("expiry_date"),
  unitCost: decimal("unit_cost", { precision: 12, scale: 4 }), // Unit Cost in USD (Final for Trading, reference-only for VMI)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

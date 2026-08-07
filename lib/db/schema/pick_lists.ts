// `pick_lists` & `pick_list_items` — specs/01-core-data-model/design.md §1.2
import { pgTable, uuid, varchar, text, integer, decimal, timestamp } from "drizzle-orm/pg-core";
import { flowTypeEnum, pickListStatusEnum } from "./enums";
import { parties } from "./parties";
import { items } from "./items";
import { locations } from "./locations";
import { lots } from "./lots";

export const pickLists = pgTable("pick_lists", {
  id: uuid("id").primaryKey().defaultRandom(),
  pickListNumber: varchar("pick_list_number", { length: 50 }).notNull().unique(),
  customerPartyId: uuid("customer_party_id").references(() => parties.id).notNull(),
  flowType: flowTypeEnum("flow_type").notNull(),
  status: pickListStatusEnum("status").default("allocated").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const pickListItems = pgTable("pick_list_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  pickListId: uuid("pick_list_id").references(() => pickLists.id, { onDelete: "cascade" }).notNull(),
  itemId: uuid("item_id").references(() => items.id).notNull(),
  itemCode: varchar("item_code", { length: 100 }).notNull(), // Item Code
  customerItemCode: varchar("customer_item_code", { length: 100 }), // CUST PN
  itemDescription: text("item_description"), // Item Description
  lotId: uuid("lot_id").references(() => lots.id).notNull(),
  lotNumber: varchar("lot_number", { length: 100 }).notNull(), // Lot Number
  locationId: uuid("location_id").references(() => locations.id).notNull(),
  locationLabel: varchar("location_label", { length: 100 }).notNull(), // Location
  qty: integer("qty").notNull(), // Qty
  spq: integer("spq").notNull(), // SPQ — snapshot only; SPQ-multiple enforcement is application-layer, owned by 08's allocation engine (design.md §3 item 9), not a DB CHECK here.
  numberOfBoxes: integer("number_of_boxes").notNull(), // No. of Packages/Boxes
  unitPrice: decimal("unit_price", { precision: 12, scale: 4 }), // Priced on Document
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

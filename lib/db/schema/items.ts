// `item_categories` & `items` — specs/01-core-data-model/design.md §1.2
import { pgTable, uuid, varchar, text, integer, decimal, boolean, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { flowTypeEnum } from "./enums";
import { parties } from "./parties";

export const itemCategories = pgTable("item_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(), // Category or Subcategory Name
  flowType: flowTypeEnum("flow_type"), // Optional partition scoping ('vmi', 'trading', 'supplies')
  parentId: uuid("parent_id"), // Null for Parent Category, references item_categories.id for Subcategory
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const items = pgTable("items", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: varchar("code", { length: 100 }).notNull().unique(), // Dyna-Serv Item Code / SKU
  supplierItemCode: varchar("supplier_item_code", { length: 100 }), // Supplier Item Code
  customerItemCode: varchar("customer_item_code", { length: 100 }), // Customer Item Code
  dsgcItemNumber: varchar("dsgc_item_number", { length: 100 }), // DSGC Item Number
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  barcode: varchar("barcode", { length: 100 }).notNull().unique(),
  itemType: varchar("item_type", { length: 50 }).default("standard").notNull(), // Type (raw_material, packaging, etc.)
  categoryId: uuid("category_id").references(() => itemCategories.id), // Category / Subcategory
  defaultSupplierPartyId: uuid("default_supplier_party_id").references(() => parties.id), // Supplier Party
  uom: varchar("uom", { length: 50 }).default("piece").notNull(), // UOM (piece, box, roll, meter)
  currency: varchar("currency", { length: 10 }).default("USD").notNull(), // Currency (USD, PHP)
  buyingPrice: decimal("buying_price", { precision: 12, scale: 4 }), // Buying Price (Trading buy price)
  sellingPrice: decimal("selling_price", { precision: 12, scale: 4 }), // Selling Price
  spq: integer("spq").default(1).notNull(), // Standard Packaging Quantity (pcs/roll per box)
  spqMeter: decimal("spq_meter", { precision: 10, scale: 2 }), // SPQ Meter (meters per roll)
  lengthCm: decimal("length_cm", { precision: 10, scale: 2 }), // Length (cm)
  widthCm: decimal("width_cm", { precision: 10, scale: 2 }), // Width (cm)
  heightCm: decimal("height_cm", { precision: 10, scale: 2 }), // Height (cm)
  volumeCm3: decimal("volume_cm3", { precision: 12, scale: 2 }), // Gross Volume in CM³ (Length × Width × Height)
  volumeCbm: decimal("volume_cbm", { precision: 10, scale: 4 }).notNull(), // CBM per box ((L×W×H)/1,000,000)
  boxesPerPallet: integer("boxes_per_pallet"), // No. of Boxes per Pallet
  weightKg: decimal("weight_kg", { precision: 10, scale: 3 }), // Weight in KG per box/carton
  minReorderLevel: integer("min_reorder_level").default(0).notNull(),
  isPerishable: boolean("is_perishable").default(false).notNull(), // Triggers mandatory expiry check at receiving
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  // Req 2.2: spq > 0 and volume_cbm > 0
  spqPositive: check("items_spq_positive", sql`${table.spq} > 0`),
  volumeCbmPositive: check("items_volume_cbm_positive", sql`${table.volumeCbm} > 0`),
}));

// `contracts.ts` — Contract Management & Configurable Pricing Rule Engine Schema
//
// Entities:
//   - contracts: Master contract header
//   - contract_versions: Version history for contract modifications
//   - contract_parties: Warehouse/party mappings for multi-site coverage
//   - pricing_rules: Configurable rate-card pricing rules with conditions & precedence
//   - vmi_configurations: VMI ownership, triggers, and replenishment policy
//   - trading_prices: Configurable supplier cost, selling price, and markup rules

import {
  pgTable,
  uuid,
  varchar,
  text,
  decimal,
  boolean,
  timestamp,
  date,
  integer,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { parties } from "./parties";
import { items } from "./items";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const contractStatusEnum = pgEnum("contract_status", [
  "draft",
  "pending_approval",
  "active",
  "suspended",
  "expired",
  "terminated",
]);

export const contractTypeEnum = pgEnum("contract_type", [
  "vmi",
  "trading",
  "vmi_trading",
]);

export const billingBasisEnum = pgEnum("billing_basis", [
  "cbm_day",
  "pallet",
  "carton",
  "unit",
  "transaction",
  "flat",
  "trip",
  "distance",
  "weight",
  "volume",
  "hour",
  "percentage",
]);

export const chargeCategoryEnum = pgEnum("charge_category", [
  "warehousing",
  "handling_in",
  "handling_out",
  "delivery",
  "documentation",
  "loa",
  "manpower",
  "other",
  "trading",
]);

export const inventoryOwnershipEnum = pgEnum("inventory_ownership", [
  "supplier_owned",
  "customer_owned",
  "warehouse_owned",
]);

export const billingTriggerEnum = pgEnum("billing_trigger", [
  "upon_receipt",
  "upon_consumption",
  "upon_dispatch",
  "upon_customer_confirmation",
  "monthly_settlement",
]);

export const markupTypeEnum = pgEnum("markup_type", [
  "percentage",
  "fixed_amount",
  "fixed_selling_price",
]);

// ---------------------------------------------------------------------------
// 1. contracts — Master Contract Header
// ---------------------------------------------------------------------------

export const contracts = pgTable("contracts", {
  id: uuid("id").primaryKey().defaultRandom(),
  contractNumber: varchar("contract_number", { length: 50 }).notNull().unique(),
  partyId: uuid("party_id")
    .references(() => parties.id, { onDelete: "cascade" })
    .notNull(),
  contractType: contractTypeEnum("contract_type").notNull().default("vmi_trading"),
  status: contractStatusEnum("status").notNull().default("draft"),
  effectiveDate: date("effective_date").notNull(),
  expirationDate: date("expiration_date"),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  exchangeRatePolicy: varchar("exchange_rate_policy", { length: 50 }).notNull().default("monthly_rate"),
  paymentTerms: varchar("payment_terms", { length: 100 }).notNull().default("Net 30"),
  warehousesCovered: text("warehouses_covered").default("Main Warehouse"),
  notes: text("notes"),
  createdByUserId: uuid("created_by_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  partyIdx: index("contracts_party_id_idx").on(table.partyId),
  statusIdx: index("contracts_status_idx").on(table.status),
}));

// ---------------------------------------------------------------------------
// 2. contract_versions — Immutable Version History
// ---------------------------------------------------------------------------

export const contractVersions = pgTable("contract_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  contractId: uuid("contract_id")
    .references(() => contracts.id, { onDelete: "cascade" })
    .notNull(),
  versionNumber: integer("version_number").notNull(),
  effectiveFrom: timestamp("effective_from").defaultNow().notNull(),
  effectiveTo: timestamp("effective_to"), // NULL = currently active version
  isActive: boolean("is_active").default(true).notNull(),
  changesSummary: text("changes_summary"),
  approvedByUserId: uuid("approved_by_user_id"),
  approvedAt: timestamp("approved_at"),
  createdByUserId: uuid("created_by_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  contractIdx: index("contract_versions_contract_id_idx").on(table.contractId),
}));

// ---------------------------------------------------------------------------
// 3. contract_parties — Multi-site / Multi-party mappings
// ---------------------------------------------------------------------------

export const contractParties = pgTable("contract_parties", {
  id: uuid("id").primaryKey().defaultRandom(),
  contractId: uuid("contract_id")
    .references(() => contracts.id, { onDelete: "cascade" })
    .notNull(),
  partyId: uuid("party_id")
    .references(() => parties.id, { onDelete: "cascade" })
    .notNull(),
  role: varchar("role", { length: 50 }).notNull().default("principal"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// 4. pricing_rules — Configurable Rate-Card Rules
// ---------------------------------------------------------------------------

export const pricingRules = pgTable("pricing_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  contractVersionId: uuid("contract_version_id")
    .references(() => contractVersions.id, { onDelete: "cascade" })
    .notNull(),
  chargeName: varchar("charge_name", { length: 150 }).notNull(),
  chargeCode: varchar("charge_code", { length: 50 }).notNull(),
  chargeCategory: chargeCategoryEnum("charge_category").notNull(),
  billingBasis: billingBasisEnum("billing_basis").notNull(),
  rate: decimal("rate", { precision: 12, scale: 4 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  minCharge: decimal("min_charge", { precision: 12, scale: 4 }),
  maxCharge: decimal("max_charge", { precision: 12, scale: 4 }),
  priority: integer("priority").default(0).notNull(), // higher priority wins
  isActive: boolean("is_active").default(true).notNull(),
  isTaxable: boolean("is_taxable").default(true).notNull(),
  effectiveFrom: date("effective_from"),
  expirationDate: date("expiration_date"),
  applicableWarehouse: varchar("applicable_warehouse", { length: 100 }),
  applicableCustomer: uuid("applicable_customer").references(() => parties.id),
  applicableProductCategory: varchar("applicable_product_category", { length: 100 }),
  applicableService: varchar("applicable_service", { length: 100 }),
  applicableTransactionType: varchar("applicable_transaction_type", { length: 50 }),
  conditionsJson: text("conditions_json"), // e.g. {"deliveryType": "CO-LOAD", "zone": "Cavite"}
  calculationFormula: text("calculation_formula"),
  createdByUserId: uuid("created_by_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  versionIdx: index("pricing_rules_contract_version_id_idx").on(table.contractVersionId),
  categoryIdx: index("pricing_rules_charge_category_idx").on(table.chargeCategory),
}));

// ---------------------------------------------------------------------------
// 5. vmi_configurations — Dedicated VMI Policy Configuration
// ---------------------------------------------------------------------------

export const vmiConfigurations = pgTable("vmi_configurations", {
  id: uuid("id").primaryKey().defaultRandom(),
  contractVersionId: uuid("contract_version_id")
    .references(() => contractVersions.id, { onDelete: "cascade" })
    .notNull(),
  partyId: uuid("party_id")
    .references(() => parties.id, { onDelete: "cascade" })
    .notNull(),
  inventoryOwnership: inventoryOwnershipEnum("inventory_ownership").notNull().default("supplier_owned"),
  billingTrigger: billingTriggerEnum("billing_trigger").notNull().default("upon_consumption"),
  minStock: decimal("min_stock", { precision: 12, scale: 4 }),
  maxStock: decimal("max_stock", { precision: 12, scale: 4 }),
  reorderPoint: decimal("reorder_point", { precision: 12, scale: 4 }),
  leadTimeDays: integer("lead_time_days").default(7),
  replenishmentMethod: varchar("replenishment_method", { length: 50 }).default("min_max"),
  settlementTiming: varchar("settlement_timing", { length: 50 }).default("monthly"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  versionIdx: index("vmi_configurations_contract_version_id_idx").on(table.contractVersionId),
  partyIdx: index("vmi_configurations_party_id_idx").on(table.partyId),
}));

// ---------------------------------------------------------------------------
// 6. trading_prices — Dedicated Trading Pricing Configuration
// ---------------------------------------------------------------------------

export const tradingPrices = pgTable("trading_prices", {
  id: uuid("id").primaryKey().defaultRandom(),
  contractVersionId: uuid("contract_version_id")
    .references(() => contractVersions.id, { onDelete: "cascade" })
    .notNull(),
  partyId: uuid("party_id")
    .references(() => parties.id, { onDelete: "cascade" })
    .notNull(),
  itemId: uuid("item_id")
    .references(() => items.id, { onDelete: "cascade" })
    .notNull(),
  supplierCost: decimal("supplier_cost", { precision: 12, scale: 4 }).notNull(),
  sellingPrice: decimal("selling_price", { precision: 12, scale: 4 }).notNull(),
  markupType: markupTypeEnum("markup_type").notNull().default("percentage"),
  markupValue: decimal("markup_value", { precision: 10, scale: 4 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  minOrderQuantity: decimal("min_order_quantity", { precision: 12, scale: 4 }),
  effectiveDate: date("effective_date").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdByUserId: uuid("created_by_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  versionIdx: index("trading_prices_contract_version_id_idx").on(table.contractVersionId),
  partyItemIdx: index("trading_prices_party_item_idx").on(table.partyId, table.itemId),
}));

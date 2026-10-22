// `parties` & `party_roles` — specs/01-core-data-model/design.md §1.2
import { pgTable, uuid, varchar, text, boolean, timestamp, unique, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { partyRoleEnum, rbeClassificationEnum } from "./enums";

export const parties = pgTable("parties", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  contactPerson: varchar("contact_person", { length: 255 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  taxId: varchar("tax_id", { length: 50 }),
  address1: text("address_1"),
  address2: text("address_2"),
  paymentTerms: varchar("payment_terms", { length: 100 }),
  notes: text("notes"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const partyRoles = pgTable("party_roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  partyId: uuid("party_id").references(() => parties.id, { onDelete: "cascade" }).notNull(),
  role: partyRoleEnum("role").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [unique("party_roles_party_role_unique").on(table.partyId, table.role)]);

export const partyFlowRelationships = pgTable("party_flow_relationships", {
  id: uuid("id").primaryKey().defaultRandom(),
  partyId: uuid("party_id").references(() => parties.id, { onDelete: "cascade" }).notNull(),
  relationship: varchar("relationship", { length: 40 }).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("party_flow_relationships_party_relationship_unique").on(table.partyId, table.relationship),
  check("party_flow_relationships_relationship_check", sql`${table.relationship} IN ('vmi_customer', 'trading_customer', 'trading_supplier')`),
]);

export const partyRbeClassifications = pgTable("party_rbe_classifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  partyId: uuid("party_id").references(() => parties.id, { onDelete: "cascade" }).notNull(),
  classification: rbeClassificationEnum("classification").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [unique("party_rbe_party_classification_unique").on(table.partyId, table.classification)]);

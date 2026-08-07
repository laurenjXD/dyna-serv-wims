// `parties` & `party_roles` — specs/01-core-data-model/design.md §1.2
import { pgTable, uuid, varchar, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { partyRoleEnum } from "./enums";

export const parties = pgTable("parties", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  contactPerson: varchar("contact_person", { length: 255 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  taxId: varchar("tax_id", { length: 50 }), // Tax ID / TIN
  address: text("address"),
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
});

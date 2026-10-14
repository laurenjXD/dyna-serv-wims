import { pgEnum, pgTable, uuid, varchar, text, date, timestamp, boolean, decimal, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { parties } from "./parties";

export const complianceApplicationTypeEnum = pgEnum("compliance_application_type", ["loa", "customs", "in", "out", "handling_activity", "others"]);
export const complianceApplicationStatusEnum = pgEnum("compliance_application_status", ["draft", "active", "expired", "voided"]);
export const complianceFeeCategoryEnum = pgEnum("compliance_fee_category", ["peza", "loa", "bond", "customs", "in", "out", "handling_activity", "others"]);

export const complianceApplications = pgTable("compliance_applications", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicationNumber: varchar("application_number", { length: 80 }).notNull().unique(),
  partyId: uuid("party_id").references(() => parties.id, { onDelete: "cascade" }).notNull(),
  applicationType: complianceApplicationTypeEnum("application_type").notNull(),
  status: complianceApplicationStatusEnum("status").notNull().default("draft"),
  requestedDate: date("requested_date").notNull(),
  approvedDate: date("approved_date"),
  expirationDate: date("expiration_date"),
  sourceDocumentReference: varchar("source_document_reference", { length: 255 }),
  notes: text("notes"),
  createdByUserId: uuid("created_by_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("compliance_applications_party_idx").on(table.partyId),
  index("compliance_applications_status_idx").on(table.status),
  check("compliance_applications_loa_expiration", sql`${table.applicationType} <> 'loa' OR ${table.expirationDate} IS NULL OR ${table.approvedDate} IS NULL OR ${table.expirationDate} = (${table.approvedDate} + interval '1 year' - interval '1 day')::date`),
]);

export const complianceApplicationFees = pgTable("compliance_application_fees", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicationId: uuid("application_id").references(() => complianceApplications.id, { onDelete: "cascade" }).notNull(),
  category: complianceFeeCategoryEnum("category").notNull(),
  description: varchar("description", { length: 255 }),
  amount: decimal("amount", { precision: 14, scale: 4 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("PHP"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("compliance_application_fees_application_idx").on(table.applicationId),
  check("compliance_application_fees_others_description", sql`${table.category} <> 'others' OR nullif(trim(${table.description}), '') IS NOT NULL`),
]);

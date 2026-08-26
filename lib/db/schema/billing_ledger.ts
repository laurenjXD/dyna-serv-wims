// `billing_ledger.ts` — Immutable Billing Events, Double-Entry Billing Ledger, and SOA Document Package Schema
//
// Entities:
//   - billing_events: Granular billable event log generated from operational transactions
//   - billing_ledger: Immutable financial double-entry billing ledger
//   - soas & soa_lines: Statement of Account compiled directly from posted billing ledger entries
//   - billing_document_packages: Generated PDF artifacts for the 7 supporting billing documents
//   - credit_debit_memos: Financial adjustments preserving the audit trail

import {
  pgTable,
  uuid,
  varchar,
  text,
  decimal,
  timestamp,
  date,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { parties } from "./parties";
import { contracts, contractVersions } from "./contracts";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const billingEventStatusEnum = pgEnum("billing_event_status", [
  "pending",
  "processed",
  "voided",
]);

export const ledgerEntryTypeEnum = pgEnum("ledger_entry_type", [
  "debit",
  "credit",
  "adjustment",
  "reversal",
  "void",
  "credit_memo",
  "debit_memo",
]);

export const billingPeriodStatusEnum = pgEnum("billing_period_status", [
  "draft",
  "billing_review",
  "approved",
  "posted",
  "finalized",
  "voided",
]);

export const billingDocumentTypeEnum = pgEnum("billing_document_type", [
  "soa",
  "delivery_detail",
  "loa_detail",
  "surety_bond_detail",
  "manpower_detail",
  "summary_of_charges",
  "warehousing_detail",
]);

// ---------------------------------------------------------------------------
// 1. billing_events — Operational Billable Event Log
// ---------------------------------------------------------------------------

export const billingEvents = pgTable("billing_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceTransactionId: varchar("source_transaction_id", { length: 100 }).notNull(),
  sourceTransactionType: varchar("source_transaction_type", { length: 50 }).notNull(), // 'receiving','storage','picking','delivery','pod','loa','manpower','vmi_consumption','trading_sale'
  contractId: uuid("contract_id").references(() => contracts.id),
  contractVersionId: uuid("contract_version_id").references(() => contractVersions.id),
  partyId: uuid("party_id")
    .references(() => parties.id, { onDelete: "cascade" })
    .notNull(),
  chargeCategory: varchar("charge_category", { length: 50 }).notNull(),
  quantity: decimal("quantity", { precision: 12, scale: 4 }).notNull(),
  unit: varchar("unit", { length: 30 }).notNull(),
  rate: decimal("rate", { precision: 12, scale: 4 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  amountUsd: decimal("amount_usd", { precision: 14, scale: 4 }).notNull(),
  taxAmountUsd: decimal("tax_amount_usd", { precision: 14, scale: 4 }).default("0.0000"),
  billingPeriodId: uuid("billing_period_id"),
  status: billingEventStatusEnum("status").notNull().default("pending"),
  createdByUserId: uuid("created_by_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  partyIdx: index("billing_events_party_id_idx").on(table.partyId),
  sourceIdx: index("billing_events_source_idx").on(table.sourceTransactionId, table.sourceTransactionType),
  statusIdx: index("billing_events_status_idx").on(table.status),
}));

// ---------------------------------------------------------------------------
// 2. billing_ledger — Immutable Double-Entry Billing Ledger
// ---------------------------------------------------------------------------

export const billingLedger = pgTable("billing_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  entryDate: date("entry_date").notNull(),
  referenceNumber: varchar("reference_number", { length: 100 }).notNull(),
  partyId: uuid("party_id")
    .references(() => parties.id, { onDelete: "cascade" })
    .notNull(),
  contractId: uuid("contract_id").references(() => contracts.id),
  billingEventId: uuid("billing_event_id").references(() => billingEvents.id),
  entryType: ledgerEntryTypeEnum("entry_type").notNull(),
  chargeCategory: varchar("charge_category", { length: 50 }).notNull(),
  debitAmountUsd: decimal("debit_amount_usd", { precision: 14, scale: 4 }).notNull().default("0.0000"),
  creditAmountUsd: decimal("credit_amount_usd", { precision: 14, scale: 4 }).notNull().default("0.0000"),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  exchangeRate: decimal("exchange_rate", { precision: 10, scale: 4 }).notNull().default("1.0000"),
  notes: text("notes"),
  billingPeriodId: uuid("billing_period_id"),
  lockedAt: timestamp("locked_at"),
  createdByUserId: uuid("created_by_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  partyIdx: index("billing_ledger_party_id_idx").on(table.partyId),
  dateIdx: index("billing_ledger_entry_date_idx").on(table.entryDate),
  periodIdx: index("billing_ledger_period_id_idx").on(table.billingPeriodId),
}));

// ---------------------------------------------------------------------------
// 3. soas & soa_lines — Statement of Account Header and Itemized Lines
// ---------------------------------------------------------------------------

export const soas = pgTable("soas", {
  id: uuid("id").primaryKey().defaultRandom(),
  soaNumber: varchar("soa_number", { length: 50 }).notNull().unique(),
  partyId: uuid("party_id")
    .references(() => parties.id, { onDelete: "cascade" })
    .notNull(),
  contractId: uuid("contract_id")
    .references(() => contracts.id)
    .notNull(),
  billingPeriodId: uuid("billing_period_id").notNull(),
  issueDate: date("issue_date").notNull(),
  dueDate: date("due_date").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  exchangeRate: decimal("exchange_rate", { precision: 10, scale: 4 }).notNull(),
  openingBalanceUsd: decimal("opening_balance_usd", { precision: 14, scale: 4 }).notNull(),
  currentChargesUsd: decimal("current_charges_usd", { precision: 14, scale: 4 }).notNull(),
  debitAdjustmentsUsd: decimal("debit_adjustments_usd", { precision: 14, scale: 4 }).notNull().default("0.0000"),
  creditsUsd: decimal("credits_usd", { precision: 14, scale: 4 }).notNull().default("0.0000"),
  paymentsAppliedUsd: decimal("payments_applied_usd", { precision: 14, scale: 4 }).notNull().default("0.0000"),
  outstandingBalanceUsd: decimal("outstanding_balance_usd", { precision: 14, scale: 4 }).notNull(),
  status: varchar("status", { length: 30 }).notNull().default("draft"),
  generatedByUserId: uuid("generated_by_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  partyIdx: index("soas_party_id_idx").on(table.partyId),
  periodIdx: index("soas_billing_period_id_idx").on(table.billingPeriodId),
}));

export const soaLines = pgTable("soa_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  soaId: uuid("soa_id")
    .references(() => soas.id, { onDelete: "cascade" })
    .notNull(),
  chargeCategory: varchar("charge_category", { length: 50 }).notNull(),
  description: text("description").notNull(),
  amountUsd: decimal("amount_usd", { precision: 14, scale: 4 }).notNull(),
  ledgerEntryId: uuid("ledger_entry_id").references(() => billingLedger.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  soaIdx: index("soa_lines_soa_id_idx").on(table.soaId),
}));

// ---------------------------------------------------------------------------
// 4. billing_document_packages — Supporting Billing Document Package
// ---------------------------------------------------------------------------

export const billingDocumentPackages = pgTable("billing_document_packages", {
  id: uuid("id").primaryKey().defaultRandom(),
  soaId: uuid("soa_id")
    .references(() => soas.id, { onDelete: "cascade" })
    .notNull(),
  documentType: billingDocumentTypeEnum("document_type").notNull(),
  documentNumber: varchar("document_number", { length: 50 }).notNull(),
  generatedFileUrl: text("generated_file_url"),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  generatedByUserId: uuid("generated_by_user_id").notNull(),
}, (table) => ({
  soaIdx: index("billing_document_packages_soa_id_idx").on(table.soaId),
}));

// ---------------------------------------------------------------------------
// 5. credit_debit_memos — Financial Credit and Debit Memos
// ---------------------------------------------------------------------------

export const creditDebitMemos = pgTable("credit_debit_memos", {
  id: uuid("id").primaryKey().defaultRandom(),
  memoNumber: varchar("memo_number", { length: 50 }).notNull().unique(),
  partyId: uuid("party_id")
    .references(() => parties.id, { onDelete: "cascade" })
    .notNull(),
  contractId: uuid("contract_id").references(() => contracts.id),
  billingPeriodId: uuid("billing_period_id"),
  type: varchar("type", { length: 20 }).notNull(), // 'credit_memo' | 'debit_memo'
  amountUsd: decimal("amount_usd", { precision: 14, scale: 4 }).notNull(),
  reason: text("reason").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("issued"),
  issuedByUserId: uuid("issued_by_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  partyIdx: index("credit_debit_memos_party_id_idx").on(table.partyId),
}));

// One-time workbook migration staging and provenance.
// Canonical inventory remains in lots, lot_location_balances, and
// inventory_transactions; these tables are not an alternate stock ledger.
import { pgTable, uuid, varchar, text, date, timestamp, jsonb, integer, index } from "drizzle-orm/pg-core";
import { flowTypeEnum } from "./enums";

export const migrationBatches = pgTable("migration_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationName: varchar("organization_name", { length: 255 }).notNull(),
  flowType: flowTypeEnum("flow_type").notNull(),
  profileKey: varchar("profile_key", { length: 100 }).notNull(),
  openingDate: date("opening_date").notNull(),
  sourceFileName: varchar("source_file_name", { length: 255 }).notNull(),
  sourceFileHash: varchar("source_file_hash", { length: 128 }).notNull(),
  sourceFileUrl: text("source_file_url"),
  status: varchar("status", { length: 30 }).notNull().default("uploaded"),
  uploadedByUserId: uuid("uploaded_by_user_id").notNull(),
  approvedByUserId: uuid("approved_by_user_id"),
  committedAt: timestamp("committed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  sourceHashIdx: index("migration_batches_source_hash_idx").on(table.sourceFileHash),
  statusIdx: index("migration_batches_status_idx").on(table.status),
}));

export const migrationSourceRows = pgTable("migration_source_rows", {
  id: uuid("id").primaryKey().defaultRandom(),
  batchId: uuid("batch_id").references(() => migrationBatches.id, { onDelete: "cascade" }).notNull(),
  sheetName: varchar("sheet_name", { length: 255 }).notNull(),
  sourceRowNumber: integer("source_row_number").notNull(),
  rowKey: varchar("row_key", { length: 255 }),
  phase: varchar("phase", { length: 40 }).notNull(),
  status: varchar("status", { length: 30 }).notNull().default("staged"),
  rawData: jsonb("raw_data").notNull(),
  normalizedData: jsonb("normalized_data"),
  validationErrors: jsonb("validation_errors"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  batchSheetRowIdx: index("migration_source_rows_batch_sheet_row_idx").on(table.batchId, table.sheetName, table.sourceRowNumber),
  batchPhaseIdx: index("migration_source_rows_batch_phase_idx").on(table.batchId, table.phase),
}));

export const migrationExceptions = pgTable("migration_exceptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  batchId: uuid("batch_id").references(() => migrationBatches.id, { onDelete: "cascade" }).notNull(),
  sourceRowId: uuid("source_row_id").references(() => migrationSourceRows.id, { onDelete: "cascade" }),
  severity: varchar("severity", { length: 20 }).notNull(),
  code: varchar("code", { length: 80 }).notNull(),
  message: text("message").notNull(),
  resolutionStatus: varchar("resolution_status", { length: 30 }).notNull().default("open"),
  resolutionCategory: varchar("resolution_category", { length: 80 }),
  resolutionNote: text("resolution_note"),
  resolvedByUserId: uuid("resolved_by_user_id"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  batchStatusIdx: index("migration_exceptions_batch_status_idx").on(table.batchId, table.resolutionStatus),
}));

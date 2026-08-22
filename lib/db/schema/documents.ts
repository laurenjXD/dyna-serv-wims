// `generated_documents` & `document_events` — specs/10-pick-list-and-acknowledgement-receipt/design.md §2
//
// The document projection layer is an immutable snapshot store. A generated
// document is never mutated in-place; corrections create a new superseding
// document row. document_events is append-only — no UPDATE or DELETE.
//
// document_number_sequences is not modelled here: it is a pure implementation
// detail accessed only through the generate_document_number() SECURITY DEFINER
// function and carries no RLS, no Drizzle-level access, and no application FK.
//
// status values:   'pending' | 'generating' | 'ready' | 'failed' | 'voided'
// document_type:   'pick_list' | 'acknowledgement_receipt'
// source_type:     'inventory_commitment' | 'inventory_transaction'
// event_type:      'generated' | 'printed' | 'reprinted' | 'failed' | 'superseded'
//
// document_type -> source_type mapping (2026-08-20 correction — see
// specs/00-steering/revision-log.md): both 'pick_list' and
// 'acknowledgement_receipt' now map to source_type 'inventory_commitment'
// (source_id = inventory_commitments.id). Multi-line dispatch support
// (dispatchPickList inserting one inventory_transactions row per pick-list
// line, matching Stage 1's already-established pattern) means there is no
// longer a single canonical inventory_transactions row to reference for an
// acknowledgement_receipt covering a whole dispatch — one
// inventory_commitments row already represents one whole dispatch event
// (all its lines), so both document types key off it. The
// 'inventory_transaction' source_type value remains in the CHECK
// constraint below for backward compatibility with any already-generated
// rows written under the prior contract; new rows should never use it.
//
// Plain text columns are used for status/type/event_type (same discipline as
// transfers.ts) with SQL-level CHECK constraints declared in the migration.
import {
  pgTable,
  uuid,
  text,
  bigint,
  jsonb,
  timestamp,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// generated_documents
// ---------------------------------------------------------------------------

export const generatedDocuments = pgTable(
  "generated_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentType: text("document_type").notNull(),
    documentNumber: text("document_number").notNull().unique(),
    templateVersion: text("template_version").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    snapshotHash: text("snapshot_hash").notNull(), // SHA-256 of serialized line data
    artifactPath: text("artifact_path"),           // Storage path; null while generating
    mimeType: text("mime_type").default("application/pdf"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    status: text("status").notNull().default("pending"),
    // Self-referential FK — supersession creates a new row pointing back at the
    // voided original; in-place mutation is never permitted (design.md §7.3).
    supersedesId: uuid("supersedes_id").references(
      (): AnyPgColumn => generatedDocuments.id,
    ),
    supersessionReason: text("supersession_reason"),
    currency: text("currency").notNull().default("PHP"),
    // created_by references auth.users; Drizzle cannot import the auth schema
    // directly — FK is declared in the migration. The column is nullable because
    // system executors set system_executor instead of created_by.
    createdBy: uuid("created_by"),
    systemExecutor: text("system_executor"),
    correlationId: uuid("correlation_id"),
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    documentTypeCheck: check(
      "generated_documents_type_check",
      sql`${table.documentType} IN ('pick_list', 'acknowledgement_receipt')`,
    ),
    sourceTypeCheck: check(
      "generated_documents_source_type_check",
      sql`${table.sourceType} IN ('inventory_commitment', 'inventory_transaction')`,
    ),
    statusCheck: check(
      "generated_documents_status_check",
      sql`${table.status} IN ('pending', 'generating', 'ready', 'failed', 'voided')`,
    ),
    // supersession_reason is mandatory when supersedes_id is set (design.md §7.3).
    supersessionReasonCheck: check(
      "generated_documents_supersession_reason_check",
      sql`${table.supersedesId} IS NULL OR ${table.supersessionReason} IS NOT NULL`,
    ),
  }),
);

// ---------------------------------------------------------------------------
// document_events (append-only)
// ---------------------------------------------------------------------------

export const documentEvents = pgTable(
  "document_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .references(() => generatedDocuments.id)
      .notNull(),
    eventType: text("event_type").notNull(),
    // actor_id references auth.users; FK declared in migration (same pattern as
    // created_by above — Drizzle does not import the auth schema directly).
    actorId: uuid("actor_id"),
    systemExecutor: text("system_executor"),
    // Untyped jsonb payload: safe_printer/operation details, error codes, etc.
    metadata: jsonb("metadata"),
    correlationId: uuid("correlation_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    eventTypeCheck: check(
      "document_events_event_type_check",
      sql`${table.eventType} IN ('generated', 'printed', 'reprinted', 'failed', 'superseded')`,
    ),
  }),
);

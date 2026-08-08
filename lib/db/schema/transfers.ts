// `transfer_requests`, `transfer_lines`, `inspection_cases`, `inspection_evidence`,
// `inspection_dispositions` — specs/11-transfer-and-inspection/design.md §2
//
// Transfer-owned persistence and shared inspection records used across inbound
// (07) and transfer (11) contexts.
//
// inspectionCases.sourceRefId uses a polymorphic reference pattern validated at
// the application layer; there is no cross-table DB FK across the three possible
// targets (wrr_items.id or transfer_lines.id). See design.md §2.
//
// SPQ-multiple enforcement is application-layer (08's allocation engine), not a
// DB constraint — same discipline as lot_location_balances.
import {
  pgTable,
  uuid,
  text,
  numeric,
  boolean,
  integer,
  timestamp,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { flowTypeEnum } from "./enums";
import { locations } from "./locations";
import { lots } from "./lots";
import { items } from "./items";
import { parties } from "./parties";
import { lotLocationBalances } from "./lot_location_balances";
import { approvalRequests } from "./approvals";

// ---------------------------------------------------------------------------
// transfer_requests
// ---------------------------------------------------------------------------

export const transferRequests = pgTable(
  "transfer_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromLocationId: uuid("from_location_id")
      .references(() => locations.id)
      .notNull(),
    toLocationId: uuid("to_location_id")
      .references(() => locations.id)
      .notNull(),
    flowType: flowTypeEnum("flow_type").notNull(),
    // Plain text column; CHECK constraint is SQL-level only (see migration 0013).
    status: text("status").notNull().default("staged"),
    reference: text("reference"),
    reason: text("reason"),
    requiresApproval: boolean("requires_approval").notNull().default(false),
    approvalRequestId: uuid("approval_request_id").references(
      () => approvalRequests.id,
    ),
    version: integer("version").notNull().default(1),
    requestedBy: uuid("requested_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    correlationId: uuid("correlation_id"),
  },
  (table) => ({
    statusValid: check(
      "status_valid",
      sql`${table.status} IN ('staged', 'in_progress', 'completed', 'cancelled')`,
    ),
  }),
);

// ---------------------------------------------------------------------------
// transfer_lines
// ---------------------------------------------------------------------------

export const transferLines = pgTable(
  "transfer_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transferRequestId: uuid("transfer_request_id")
      .references(() => transferRequests.id)
      .notNull(),
    lotId: uuid("lot_id")
      .references(() => lots.id)
      .notNull(),
    itemId: uuid("item_id")
      .references(() => items.id)
      .notNull(),
    qtyRequested: numeric("qty_requested").notNull(),
    qtyTransferred: numeric("qty_transferred").notNull().default("0"),
    // Plain text column; CHECK constraint is SQL-level only (see migration 0013).
    status: text("status").notNull().default("pending"),
    // Nullable — set when this line enters transfer inspection. Polymorphic
    // reference to inspection_cases.id; no DB FK to avoid circular dependency.
    inspectionCaseId: uuid("inspection_case_id"),
  },
  (table) => ({
    statusValid: check(
      "status_valid",
      sql`${table.status} IN ('pending', 'in_transit', 'completed', 'cancelled')`,
    ),
  }),
);

// ---------------------------------------------------------------------------
// inspection_cases
// ---------------------------------------------------------------------------

export const inspectionCases = pgTable(
  "inspection_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // 'inbound' | 'transfer' — distinguishes 07 vs 11 context.
    contextType: text("context_type").notNull(),
    // 'wrr_item' | 'transfer_line' — polymorphic discriminator.
    sourceRefType: text("source_ref_type").notNull(),
    // Points to wrr_items.id or transfer_lines.id — validated at app layer.
    sourceRefId: uuid("source_ref_id").notNull(),
    lotId: uuid("lot_id")
      .references(() => lots.id)
      .notNull(),
    itemId: uuid("item_id")
      .references(() => items.id)
      .notNull(),
    partyId: uuid("party_id")
      .references(() => parties.id)
      .notNull(),
    flowType: flowTypeEnum("flow_type").notNull(),
    // Plain text column; CHECK constraint is SQL-level only (see migration 0013).
    status: text("status").notNull().default("open"),
    openedBy: uuid("opened_by").notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    resolvedBy: uuid("resolved_by"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => ({
    statusValid: check(
      "status_valid",
      sql`${table.status} IN ('open', 'passed', 'failed', 'cancelled')`,
    ),
    contextTypeValid: check(
      "context_type_valid",
      sql`${table.contextType} IN ('inbound', 'transfer')`,
    ),
    sourceRefTypeValid: check(
      "source_ref_type_valid",
      sql`${table.sourceRefType} IN ('wrr_item', 'transfer_line')`,
    ),
  }),
);

// ---------------------------------------------------------------------------
// inspection_evidence
// ---------------------------------------------------------------------------

export const inspectionEvidence = pgTable(
  "inspection_evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inspectionCaseId: uuid("inspection_case_id")
      .references(() => inspectionCases.id)
      .notNull(),
    // 'photo' | 'note' | 'measurement' — CHECK constraint in migration 0013.
    evidenceType: text("evidence_type").notNull(),
    // Storage object URL for photo; free text for note; structured JSON for measurement.
    payload: text("payload").notNull(),
    capturedBy: uuid("captured_by").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    evidenceTypeValid: check(
      "evidence_type_valid",
      sql`${table.evidenceType} IN ('photo', 'note', 'measurement')`,
    ),
  }),
);

// ---------------------------------------------------------------------------
// inspection_dispositions
// ---------------------------------------------------------------------------

export const inspectionDispositions = pgTable(
  "inspection_dispositions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inspectionCaseId: uuid("inspection_case_id")
      .references(() => inspectionCases.id)
      .notNull(),
    // See design.md §6.3 for full disposition type table with balance effects.
    dispositionType: text("disposition_type").notNull(),
    quantityAffected: numeric("quantity_affected").notNull(),
    // Nullable: null for dispositions with no immediate balance effect (e.g. 'hold').
    lotLocationBalanceId: uuid("lot_location_balance_id").references(
      () => lotLocationBalances.id,
    ),
    notes: text("notes"),
    appliedBy: uuid("applied_by").notNull(),
    appliedAt: timestamp("applied_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    dispositionTypeValid: check(
      "disposition_type_valid",
      sql`${table.dispositionType} IN ('store', 'quarantine', 'return_to_party', 'hold', 'write_off', 'return_to_stock', 'reject', 'return_to_origin')`,
    ),
  }),
);

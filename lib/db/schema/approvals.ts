// `approval_requests` & `approval_decisions` — specs/09-approval-queue/design.md §3
//
// approval_requests: one durable row per submitted approval request.
//   - request_number is DB-generated from a sequence (DEFAULT in SQL migration);
//     application code must omit this field on INSERT and let the DB fill it.
//   - idempotency_key is caller-supplied and UNIQUE; duplicate submissions with
//     the same key are rejected at the DB constraint, not silently de-duped.
//   - target_snapshot holds the typed workflow snapshot (FifoOverrideSnapshot
//     for fifo_override) frozen at request time; never mutated after insert.
//   - expiry_at is set to now() + 30 minutes at request-creation time by the
//     server command (design.md §5).
//
// approval_decisions: append-only record of each reviewer decision.
//   - No updated_at column — this table is never updated by ordinary sessions.
//   - consumed_at / consumer_workflow / resulting_reference are set exactly once
//     by the Stage 1 commitment transaction (service-role); ordinary
//     authenticated sessions have no UPDATE grant (0010_approval_rls_policies.sql).
//   - Self-approval prevention is enforced at both RLS (WITH CHECK) and app layer.
//
// SPQ-multiple enforcement and stale-target checks: application-layer (08's
// allocation engine), not DB constraints — same discipline as lot_location_balances.
import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { approvalRequestStatusEnum } from "./enums";
import { parties } from "./parties";

export const approvalRequests = pgTable(
  "approval_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // DB-generated from approval_request_number_seq; do not supply on INSERT.
    requestNumber: text("request_number").notNull().unique(),
    // Caller-supplied; UNIQUE prevents duplicate pending submissions.
    idempotencyKey: text("idempotency_key").notNull().unique(),
    // 'fifo_override' for v1; future types registered per design.md §5 gate.
    approvalType: text("approval_type").notNull(),
    requestedAction: text("requested_action").notNull(),
    targetResourceType: text("target_resource_type").notNull(),
    targetResourceId: uuid("target_resource_id").notNull(),
    // Frozen workflow snapshot (FifoOverrideSnapshot). Never mutated post-insert.
    targetSnapshot: jsonb("target_snapshot").notNull(),
    // Nullable: VMI requests are party-scoped; global/internal requests are NULL.
    partyId: uuid("party_id").references(() => parties.id),
    // auth.users UID of the requesting user.
    requesterUserId: uuid("requester_user_id").notNull(),
    // Business justification; minimum 10 chars (CHECK in SQL migration).
    reason: text("reason").notNull(),
    status: approvalRequestStatusEnum("status").default("pending").notNull(),
    // Set to now() + 30 min at creation time per design.md §5.
    expiryAt: timestamp("expiry_at", { withTimezone: true }).notNull(),
    // Optional tracing fields.
    correlationId: uuid("correlation_id"),
    sourceCommand: text("source_command"),
    sourceReference: text("source_reference"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    // Kept current by the set_approval_requests_updated_at trigger (0009 SQL).
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    reasonMinLength: check(
      "reason_min_length",
      sql`char_length(${table.reason}) >= 10`
    ),
  })
);

export const approvalDecisions = pgTable(
  "approval_decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .references(() => approvalRequests.id)
      .notNull(),
    // auth.users UID of the reviewer who made this decision.
    reviewerUserId: uuid("reviewer_user_id").notNull(),
    // 'approved' | 'rejected'; CHECK constraint in SQL migration.
    outcome: text("outcome").notNull(),
    // Reviewer justification. Required by policy for rejections.
    reason: text("reason"),
    decidedAt: timestamp("decided_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    // Set atomically by the Stage 1 commitment transaction. NULL = unconsumed.
    // Service-role only; ordinary authenticated sessions cannot update this.
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    // Which workflow consumed this decision (e.g. 'fifo_override_commitment').
    consumerWorkflow: text("consumer_workflow"),
    // Consuming workflow's output reference (e.g. pick-list ID, commitment ID).
    resultingReference: text("resulting_reference"),
    correlationId: uuid("correlation_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    // No updatedAt — append-only table; consumed_at is set once by service-role.
  },
  (table) => ({
    outcomeValid: check(
      "outcome_valid",
      sql`${table.outcome} IN ('approved', 'rejected')`
    ),
  })
);

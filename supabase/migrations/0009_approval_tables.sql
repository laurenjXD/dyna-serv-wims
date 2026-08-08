-- specs/09-approval-queue/design.md §3 (persistence model) and §5 (lifecycle)
--
-- Two tables:
--   1. approval_requests  — one row per pending or terminal request, with
--      idempotency_key UNIQUE preventing duplicate pending submissions.
--   2. approval_decisions — append-only record of each reviewer decision,
--      including the one-time consumption marker (consumed_at) set atomically
--      by the Stage 1 commitment transaction in 08's pick-list generation path.
--
-- Enum: approval_request_status — named per design.md §5; never free text.
-- Sequence: approval_request_number_seq — human-readable reference, DB-owned.
--
-- updated_at trigger function: not present in the Drizzle-generated migrations
-- before this one (0001–0008 used only DEFAULT now(), which does not fire on
-- UPDATE). Defined here as CREATE OR REPLACE so later migrations reusing the
-- same function do not re-declare it.
--
-- Indexes follow design.md §3 on pending-queue access patterns:
--   type/status/expiry, requester, party scope, target resource, unconsumed
--   approvals, reviewer.
--
-- Self-approval prevention is applied at DB level in 0010's RLS INSERT
-- WITH CHECK for approval_decisions, and redundantly in the server command
-- layer per design.md §5.

-- ===========================================================================
-- 1. Enum.
-- ===========================================================================

CREATE TYPE "public"."approval_request_status" AS ENUM(
  'pending',
  'approved',
  'rejected',
  'cancelled',
  'expired',
  'superseded'
);
--> statement-breakpoint

-- ===========================================================================
-- 2. Sequence for human-readable request numbers.
-- ===========================================================================

CREATE SEQUENCE approval_request_number_seq START 1;
--> statement-breakpoint

-- ===========================================================================
-- 3. updated_at trigger function — defined here; reused by future migrations
--    via CREATE TRIGGER ... EXECUTE FUNCTION public.set_updated_at().
--    CREATE OR REPLACE so the function is idempotent across re-runs.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint

-- ===========================================================================
-- 4. approval_requests.
-- ===========================================================================

CREATE TABLE "approval_requests" (
  "id"                   uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  -- Human-readable reference, DB-generated from sequence; app must never
  -- supply this column on INSERT (DB DEFAULT provides it).
  "request_number"       text NOT NULL UNIQUE
                           DEFAULT ('AR-' || lpad(nextval('approval_request_number_seq')::text, 6, '0')),
  -- Caller-supplied idempotency key; UNIQUE prevents duplicate pending
  -- submissions from replayed or retried requests.
  "idempotency_key"      text NOT NULL UNIQUE,
  -- 'fifo_override' for v1; fail-closed to unknown types at app layer
  -- (design.md §5 policy registry).
  "approval_type"        text NOT NULL,
  "requested_action"     text NOT NULL,
  "target_resource_type" text NOT NULL,
  "target_resource_id"   uuid NOT NULL,
  -- Typed snapshot of the target at request time (FifoOverrideSnapshot for
  -- fifo_override). Used for stale-target detection and audit — never mutated.
  "target_snapshot"      jsonb NOT NULL,
  -- Nullable: scoped to a party for VMI requests; NULL for global/internal.
  "party_id"             uuid REFERENCES public.parties(id),
  -- auth.users UID of the requesting user (warehouse_staff or supervisor).
  "requester_user_id"    uuid NOT NULL,
  -- Business justification; minimum 10 chars enforced at DB layer.
  "reason"               text NOT NULL CONSTRAINT reason_min_length CHECK (char_length("reason") >= 10),
  "status"               "approval_request_status" NOT NULL DEFAULT 'pending',
  -- Design.md §5: 30-minute default expiry, set at request-creation time.
  "expiry_at"            timestamptz NOT NULL,
  -- Optional tracing fields for correlation across services/commands.
  "correlation_id"       uuid,
  "source_command"       text,
  "source_reference"     text,
  "created_at"           timestamptz NOT NULL DEFAULT now(),
  "updated_at"           timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE TRIGGER set_approval_requests_updated_at
  BEFORE UPDATE ON public.approval_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint

-- ===========================================================================
-- 5. approval_decisions — append-only.
--
-- No UPDATE or DELETE by ordinary (authenticated) users — RLS policy 0010
-- grants no UPDATE to `authenticated` (service-role consumes decisions via
-- the consumed_at / consumer_workflow / resulting_reference fields, which
-- bypasses RLS). Application layer must never issue DELETE on this table.
-- ===========================================================================

CREATE TABLE "approval_decisions" (
  "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "request_id"         uuid NOT NULL REFERENCES public.approval_requests(id),
  -- auth.users UID of the reviewer (supervisor with fifo_override.approve).
  "reviewer_user_id"   uuid NOT NULL,
  -- Terminal outcome; constrained to two valid values.
  "outcome"            text NOT NULL CONSTRAINT outcome_valid CHECK ("outcome" IN ('approved', 'rejected')),
  -- Reviewer-provided justification (required by policy for rejections;
  -- recommended for approvals). NULL only if policy permits an omission.
  "reason"             text,
  "decided_at"         timestamptz NOT NULL DEFAULT now(),
  -- Consumption marker: set atomically by the Stage 1 commitment transaction
  -- in pick-list generation; NULL = decision not yet consumed. One-time only
  -- (design.md §3).
  "consumed_at"        timestamptz,
  -- Which workflow consumed this decision (e.g. 'fifo_override_commitment').
  "consumer_workflow"  text,
  -- Output reference from the consuming workflow (e.g. pick-list ID or
  -- commitment ID as text).
  "resulting_reference" text,
  "correlation_id"     uuid,
  "created_at"         timestamptz NOT NULL DEFAULT now()
  -- No updated_at: this table is append-only. consumed_at / consumer_workflow
  -- / resulting_reference are set exactly once by service-role.
);
--> statement-breakpoint

-- ===========================================================================
-- 6. Indexes.
-- ===========================================================================

-- approval_requests: pending queue access patterns.
CREATE INDEX idx_approval_requests_status
  ON public.approval_requests(status);
--> statement-breakpoint
CREATE INDEX idx_approval_requests_type_status
  ON public.approval_requests(approval_type, status);
--> statement-breakpoint
CREATE INDEX idx_approval_requests_requester
  ON public.approval_requests(requester_user_id);
--> statement-breakpoint
-- Partial: party_id is nullable; only index non-null values (VMI-scoped
-- requests).
CREATE INDEX idx_approval_requests_party
  ON public.approval_requests(party_id)
  WHERE party_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX idx_approval_requests_target
  ON public.approval_requests(target_resource_id);
--> statement-breakpoint
-- Partial: expiry staleness scan; only pending rows need expiry attention.
CREATE INDEX idx_approval_requests_expiry
  ON public.approval_requests(expiry_at)
  WHERE status = 'pending';
--> statement-breakpoint

-- approval_decisions: lookup by request, reviewer, and unconsumed approvals.
CREATE INDEX idx_approval_decisions_request
  ON public.approval_decisions(request_id);
--> statement-breakpoint
CREATE INDEX idx_approval_decisions_reviewer
  ON public.approval_decisions(reviewer_user_id);
--> statement-breakpoint
-- Partial: Stage 1 commitment path looks up exactly the unconsumed approved
-- decision for a given request.
CREATE INDEX idx_approval_decisions_unconsumed
  ON public.approval_decisions(request_id)
  WHERE consumed_at IS NULL AND outcome = 'approved';
--> statement-breakpoint

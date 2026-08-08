-- specs/09-approval-queue/design.md §6 (authorization) and §4 (RBAC)
--
-- RLS policies for approval_requests and approval_decisions.
-- Follows the same pattern as 0008_rls_policies.sql throughout:
--   - rbac_internal.has_permission(resource, action, scope_kind) for
--     capability checks.
--   - auth.uid() for actor identity.
--   - FORCE ROW LEVEL SECURITY so table owner is also subject to RLS.
--   - Explicit narrow GRANT per §7.1 ("no broad authenticated table
--     privileges beyond those required by explicit policies").
--   - No DELETE policy on either table — denied by default.
--
-- Capabilities used (seeded in 0005_rbac_constraints_and_seed.sql §3.2):
--   'fifo_override', 'request', 'global' — warehouse_staff + supervisor
--   'fifo_override', 'approve', 'global' — supervisor only
--
-- Self-approval prevention (design.md §5): enforced at DB level via the
-- approval_decisions INSERT policy's WITH CHECK subquery, which verifies
-- auth.uid() != the linked request's requester_user_id. The server command
-- layer applies the same check redundantly (defense in depth).

-- ===========================================================================
-- 1. Enable RLS.
-- ===========================================================================

ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_requests FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE public.approval_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_decisions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- ===========================================================================
-- 2. approval_requests policies.
-- ===========================================================================

-- SELECT: a request is visible to its requester OR to any user who holds
-- fifo_override.approve (reviewers must see all pending requests for their
-- approval type regardless of requester identity).
CREATE POLICY approval_requests_select_requester ON public.approval_requests
  FOR SELECT TO authenticated
  USING (requester_user_id = auth.uid());
--> statement-breakpoint

CREATE POLICY approval_requests_select_reviewer ON public.approval_requests
  FOR SELECT TO authenticated
  USING (rbac_internal.has_permission('fifo_override', 'approve', 'global'));
--> statement-breakpoint

-- INSERT: user must hold fifo_override.request. The WITH CHECK also requires
-- that requester_user_id matches auth.uid() — callers cannot impersonate a
-- different requester.
CREATE POLICY approval_requests_insert ON public.approval_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('fifo_override', 'request', 'global')
    AND requester_user_id = auth.uid()
  );
--> statement-breakpoint

-- UPDATE: only the original requester may update a pending request, and the
-- only permitted status transition is to 'cancelled' (self-cancellation).
-- All other transitions (approved, rejected, expired, superseded) are
-- performed by service-role (which bypasses RLS) and are not granted here.
-- USING guards which rows the caller may touch; WITH CHECK constrains the
-- allowed post-update state.
CREATE POLICY approval_requests_update_requester ON public.approval_requests
  FOR UPDATE TO authenticated
  USING (
    requester_user_id = auth.uid()
    AND status = 'pending'
  )
  WITH CHECK (
    requester_user_id = auth.uid()
    AND status = 'cancelled'
  );
--> statement-breakpoint

-- DELETE: intentionally absent — denied by default for all authenticated
-- sessions. Approval requests are permanent audit records.

-- ===========================================================================
-- 3. approval_decisions policies.
-- ===========================================================================

-- SELECT: visible to the reviewer who made the decision, to the original
-- requester (via one-hop join), or to any user with fifo_override.approve.
CREATE POLICY approval_decisions_select_reviewer ON public.approval_decisions
  FOR SELECT TO authenticated
  USING (reviewer_user_id = auth.uid());
--> statement-breakpoint

CREATE POLICY approval_decisions_select_requester ON public.approval_decisions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.approval_requests ar
      WHERE ar.id = approval_decisions.request_id
        AND ar.requester_user_id = auth.uid()
    )
  );
--> statement-breakpoint

CREATE POLICY approval_decisions_select_approver ON public.approval_decisions
  FOR SELECT TO authenticated
  USING (rbac_internal.has_permission('fifo_override', 'approve', 'global'));
--> statement-breakpoint

-- INSERT: user must hold fifo_override.approve AND must not be the requester
-- of the linked request (self-approval prevention, design.md §5). Also
-- enforces that the reviewer_user_id on the inserted row is the current user
-- — callers cannot record a decision attributed to a different reviewer.
CREATE POLICY approval_decisions_insert ON public.approval_decisions
  FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('fifo_override', 'approve', 'global')
    AND reviewer_user_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM public.approval_requests ar
      WHERE ar.id = request_id
        AND ar.requester_user_id = auth.uid()
    )
  );
--> statement-breakpoint

-- UPDATE: no policy for authenticated — denied by default. The consumed_at /
-- consumer_workflow / resulting_reference columns are updated exactly once by
-- the Stage 1 commitment transaction running as service-role (which bypasses
-- RLS). Ordinary authenticated sessions may never mutate decision rows.

-- DELETE: intentionally absent — denied by default for all authenticated
-- sessions. approval_decisions is an append-only historical record.

-- ===========================================================================
-- 4. Narrow table-level grants to `authenticated`, matching the policies
--    above exactly (design.md §7.1 via 0008's established discipline).
--    No UPDATE grant on approval_decisions — service-role is the only writer
--    for the consumed_at / consumer_workflow / resulting_reference update path.
--    INSERT is granted so reviewers can record decisions through the RLS policy.
-- ===========================================================================

GRANT SELECT ON public.approval_requests TO authenticated;
--> statement-breakpoint
GRANT INSERT ON public.approval_requests TO authenticated;
--> statement-breakpoint
GRANT UPDATE ON public.approval_requests TO authenticated;
--> statement-breakpoint
GRANT USAGE ON SEQUENCE public.approval_request_number_seq TO authenticated;
--> statement-breakpoint

GRANT SELECT ON public.approval_decisions TO authenticated;
--> statement-breakpoint
GRANT INSERT ON public.approval_decisions TO authenticated;
--> statement-breakpoint

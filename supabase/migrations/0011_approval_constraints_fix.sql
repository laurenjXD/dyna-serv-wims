-- specs/09-approval-queue/design.md §3 (append-only decisions), §5 (one
-- terminal decision per request), §6 (column-level grant hardening).
--
-- Two fixes applied after rbac-rls-reviewer post-implementation audit:
--
-- 1. Narrow the UPDATE grant on approval_requests to the status column only.
--    0010 issued a table-level GRANT UPDATE which allowed requesters to tamper
--    with target_snapshot, reason, and other immutable columns during a
--    self-cancellation UPDATE. The RLS WITH CHECK only verified the resulting
--    status value, not which columns were included in the SET clause.
--
-- 2. Add a partial UNIQUE index on approval_decisions to enforce that at most
--    one terminal decision (outcome = 'approved' or 'rejected') exists per
--    request. The application-layer state machine checks prevent double-decision
--    for sequential requests; this index catches the concurrent-reviewer window
--    (design.md §5: "two supervisors simultaneously attempt to approve") at the
--    database level when a SELECT ... FOR UPDATE lock is not yet in place.
--    A second concurrent reviewer's INSERT will fail with a unique-constraint
--    violation rather than silently succeeding. The FOR UPDATE lock (requiring
--    a Drizzle transaction wrapper) is tracked as an open architectural gap
--    alongside Finding A (Drizzle client / RLS bypass), both deferred to
--    04-services-and-infrastructure.

-- ===========================================================================
-- 1. Narrow UPDATE grant — status column only.
-- ===========================================================================

REVOKE UPDATE ON public.approval_requests FROM authenticated;
--> statement-breakpoint

GRANT UPDATE (status) ON public.approval_requests TO authenticated;
--> statement-breakpoint

-- ===========================================================================
-- 2. Partial UNIQUE index — one terminal decision per request.
-- ===========================================================================

CREATE UNIQUE INDEX uniq_approval_decisions_terminal
  ON public.approval_decisions(request_id)
  WHERE outcome IN ('approved', 'rejected');
--> statement-breakpoint

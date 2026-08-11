-- Gap fix (rbac-rls-reviewer, A2 app-wide RLS session-binding rollout pass --
-- see specs/00-steering/revision-log.md, dated 2026-08-11):
--
-- Gap 3 (CRITICAL, currently silent): `approval_requests` has no UPDATE
-- policy allowing a reviewer to transition a request to 'approved' or
-- 'rejected'. 0010_approval_rls_policies.sql's only UPDATE policy,
-- `approval_requests_update_requester`, permits solely the original
-- requester to move their own 'pending' request to 'cancelled'. Now that
-- `lib/actions/approvals.ts`'s `approveRequest`/`rejectRequest` run under the
-- real reviewer's RLS-bound session (post-A2), the reviewer's UPDATE in
-- `recordDecision` matches zero rows against that policy's USING clause
-- (`requester_user_id = auth.uid()`) -- Postgres does not error on an UPDATE
-- whose USING clause matches nothing, it silently updates 0 rows. The
-- accompanying `approval_decisions` INSERT (already correctly policy-covered
-- by `approval_decisions_insert` in 0010) succeeds, so a decision row is
-- durably recorded, but `approval_requests.status` never actually changes --
-- the request stays 'pending' forever, invisible to any test or code path
-- that doesn't specifically re-select the request row afterward.
--
-- Fix: a SEPARATE, additional permissive UPDATE policy for reviewers.
-- Postgres OR-combines multiple permissive policies for the same table and
-- command automatically, so this does not touch, replace, or need to be
-- aware of the existing `approval_requests_update_requester` policy at all
-- -- that policy is left completely unmodified.
--
-- Re-read `lib/actions/approvals.ts`'s `recordDecision` (2026-08-11) to get
-- the exact UPDATE shape right: the only column written is `status`, to
-- either 'approved' or 'rejected' (never any other value from this path --
-- 'cancelled' is the requester-only path above, 'expired'/'superseded' are
-- service-role-only per 0010's own header comment). There is no
-- reviewer_user_id / resolved_at / decided_at column on `approval_requests`
-- itself (confirmed against lib/db/schema/approvals.ts -- that information
-- lives on the linked `approval_decisions` row's `reviewer_user_id` /
-- `decided_at`, already written by the INSERT this same command performs) --
-- so no additional column needs to be included in this policy's WITH CHECK
-- beyond `status`.
--
-- Self-approval prohibition is enforced here too, at the DB layer,
-- independently of the app layer's `checkSelfApproval` call -- the same
-- defense-in-depth reasoning 0010's own `approval_decisions_insert` policy
-- already applies (`AND NOT EXISTS (... ar.requester_user_id = auth.uid())`).
-- Mirrored here as `requester_user_id <> auth.uid()` in the USING clause, so
-- a reviewer can never even attempt to move their own request regardless of
-- what the application layer does.
--
-- 0011_approval_constraints_fix.sql already narrowed the table-level UPDATE
-- grant on `approval_requests` to `status` only
-- (`GRANT UPDATE (status) ON public.approval_requests TO authenticated`) --
-- that grant is column-scoped, not policy-scoped, so it already covers this
-- new policy's UPDATE too. No additional GRANT is needed or added here.

CREATE POLICY approval_requests_update_reviewer ON public.approval_requests
  FOR UPDATE TO authenticated
  USING (
    rbac_internal.has_permission('fifo_override', 'approve', 'global')
    AND requester_user_id <> auth.uid()
    AND status = 'pending'
  )
  WITH CHECK (
    rbac_internal.has_permission('fifo_override', 'approve', 'global')
    AND requester_user_id <> auth.uid()
    AND status IN ('approved', 'rejected')
  );

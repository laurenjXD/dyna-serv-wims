-- Fix: inspection_cases UPDATE and inspection_dispositions INSERT policies
-- incorrectly used inspection.perform (warehouse_staff + supervisor) when they
-- should use inspection.resolve (supervisor-only).
--
-- Traceability:
--   specs/02-rbac-roles/design.md §3.2 — inspection.resolve is intentionally
--     supervisor-only to enforce the two-person separation rule: the floor worker
--     who opens/scans a case (inspection.perform) must not be the same person
--     who decides the disposition (inspection.resolve).
--   specs/11-transfer-and-inspection/design.md §6.4 — supervisor must authorize
--     high-impact dispositions (quarantine, write-off, return to party).
--   specs/00-steering/revision-log.md 2026-08-08 — rbac-rls-reviewer Finding 1
--     on 11-transfer-and-inspection VERIFY pass: this was flagged as
--     enforced-wrong-at-DB-and-app-layer (not deferred).
--
-- 0005_rbac_constraints_and_seed.sql already seeds inspection.resolve and grants
-- it only to supervisor (not warehouse_staff) — this migration corrects the
-- 0014 policies to actually use that seeded grant.

-- Drop the incorrect policies first.
DROP POLICY IF EXISTS inspection_cases_update ON public.inspection_cases;
DROP POLICY IF EXISTS inspection_dispositions_insert ON public.inspection_dispositions;
--> statement-breakpoint

-- Re-create inspection_cases UPDATE requiring inspection.resolve.
CREATE POLICY inspection_cases_update ON public.inspection_cases
  FOR UPDATE TO authenticated
  USING (
    rbac_internal.has_permission('inspection', 'resolve', 'global')
    AND status = 'open'
  )
  WITH CHECK (
    rbac_internal.has_permission('inspection', 'resolve', 'global')
    AND resolved_by = auth.uid()
  );
--> statement-breakpoint

-- Re-create inspection_dispositions INSERT requiring inspection.resolve.
CREATE POLICY inspection_dispositions_insert ON public.inspection_dispositions
  FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('inspection', 'resolve', 'global')
    AND applied_by = auth.uid()
  );

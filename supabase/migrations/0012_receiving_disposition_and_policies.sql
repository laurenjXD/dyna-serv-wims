-- specs/07-incoming-receiving/design.md §5.1 (disposition field amendment),
-- §7 (commit path: inspect disposition), §8 (non-conformance resolution),
-- §9 (receipt commit invariant), and §6 / specs/02-rbac-roles/design.md §7
-- (authorization contracts for WRR staging, scanning, and inspection).
--
-- Follows the pattern established in 0008_rls_policies.sql and
-- 0010_approval_rls_policies.sql throughout:
--   - rbac_internal.has_permission(resource, action, scope_kind) for
--     capability checks.
--   - auth.uid() for actor identity.
--   - Explicit narrow GRANT per §7.1 ("no broad authenticated table
--     privileges beyond those required by explicit policies").
--   - No DELETE policies — denied by default.
--
-- Note: wrr_number is a varchar(50) with no backing sequence; no
-- GRANT USAGE ON SEQUENCE is needed for this table.
--
-- Capabilities used (seeded in 0005_rbac_constraints_and_seed.sql §3.2):
--   'receiving', 'confirm', 'global' — back-office staging and confirmation
--   'receiving', 'scan', 'global'    — floor scan / inspection recording

-- ===========================================================================
-- 1. Add disposition column to wrr_items.
--    NOT NULL with DEFAULT 'store' — every pre-existing row gets 'store'
--    as its disposition, matching the business rule that 'store' is the
--    default (design.md §7.1). Values are constrained to 'store' | 'inspect'
--    via a named CHECK constraint; no enum type is introduced (per task
--    requirement: use plain text CHECK, not an enum).
-- ===========================================================================

ALTER TABLE public.wrr_items
  ADD COLUMN disposition text NOT NULL DEFAULT 'store'
  CONSTRAINT wrr_items_disposition_check CHECK (disposition IN ('store', 'inspect'));
--> statement-breakpoint

-- ===========================================================================
-- 2. Enable RLS on wrr_documents, wrr_items, wrr_inspection_logs.
--    SELECT policies were created in 0008_rls_policies.sql; this migration
--    adds the mutation policies (INSERT, UPDATE) that 07's workflow requires.
--    ENABLE/FORCE RLS is idempotent — safe to repeat if 0008 already ran it,
--    but 0008 confirms it did enable them; these are kept here for clarity
--    and to avoid a dependency assumption on migration ordering beyond 0008.
-- ===========================================================================

-- (RLS already enabled by 0008 — no redundant ALTER TABLE … ENABLE needed.)

-- ===========================================================================
-- 3. INSERT policy for wrr_documents.
--    Only a user holding receiving.confirm may stage a new WRR, and only
--    for themselves (staged_by_user_id must equal auth.uid()).
--    design.md §5 / §3: staging is the back-office pre-receiving step.
-- ===========================================================================

CREATE POLICY wrr_documents_insert ON public.wrr_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('receiving', 'confirm', 'global')
    AND staged_by_user_id = auth.uid()
  );
--> statement-breakpoint

-- ===========================================================================
-- 4. UPDATE policy for wrr_documents.
--    Permits edits only while the document is in a mutable state
--    (staged_pending_arrival or receiving_in_progress). Confirmed/cancelled
--    WRRs are immutable via this policy.
--    design.md §5.3: no silent expected-line changes after receiving starts —
--    application layer enforces the tighter line-edit restriction; the DB
--    policy enforces the document-level status gate.
-- ===========================================================================

CREATE POLICY wrr_documents_update ON public.wrr_documents
  FOR UPDATE TO authenticated
  USING (
    rbac_internal.has_permission('receiving', 'confirm', 'global')
    AND status IN ('staged_pending_arrival', 'receiving_in_progress')
  )
  WITH CHECK (
    rbac_internal.has_permission('receiving', 'confirm', 'global')
  );
--> statement-breakpoint

-- ===========================================================================
-- 5. INSERT policy for wrr_items.
--    Lines may only be added to a WRR that is still staged_pending_arrival
--    (pre-scan). Once receiving starts the line list is locked via the
--    parent document's status gate (design.md §5.3).
-- ===========================================================================

CREATE POLICY wrr_items_insert ON public.wrr_items
  FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('receiving', 'confirm', 'global')
    AND EXISTS (
      SELECT 1 FROM public.wrr_documents wd
      WHERE wd.id = wrr_id
        AND wd.status = 'staged_pending_arrival'
    )
  );
--> statement-breakpoint

-- ===========================================================================
-- 6. UPDATE policy for wrr_items.
--    Two authorized paths:
--      a. receiving.scan — may update items on a WRR that is
--         receiving_in_progress (scan reconciliation, disposition marking).
--      b. receiving.confirm — may update items on a WRR that is
--         staged_pending_arrival or receiving_in_progress (back-office
--         corrections within the pre-confirmed window).
--    No WITH CHECK clause: the USING predicate is sufficient for UPDATE
--    because it already establishes the allowed population; column-level
--    CHECK constraints and app-layer validation own the field-level rules.
-- ===========================================================================

CREATE POLICY wrr_items_update ON public.wrr_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.wrr_documents wd
      WHERE wd.id = wrr_items.wrr_id
        AND (
          (rbac_internal.has_permission('receiving', 'scan', 'global') AND wd.status = 'receiving_in_progress')
          OR (rbac_internal.has_permission('receiving', 'confirm', 'global') AND wd.status IN ('staged_pending_arrival', 'receiving_in_progress'))
        )
    )
  );
--> statement-breakpoint

-- ===========================================================================
-- 7. INSERT policy for wrr_inspection_logs.
--    Inspection log entries may only be created during active receiving
--    (receiving_in_progress). receiving.scan holders are the floor actors
--    who record conformance/non-conformance results.
--    design.md §7, §8: inspection is a receiving_in_progress sub-phase.
-- ===========================================================================

CREATE POLICY wrr_inspection_logs_insert ON public.wrr_inspection_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('receiving', 'scan', 'global')
    AND EXISTS (
      SELECT 1 FROM public.wrr_documents wd
      WHERE wd.id = wrr_id
        AND wd.status = 'receiving_in_progress'
    )
  );
--> statement-breakpoint

-- ===========================================================================
-- 8. Table-level mutation grants.
--    wrr_number is a varchar with no backing sequence — no SEQUENCE grant.
--    SELECT was already granted in 0008_rls_policies.sql.
-- ===========================================================================

GRANT INSERT, UPDATE ON public.wrr_documents TO authenticated;
--> statement-breakpoint
GRANT INSERT, UPDATE ON public.wrr_items TO authenticated;
--> statement-breakpoint
GRANT INSERT ON public.wrr_inspection_logs TO authenticated;

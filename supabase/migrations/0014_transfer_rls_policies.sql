-- specs/11-transfer-and-inspection/design.md §5 (authorization)
--
-- RLS policies for the five transfer/inspection tables introduced in
-- 0013_transfer_and_inspection_tables.sql:
--   transfer_requests, transfer_lines, inspection_cases,
--   inspection_evidence, inspection_dispositions.
--
-- Follows the same pattern established in 0008_rls_policies.sql,
-- 0010_approval_rls_policies.sql, and 0012_receiving_disposition_and_policies.sql:
--   - rbac_internal.has_permission(resource, action, scope_kind) for capability checks.
--   - auth.uid() for actor identity.
--   - Explicit narrow GRANTs per design.md §7.1 ("no broad authenticated table
--     privileges beyond those required by explicit policies").
--   - No DELETE policies on any table — denied by default.
--     Evidence and dispositions are append-only (design.md §6.5);
--     transfer requests are permanent audit records.
--
-- RLS ENABLE/FORCE already applied in 0013 — not repeated here.
--
-- Capabilities used in this migration:
--   'transfer', 'view',    'global' — warehouse_staff, supervisor, administrator
--   'transfer', 'request', 'global' — warehouse_staff, supervisor, administrator
--   'transfer', 'execute', 'global' — warehouse_staff, supervisor, administrator
--   'transfer', 'approve', 'global' — supervisor, administrator
--   'inspection', 'perform', 'global' — warehouse_staff, supervisor (seeded in 0005)
--
-- NOTE on naming: 0005 seeds a 'transfers' (plural) resource with actions
-- 'read'/'request'/'execute'. The policies below use the singular 'transfer'
-- resource (actions 'view'/'request'/'execute'/'approve'), which is the
-- authoritative capability vocabulary for this feature's RLS surface per
-- design.md §5. These are distinct catalog rows; 0005 is not edited.
-- The four 'transfer' (singular) rows are seeded idempotently in section 1.

-- ===========================================================================
-- 1. Transfer capability catalog additions.
--    Add only the four 'transfer' (singular) capabilities not present in 0005.
--    'inspection.perform' is already seeded in 0005 — not repeated here.
--    Idempotent: ON CONFLICT ("resource", "action") DO NOTHING.
-- ===========================================================================

INSERT INTO "permissions" ("resource", "action", "description")
VALUES
  ('transfer', 'view',    'View transfer requests and their status.'),
  ('transfer', 'request', 'Create and cancel transfer requests.'),
  ('transfer', 'execute', 'Execute source/destination scans and commit a transfer.'),
  ('transfer', 'approve', 'Approve or reject transfer approval requests.')
ON CONFLICT ("resource", "action") DO NOTHING;
--> statement-breakpoint

INSERT INTO "role_permissions" ("role_id", "permission_id", "scope_kind")
SELECT r."id", p."id", v.scope_kind::"scope_kind"
FROM (VALUES
  -- transfer.view — warehouse_staff, supervisor, administrator
  ('warehouse_staff', 'transfer', 'view',    'global'),
  ('supervisor',      'transfer', 'view',    'global'),
  ('administrator',   'transfer', 'view',    'global'),
  -- transfer.request — warehouse_staff, supervisor, administrator
  ('warehouse_staff', 'transfer', 'request', 'global'),
  ('supervisor',      'transfer', 'request', 'global'),
  ('administrator',   'transfer', 'request', 'global'),
  -- transfer.execute — warehouse_staff, supervisor, administrator
  ('warehouse_staff', 'transfer', 'execute', 'global'),
  ('supervisor',      'transfer', 'execute', 'global'),
  ('administrator',   'transfer', 'execute', 'global'),
  -- transfer.approve — supervisor, administrator only
  ('supervisor',      'transfer', 'approve', 'global'),
  ('administrator',   'transfer', 'approve', 'global')
) AS v(role_key, resource, action, scope_kind)
JOIN "roles" r ON r."key" = v.role_key
JOIN "permissions" p ON p."resource" = v.resource AND p."action" = v.action
ON CONFLICT ("role_id", "permission_id", "scope_kind") DO NOTHING;
--> statement-breakpoint

-- ===========================================================================
-- 2. transfer_requests policies.
-- ===========================================================================

-- SELECT (two policies): staff/supervisor/admin with transfer.view, OR the
-- requester who created the request (self-visibility regardless of role).
CREATE POLICY transfer_requests_select_staff ON public.transfer_requests
  FOR SELECT TO authenticated
  USING (rbac_internal.has_permission('transfer', 'view', 'global'));
--> statement-breakpoint

CREATE POLICY transfer_requests_select_requester ON public.transfer_requests
  FOR SELECT TO authenticated
  USING (requested_by = auth.uid());
--> statement-breakpoint

-- INSERT: must hold transfer.request and must be the stated requester.
CREATE POLICY transfer_requests_insert ON public.transfer_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('transfer', 'request', 'global')
    AND requested_by = auth.uid()
  );
--> statement-breakpoint

-- UPDATE: only staff holding transfer.execute may transition a request that
-- is currently in a mutable state (staged or in_progress).
-- Completed and cancelled requests are immutable via this policy.
CREATE POLICY transfer_requests_update ON public.transfer_requests
  FOR UPDATE TO authenticated
  USING (
    rbac_internal.has_permission('transfer', 'execute', 'global')
    AND status IN ('staged', 'in_progress')
  )
  WITH CHECK (
    rbac_internal.has_permission('transfer', 'execute', 'global')
  );
--> statement-breakpoint

-- ===========================================================================
-- 3. transfer_lines policies.
-- ===========================================================================

-- SELECT: same two-branch pattern as transfer_requests — staff or requester
-- of the parent transfer.
CREATE POLICY transfer_lines_select ON public.transfer_lines
  FOR SELECT TO authenticated
  USING (
    rbac_internal.has_permission('transfer', 'view', 'global')
    OR EXISTS (
      SELECT 1 FROM public.transfer_requests tr
      WHERE tr.id = transfer_lines.transfer_request_id
        AND tr.requested_by = auth.uid()
    )
  );
--> statement-breakpoint

-- INSERT: must hold transfer.request AND the parent request must still be
-- staged (line-list is locked once execution begins, design.md §2).
CREATE POLICY transfer_lines_insert ON public.transfer_lines
  FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('transfer', 'request', 'global')
    AND EXISTS (
      SELECT 1 FROM public.transfer_requests tr
      WHERE tr.id = transfer_request_id
        AND tr.status = 'staged'
    )
  );
--> statement-breakpoint

-- UPDATE: must hold transfer.execute AND the parent request must be
-- in_progress (execution phase only).
CREATE POLICY transfer_lines_update ON public.transfer_lines
  FOR UPDATE TO authenticated
  USING (
    rbac_internal.has_permission('transfer', 'execute', 'global')
    AND EXISTS (
      SELECT 1 FROM public.transfer_requests tr
      WHERE tr.id = transfer_lines.transfer_request_id
        AND tr.status = 'in_progress'
    )
  );
--> statement-breakpoint

-- ===========================================================================
-- 4. inspection_cases policies.
-- ===========================================================================

-- SELECT: transfer.view holders (staff overview) OR inspection.perform holders
-- (floor inspectors working active cases).
CREATE POLICY inspection_cases_select ON public.inspection_cases
  FOR SELECT TO authenticated
  USING (
    rbac_internal.has_permission('transfer', 'view', 'global')
    OR rbac_internal.has_permission('inspection', 'perform', 'global')
  );
--> statement-breakpoint

-- INSERT: must hold inspection.perform and must be the stated opener.
-- Cases are opened by the inspector on the floor, not by requesters.
CREATE POLICY inspection_cases_insert ON public.inspection_cases
  FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('inspection', 'perform', 'global')
    AND opened_by = auth.uid()
  );
--> statement-breakpoint

-- UPDATE: must hold inspection.perform AND the case must still be open.
-- Passed/failed/cancelled cases are immutable via this policy.
CREATE POLICY inspection_cases_update ON public.inspection_cases
  FOR UPDATE TO authenticated
  USING (
    rbac_internal.has_permission('inspection', 'perform', 'global')
    AND status = 'open'
  )
  WITH CHECK (
    rbac_internal.has_permission('inspection', 'perform', 'global')
  );
--> statement-breakpoint

-- ===========================================================================
-- 5. inspection_evidence policies.
-- ===========================================================================

-- SELECT: transfer.view holders OR inspection.perform holders.
CREATE POLICY inspection_evidence_select ON public.inspection_evidence
  FOR SELECT TO authenticated
  USING (
    rbac_internal.has_permission('transfer', 'view', 'global')
    OR rbac_internal.has_permission('inspection', 'perform', 'global')
  );
--> statement-breakpoint

-- INSERT (append-only per design.md §6.5): must hold inspection.perform
-- and must be the stated capturer. No UPDATE or DELETE policy.
CREATE POLICY inspection_evidence_insert ON public.inspection_evidence
  FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('inspection', 'perform', 'global')
    AND captured_by = auth.uid()
  );
--> statement-breakpoint

-- ===========================================================================
-- 6. inspection_dispositions policies.
-- ===========================================================================

-- SELECT: transfer.view holders OR inspection.perform holders.
CREATE POLICY inspection_dispositions_select ON public.inspection_dispositions
  FOR SELECT TO authenticated
  USING (
    rbac_internal.has_permission('transfer', 'view', 'global')
    OR rbac_internal.has_permission('inspection', 'perform', 'global')
  );
--> statement-breakpoint

-- INSERT (append-only): must hold inspection.perform and must be the
-- stated applier. No UPDATE or DELETE policy.
CREATE POLICY inspection_dispositions_insert ON public.inspection_dispositions
  FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('inspection', 'perform', 'global')
    AND applied_by = auth.uid()
  );
--> statement-breakpoint

-- ===========================================================================
-- 7. Narrow mutation grants to `authenticated`.
--    SELECT already granted in 0013_transfer_and_inspection_tables.sql.
--    No UPDATE grant on inspection_evidence or inspection_dispositions —
--    both are append-only by design.
-- ===========================================================================

GRANT INSERT, UPDATE ON public.transfer_requests TO authenticated;
--> statement-breakpoint
GRANT INSERT, UPDATE ON public.transfer_lines TO authenticated;
--> statement-breakpoint
GRANT INSERT, UPDATE ON public.inspection_cases TO authenticated;
--> statement-breakpoint
GRANT INSERT ON public.inspection_evidence TO authenticated;
--> statement-breakpoint
GRANT INSERT ON public.inspection_dispositions TO authenticated;

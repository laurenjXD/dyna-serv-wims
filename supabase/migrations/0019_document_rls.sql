-- specs/10-pick-list-and-acknowledgement-receipt/design.md §2
-- specs/02-rbac-roles/design.md §3.2
--
-- RLS policies for generated_documents and document_events introduced in
-- 0018_generated_documents.sql.
--
-- Follows the pattern from 0014_transfer_rls_policies.sql:
--   - rbac_internal.has_permission(resource, action, scope_kind) for capability checks.
--   - auth.uid() for actor identity.
--   - Explicit narrow GRANTs per design.md §7.1 ("no broad authenticated table
--     privileges beyond those required by explicit policies").
--   - No DELETE policy on either table — documents are immutable; voiding is a
--     status UPDATE, not a DELETE (design.md §7.3). document_events is append-only.
--
-- RLS ENABLE/FORCE already applied in 0018 — not repeated here.
--
-- Capabilities used in this migration:
--   'withdrawal', 'view',    'global' — view documents (SELECT)
--   'withdrawal', 'execute', 'global' — generate/update documents (INSERT/UPDATE)
--
-- The 'withdrawal' resource is distinct from the existing 'documents' resource
-- (catalog, read, download) and scopes access specifically to the outbound
-- withdrawal document workflow owned by 08/10 — same pattern as the 'transfer'
-- resource added in 0014 alongside the pre-existing 'transfers' resource in 0005.

-- ===========================================================================
-- 1. Seed withdrawal capability catalog entries.
--    Idempotent: ON CONFLICT ("resource", "action") DO NOTHING.
-- ===========================================================================

INSERT INTO "permissions" ("resource", "action", "description")
VALUES
  ('withdrawal', 'view',    'View outbound withdrawal documents (pick lists and acknowledgement receipts).'),
  ('withdrawal', 'execute', 'Generate and update outbound withdrawal documents.')
ON CONFLICT ("resource", "action") DO NOTHING;
--> statement-breakpoint

INSERT INTO "role_permissions" ("role_id", "permission_id", "scope_kind")
SELECT r."id", p."id", v.scope_kind::"scope_kind"
FROM (VALUES
  -- withdrawal.view — warehouse_staff, supervisor, administrator
  ('warehouse_staff', 'withdrawal', 'view',    'global'),
  ('supervisor',      'withdrawal', 'view',    'global'),
  ('administrator',   'withdrawal', 'view',    'global'),
  -- withdrawal.execute — warehouse_staff, supervisor only (not administrator;
  -- admins manage access, not document generation per design.md §2 ownership)
  ('warehouse_staff', 'withdrawal', 'execute', 'global'),
  ('supervisor',      'withdrawal', 'execute', 'global')
) AS v(role_key, resource, action, scope_kind)
JOIN "roles" r ON r."key" = v.role_key
JOIN "permissions" p ON p."resource" = v.resource AND p."action" = v.action
ON CONFLICT ("role_id", "permission_id", "scope_kind") DO NOTHING;
--> statement-breakpoint

-- ===========================================================================
-- 2. generated_documents policies.
-- ===========================================================================

-- SELECT: must hold withdrawal.view.
CREATE POLICY generated_documents_select ON public.generated_documents
  FOR SELECT TO authenticated
  USING (rbac_internal.has_permission('withdrawal', 'view', 'global'));
--> statement-breakpoint

-- INSERT: must hold withdrawal.execute.
-- created_by is enforced in the WITH CHECK to tie each row to the actor;
-- system-generated rows set system_executor instead and may have created_by = null.
CREATE POLICY generated_documents_insert ON public.generated_documents
  FOR INSERT TO authenticated
  WITH CHECK (rbac_internal.has_permission('withdrawal', 'execute', 'global'));
--> statement-breakpoint

-- UPDATE: must hold withdrawal.execute AND the document must be in a mutable
-- state (pending or generating). ready/failed/voided documents are immutable
-- via this policy; voiding requires a specific transition path enforced at
-- the application layer.
CREATE POLICY generated_documents_update ON public.generated_documents
  FOR UPDATE TO authenticated
  USING (
    rbac_internal.has_permission('withdrawal', 'execute', 'global')
    AND status IN ('pending', 'generating')
  )
  WITH CHECK (
    rbac_internal.has_permission('withdrawal', 'execute', 'global')
  );
--> statement-breakpoint

-- No DELETE policy — voiding is a status UPDATE; historical artifacts remain
-- auditable at their original storage path (design.md §7.3, §10).

-- ===========================================================================
-- 3. document_events policies (append-only).
-- ===========================================================================

-- SELECT: must hold withdrawal.view.
CREATE POLICY document_events_select ON public.document_events
  FOR SELECT TO authenticated
  USING (rbac_internal.has_permission('withdrawal', 'view', 'global'));
--> statement-breakpoint

-- INSERT: withdrawal.execute OR withdrawal.view — events are written by the
-- system on behalf of users (e.g. a 'printed' event is emitted when a view
-- holder triggers a print action, not just when an executor generates a doc).
CREATE POLICY document_events_insert ON public.document_events
  FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('withdrawal', 'execute', 'global')
    OR rbac_internal.has_permission('withdrawal', 'view', 'global')
  );
--> statement-breakpoint

-- No UPDATE or DELETE policy — document_events is append-only (design.md §10).

-- ===========================================================================
-- 4. Narrow mutation grants to 'authenticated'.
--    SELECT already granted in 0018_generated_documents.sql.
--    No UPDATE grant on document_events — append-only by design.
-- ===========================================================================

GRANT INSERT, UPDATE ON public.generated_documents TO authenticated;
--> statement-breakpoint

GRANT INSERT ON public.document_events TO authenticated;

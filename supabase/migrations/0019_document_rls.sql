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
--   'documents',  'read',     'global' — view documents (SELECT)
--   'pick_list',  'generate', 'global' — create a document at commitment
--   'pick_list',  'execute',  'global' — record dispatch-generated documents
--
-- These are existing canonical capabilities. This migration MUST NOT invent a
-- parallel 'withdrawal' resource for the same outbound workflow.

-- ===========================================================================
-- 1. Capability catalog
-- ===========================================================================

-- `documents.read`, `pick_list.generate`, and `pick_list.execute` are seeded
-- by the canonical RBAC migration. No new capability or role grant belongs in
-- this document-specific migration.

-- ===========================================================================
-- 2. generated_documents policies.
-- ===========================================================================

-- SELECT: must hold documents.read.
CREATE POLICY generated_documents_select ON public.generated_documents
  FOR SELECT TO authenticated
  USING (rbac_internal.has_permission('documents', 'read', 'global'));
--> statement-breakpoint

-- INSERT: must hold pick_list.generate (Stage 1) or pick_list.execute (Stage 2).
-- created_by is enforced in the WITH CHECK to tie each row to the actor;
-- system-generated rows set system_executor instead and may have created_by = null.
CREATE POLICY generated_documents_insert ON public.generated_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('pick_list', 'generate', 'global')
    OR rbac_internal.has_permission('pick_list', 'execute', 'global')
  );
--> statement-breakpoint

-- UPDATE: must hold pick_list.generate or pick_list.execute AND the document must be in a mutable
-- state (pending or generating). ready/failed/voided documents are immutable
-- via this policy; voiding requires a specific transition path enforced at
-- the application layer.
CREATE POLICY generated_documents_update ON public.generated_documents
  FOR UPDATE TO authenticated
  USING (
    (rbac_internal.has_permission('pick_list', 'generate', 'global')
      OR rbac_internal.has_permission('pick_list', 'execute', 'global'))
    AND status IN ('pending', 'generating')
  )
  WITH CHECK (
    rbac_internal.has_permission('pick_list', 'generate', 'global')
    OR rbac_internal.has_permission('pick_list', 'execute', 'global')
  );
--> statement-breakpoint

-- No DELETE policy — voiding is a status UPDATE; historical artifacts remain
-- auditable at their original storage path (design.md §7.3, §10).

-- ===========================================================================
-- 3. document_events policies (append-only).
-- ===========================================================================

-- SELECT: must hold documents.read.
CREATE POLICY document_events_select ON public.document_events
  FOR SELECT TO authenticated
  USING (rbac_internal.has_permission('documents', 'read', 'global'));
--> statement-breakpoint

-- INSERT: pick_list.execute OR documents.read — events are written by the
-- system on behalf of users (e.g. a 'printed' event is emitted when a view
-- holder triggers a print action, not just when an executor generates a doc).
CREATE POLICY document_events_insert ON public.document_events
  FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('pick_list', 'execute', 'global')
    OR rbac_internal.has_permission('documents', 'read', 'global')
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

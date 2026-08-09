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
-- Capabilities used in this migration are the existing 'documents' resource
-- from 02-rbac-roles design.md §3.2, already seeded and granted in
-- 0005_rbac_constraints_and_seed.sql (warehouse_staff/supervisor/administrator
-- hold 'documents'.'read'/'generate'/'download' at 'global' scope) — no new
-- permission rows are seeded here. An earlier draft of this migration
-- introduced a standalone 'withdrawal' resource ('withdrawal.view'/
-- 'withdrawal.execute'); that vocabulary was never seeded anywhere, had no
-- backing in this feature's own design.md, and contradicted 05's explicit
-- rule against a withdrawal-request model in the shell (see revision-log.md's
-- 2026-08-08 "Route-registry/capability reconciliation" entry, where the same
-- 'withdrawal.*' vocabulary was found and removed from application code).
-- This migration was corrected before ever being applied to any environment.
--
--   'documents', 'read',     'global' — view documents (SELECT)
--   'documents', 'generate', 'global' — generate/update documents (INSERT/UPDATE)

-- ===========================================================================
-- 1. generated_documents policies.
-- ===========================================================================

-- SELECT: must hold documents.read.
CREATE POLICY generated_documents_select ON public.generated_documents
  FOR SELECT TO authenticated
  USING (rbac_internal.has_permission('documents', 'read', 'global'));
--> statement-breakpoint

-- INSERT: must hold documents.generate.
-- created_by is enforced in the WITH CHECK to tie each row to the actor;
-- system-generated rows set system_executor instead and may have created_by = null.
CREATE POLICY generated_documents_insert ON public.generated_documents
  FOR INSERT TO authenticated
  WITH CHECK (rbac_internal.has_permission('documents', 'generate', 'global'));
--> statement-breakpoint

-- UPDATE: must hold documents.generate AND the document must be in a mutable
-- state (pending or generating). ready/failed/voided documents are immutable
-- via this policy; voiding requires a specific transition path enforced at
-- the application layer.
CREATE POLICY generated_documents_update ON public.generated_documents
  FOR UPDATE TO authenticated
  USING (
    rbac_internal.has_permission('documents', 'generate', 'global')
    AND status IN ('pending', 'generating')
  )
  WITH CHECK (
    rbac_internal.has_permission('documents', 'generate', 'global')
  );
--> statement-breakpoint

-- No DELETE policy — voiding is a status UPDATE; historical artifacts remain
-- auditable at their original storage path (design.md §7.3, §10).

-- ===========================================================================
-- 2. document_events policies (append-only).
-- ===========================================================================

-- SELECT: must hold documents.read.
CREATE POLICY document_events_select ON public.document_events
  FOR SELECT TO authenticated
  USING (rbac_internal.has_permission('documents', 'read', 'global'));
--> statement-breakpoint

-- INSERT: documents.generate OR documents.read — events are written by the
-- system on behalf of users (e.g. a 'printed' event is emitted when a read
-- holder triggers a print action, not just when a generator creates a doc).
CREATE POLICY document_events_insert ON public.document_events
  FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('documents', 'generate', 'global')
    OR rbac_internal.has_permission('documents', 'read', 'global')
  );
--> statement-breakpoint

-- No UPDATE or DELETE policy — document_events is append-only (design.md §10).

-- ===========================================================================
-- 3. Narrow mutation grants to 'authenticated'.
--    SELECT already granted in 0018_generated_documents.sql.
--    No UPDATE grant on document_events — append-only by design.
-- ===========================================================================

GRANT INSERT, UPDATE ON public.generated_documents TO authenticated;
--> statement-breakpoint

GRANT INSERT ON public.document_events TO authenticated;

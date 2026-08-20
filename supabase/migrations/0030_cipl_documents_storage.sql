-- specs/04-services-and-infrastructure/design.md §10 (Supabase Storage
-- design) — bucket plan (§10.1) and object path convention (§10.2).
--
-- Creates the `cipl-documents` bucket (private; WRR/resource scope per
-- §10.1's table) that CIPL uploads on the create-WRR form
-- (specs/07-incoming-receiving/design.md line 125: "The CIPL file is an
-- external reference; it is stored privately... not machine-parsed in v1")
-- write to, at path `cipl/{wrr_id}/{upload_uuid}/{sanitized-filename}`
-- (§10.2's named-path table).
--
-- 10MB cap and PDF/JPEG/PNG allowlist match the schema comment on
-- `wrr_documents.cipl_file_url` ("Attached PDF/Image CIPL document").
--
-- RLS on `storage.objects` mirrors this repo's established
-- `rbac_internal.has_permission` pattern (0008_rls_policies.sql and
-- descendants) rather than inventing a separate Storage-specific
-- authorization mechanism -- `receiving.confirm` gates upload (matches the
-- capability createWrr itself requires, lib/actions/receiving.ts), and the
-- broader `receiving.view` gates read/download (matches the WRR detail
-- page's own gate, app/(authenticated)/receiving/[wrrId]/page.tsx). This is
-- capability-level, not yet per-WRR row-scoped -- consistent with this
-- migration series' incremental approach (0022/0023 gated the same way
-- before any row-level Storage scoping existed); a future pass can add a
-- `resource_id`-based check once CIPL access needs to differ per vendor/WRR
-- rather than per capability.
--
-- No ALTER TABLE ... ENABLE ROW LEVEL SECURITY here: `storage.objects` is a
-- Supabase-platform-managed table that already ships with RLS enabled by
-- default -- this migration only adds this bucket's own policies to it.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cipl-documents',
  'cipl-documents',
  false,
  10485760, -- 10 MB
  array['application/pdf', 'image/png', 'image/jpeg']
)
on conflict (id) do nothing;
--> statement-breakpoint

create policy cipl_documents_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'cipl-documents'
    and rbac_internal.has_permission('receiving', 'confirm', 'global')
  );
--> statement-breakpoint

create policy cipl_documents_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'cipl-documents'
    and rbac_internal.has_permission('receiving', 'view', 'global')
  );

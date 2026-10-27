-- One-time workbook migration staging and opening-lot provenance.
-- Normal receiving lots retain wrr_item_id. Opening migration lots use
-- migration_batch_id and create an inventory_reconciliation event instead of
-- inventing a WRR document.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'migration-source-files',
  'migration-source-files',
  false,
  52428800,
  ARRAY['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv']
) ON CONFLICT (id) DO UPDATE SET file_size_limit = EXCLUDED.file_size_limit;

DROP POLICY IF EXISTS migration_source_files_insert ON storage.objects;
CREATE POLICY migration_source_files_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'migration-source-files'
    AND rbac_internal.has_permission('parties', 'manage', 'global')
  );

DROP POLICY IF EXISTS migration_source_files_select ON storage.objects;
CREATE POLICY migration_source_files_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'migration-source-files'
    AND rbac_internal.has_permission('parties', 'manage', 'global')
  );

ALTER TABLE public.lots
  ALTER COLUMN wrr_item_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.migration_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_name varchar(255) NOT NULL,
  flow_type flow_type NOT NULL,
  profile_key varchar(100) NOT NULL,
  opening_date date NOT NULL,
  source_file_name varchar(255) NOT NULL,
  source_file_hash varchar(128) NOT NULL,
  source_file_url text,
  status varchar(30) NOT NULL DEFAULT 'uploaded',
  uploaded_by_user_id uuid NOT NULL,
  approved_by_user_id uuid,
  committed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lots
  ADD COLUMN IF NOT EXISTS migration_batch_id uuid;

-- The FK is added after the batch table exists.
ALTER TABLE public.lots
  DROP CONSTRAINT IF EXISTS lots_migration_batch_id_fkey;
ALTER TABLE public.lots
  ADD CONSTRAINT lots_migration_batch_id_fkey
  FOREIGN KEY (migration_batch_id) REFERENCES public.migration_batches(id)
  ON DELETE RESTRICT;

ALTER TABLE public.lots
  DROP CONSTRAINT IF EXISTS lots_one_source_check;
ALTER TABLE public.lots
  ADD CONSTRAINT lots_one_source_check
  CHECK ((wrr_item_id IS NOT NULL) <> (migration_batch_id IS NOT NULL));

CREATE INDEX IF NOT EXISTS migration_batches_source_hash_idx
  ON public.migration_batches(source_file_hash);
CREATE INDEX IF NOT EXISTS migration_batches_status_idx
  ON public.migration_batches(status);

CREATE TABLE IF NOT EXISTS public.migration_source_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.migration_batches(id) ON DELETE CASCADE,
  sheet_name varchar(255) NOT NULL,
  source_row_number integer NOT NULL,
  row_key varchar(255),
  phase varchar(40) NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'staged',
  raw_data jsonb NOT NULL,
  normalized_data jsonb,
  validation_errors jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS migration_source_rows_batch_sheet_row_idx
  ON public.migration_source_rows(batch_id, sheet_name, source_row_number);
CREATE INDEX IF NOT EXISTS migration_source_rows_batch_phase_idx
  ON public.migration_source_rows(batch_id, phase);

CREATE TABLE IF NOT EXISTS public.migration_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.migration_batches(id) ON DELETE CASCADE,
  source_row_id uuid REFERENCES public.migration_source_rows(id) ON DELETE CASCADE,
  severity varchar(20) NOT NULL,
  code varchar(80) NOT NULL,
  message text NOT NULL,
  resolution_status varchar(30) NOT NULL DEFAULT 'open',
  resolution_note text,
  resolved_by_user_id uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS migration_exceptions_batch_status_idx
  ON public.migration_exceptions(batch_id, resolution_status);

ALTER TABLE public.migration_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.migration_batches FORCE ROW LEVEL SECURITY;
ALTER TABLE public.migration_source_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.migration_source_rows FORCE ROW LEVEL SECURITY;
ALTER TABLE public.migration_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.migration_exceptions FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.migration_batches TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.migration_source_rows TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.migration_exceptions TO authenticated;

DROP POLICY IF EXISTS migration_batches_admin_select ON public.migration_batches;
CREATE POLICY migration_batches_admin_select ON public.migration_batches
  FOR SELECT TO authenticated
  USING (rbac_internal.has_permission('parties', 'manage', 'global'));
DROP POLICY IF EXISTS migration_batches_admin_write ON public.migration_batches;
CREATE POLICY migration_batches_admin_write ON public.migration_batches
  FOR ALL TO authenticated
  USING (rbac_internal.has_permission('parties', 'manage', 'global'))
  WITH CHECK (rbac_internal.has_permission('parties', 'manage', 'global'));

DROP POLICY IF EXISTS migration_source_rows_admin_select ON public.migration_source_rows;
CREATE POLICY migration_source_rows_admin_select ON public.migration_source_rows
  FOR SELECT TO authenticated
  USING (rbac_internal.has_permission('parties', 'manage', 'global'));
DROP POLICY IF EXISTS migration_source_rows_admin_write ON public.migration_source_rows;
CREATE POLICY migration_source_rows_admin_write ON public.migration_source_rows
  FOR ALL TO authenticated
  USING (rbac_internal.has_permission('parties', 'manage', 'global'))
  WITH CHECK (rbac_internal.has_permission('parties', 'manage', 'global'));

DROP POLICY IF EXISTS migration_exceptions_admin_select ON public.migration_exceptions;
CREATE POLICY migration_exceptions_admin_select ON public.migration_exceptions
  FOR SELECT TO authenticated
  USING (rbac_internal.has_permission('parties', 'manage', 'global'));
DROP POLICY IF EXISTS migration_exceptions_admin_write ON public.migration_exceptions;
CREATE POLICY migration_exceptions_admin_write ON public.migration_exceptions
  FOR ALL TO authenticated
  USING (rbac_internal.has_permission('parties', 'manage', 'global'))
  WITH CHECK (rbac_internal.has_permission('parties', 'manage', 'global'));

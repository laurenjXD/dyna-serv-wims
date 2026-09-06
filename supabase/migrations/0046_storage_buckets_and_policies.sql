-- 0046_storage_buckets_and_policies.sql
-- Creates storage buckets and RLS policies for:
-- 1. `dra-documents` (Client Delivery Release Advice uploads)
-- 2. `generated-documents` (System generated official PDFs: Pick Lists, ARs, WRRs, VMI Statements, SOAs)
-- 3. `inspection-evidence` (Photos of damaged/quarantined goods during inspection)

-- 1. DRA Documents Bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dra-documents',
  'dra-documents',
  false,
  10485760, -- 10 MB
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv'
  ]
) ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS dra_documents_insert ON storage.objects;
CREATE POLICY dra_documents_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'dra-documents'
    AND (
      rbac_internal.has_permission('pick_list', 'execute', 'global')
      OR rbac_internal.has_permission('dispatch', 'execute', 'global')
    )
  );

DROP POLICY IF EXISTS dra_documents_select ON storage.objects;
CREATE POLICY dra_documents_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'dra-documents'
    AND rbac_internal.has_permission('pick_list', 'read', 'global')
  );

-- 2. Generated Documents Bucket (Official PDFs)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'generated-documents',
  'generated-documents',
  false,
  20971520, -- 20 MB
  ARRAY['application/pdf']
) ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS generated_documents_insert ON storage.objects;
CREATE POLICY generated_documents_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'generated-documents');

DROP POLICY IF EXISTS generated_documents_select ON storage.objects;
CREATE POLICY generated_documents_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'generated-documents');

-- 3. Inspection Evidence Bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'inspection-evidence',
  'inspection-evidence',
  false,
  10485760, -- 10 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp']
) ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS inspection_evidence_insert ON storage.objects;
CREATE POLICY inspection_evidence_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'inspection-evidence'
    AND (
      rbac_internal.has_permission('inspection', 'perform', 'global')
      OR rbac_internal.has_permission('receiving', 'confirm', 'global')
    )
  );

DROP POLICY IF EXISTS inspection_evidence_select ON storage.objects;
CREATE POLICY inspection_evidence_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'inspection-evidence'
    AND (
      rbac_internal.has_permission('transfer', 'view', 'global')
      OR rbac_internal.has_permission('receiving', 'view', 'global')
    )
  );

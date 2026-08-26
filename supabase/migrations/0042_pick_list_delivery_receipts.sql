ALTER TABLE public.pick_lists
  ADD COLUMN IF NOT EXISTS delivery_receipt_path text,
  ADD COLUMN IF NOT EXISTS delivery_receipt_status text NOT NULL DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS delivery_receipt_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.pick_lists
  ADD CONSTRAINT pick_lists_delivery_receipt_status_check CHECK (delivery_receipt_status IN ('missing', 'uploaded'));
CREATE INDEX IF NOT EXISTS pick_lists_deleted_at_idx ON public.pick_lists (deleted_at);
CREATE INDEX IF NOT EXISTS pick_lists_delivery_receipt_status_idx ON public.pick_lists (delivery_receipt_status);
DROP POLICY IF EXISTS pick_lists_update ON public.pick_lists;
CREATE POLICY pick_lists_update ON public.pick_lists FOR UPDATE TO authenticated
  USING (rbac_internal.has_permission('dispatch', 'execute', 'global') OR rbac_internal.has_permission('pick_list', 'execute', 'global'))
  WITH CHECK (rbac_internal.has_permission('dispatch', 'execute', 'global') OR rbac_internal.has_permission('pick_list', 'execute', 'global'));
GRANT UPDATE ON public.pick_lists TO authenticated;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('delivery-receipts', 'delivery-receipts', false, 10485760, ARRAY['application/pdf', 'image/png', 'image/jpeg'])
ON CONFLICT (id) DO NOTHING;
CREATE POLICY delivery_receipts_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'delivery-receipts' AND (rbac_internal.has_permission('pick_list', 'execute', 'global') OR rbac_internal.has_permission('dispatch', 'execute', 'global')));
CREATE POLICY delivery_receipts_select ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'delivery-receipts' AND rbac_internal.has_permission('pick_list', 'read', 'global'));

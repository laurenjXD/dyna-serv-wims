CREATE POLICY delivery_receipts_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'delivery-receipts'
    AND (
      rbac_internal.has_permission('pick_list', 'execute', 'global')
      OR rbac_internal.has_permission('dispatch', 'execute', 'global')
    )
  );

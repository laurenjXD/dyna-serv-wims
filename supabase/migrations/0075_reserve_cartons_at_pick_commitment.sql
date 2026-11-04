-- Reserve durable carton identities at Stage 1 so dispatch can verify each
-- physical carton QR exactly once. Aggregate balances remain authoritative.

ALTER TABLE public.inventory_units
  DROP CONSTRAINT IF EXISTS inventory_units_status_check,
  DROP CONSTRAINT IF EXISTS inventory_units_selection_shape;

ALTER TABLE public.inventory_units
  ADD CONSTRAINT inventory_units_status_check
    CHECK (status IN ('available', 'reserved', 'selected', 'dispatched', 'quarantined')),
  ADD CONSTRAINT inventory_units_selection_shape CHECK (
    (status IN ('available', 'quarantined') AND pick_list_item_id IS NULL)
    OR (status IN ('reserved', 'selected', 'dispatched') AND pick_list_item_id IS NOT NULL)
  );

DROP POLICY IF EXISTS inventory_units_update ON public.inventory_units;
CREATE POLICY inventory_units_update ON public.inventory_units
  FOR UPDATE TO authenticated
  USING (
    rbac_internal.has_permission('pick_list', 'generate', 'global')
    OR rbac_internal.has_permission('pick_list', 'execute', 'global')
    OR rbac_internal.has_permission('dispatch', 'execute', 'global')
  )
  WITH CHECK (
    rbac_internal.has_permission('pick_list', 'generate', 'global')
    OR rbac_internal.has_permission('pick_list', 'execute', 'global')
    OR rbac_internal.has_permission('dispatch', 'execute', 'global')
  );

GRANT UPDATE ON public.inventory_units TO authenticated;

DROP POLICY IF EXISTS carton_status_history_insert ON public.carton_status_history;
CREATE POLICY carton_status_history_insert ON public.carton_status_history
  FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('receiving', 'confirm', 'global')
    OR rbac_internal.has_permission('pick_list', 'generate', 'global')
    OR rbac_internal.has_permission('pick_list', 'execute', 'global')
    OR rbac_internal.has_permission('dispatch', 'execute', 'global')
  );

GRANT INSERT ON public.carton_status_history TO authenticated;

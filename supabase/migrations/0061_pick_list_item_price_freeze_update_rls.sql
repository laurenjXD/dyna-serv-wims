-- Allow the Stage 1 Trading price freeze to write the immutable document
-- price snapshot after the pick-list line has been inserted.
--
-- The application command updates only `unit_price`, in the same transaction
-- as the reservation. This policy is intentionally gated by the same
-- pick_list.generate capability as the insert path; dispatch permissions are
-- not sufficient to create or alter a newly generated commercial document.

CREATE POLICY pick_list_items_price_freeze_update
  ON public.pick_list_items
  FOR UPDATE TO authenticated
  USING (
    rbac_internal.has_permission('pick_list', 'generate', 'global')
  )
  WITH CHECK (
    rbac_internal.has_permission('pick_list', 'generate', 'global')
  );
--> statement-breakpoint

GRANT UPDATE ON public.pick_list_items TO authenticated;

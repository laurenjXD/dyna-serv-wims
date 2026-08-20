-- Outgoing Stage 1/Stage 2 write-policy completion.
--
-- `commitWithdrawal` reserves balances (qty_committed) under
-- pick_list.generate. `markPickListPicked` transitions allocated -> picked
-- under pick_list.execute. `dispatchPickList` updates the same balance,
-- commitment, commitment-line, and pick-list records under dispatch.execute.
-- These are existing approved commands; this migration supplies the RLS
-- UPDATE grants/policies required now that they run in caller-bound RLS
-- transactions.

CREATE POLICY lot_location_balances_outgoing_update ON public.lot_location_balances
  FOR UPDATE TO authenticated
  USING (
    rbac_internal.has_permission('pick_list', 'generate', 'global')
    OR rbac_internal.has_permission('dispatch', 'execute', 'global')
  )
  WITH CHECK (
    rbac_internal.has_permission('pick_list', 'generate', 'global')
    OR rbac_internal.has_permission('dispatch', 'execute', 'global')
  );
--> statement-breakpoint

GRANT UPDATE ON public.lot_location_balances TO authenticated;
--> statement-breakpoint

CREATE POLICY pick_lists_pick_execute_update ON public.pick_lists
  FOR UPDATE TO authenticated
  USING (rbac_internal.has_permission('pick_list', 'execute', 'global'))
  WITH CHECK (rbac_internal.has_permission('pick_list', 'execute', 'global'));
--> statement-breakpoint

CREATE POLICY inventory_commitments_dispatch_update ON public.inventory_commitments
  FOR UPDATE TO authenticated
  USING (rbac_internal.has_permission('dispatch', 'execute', 'global'))
  WITH CHECK (rbac_internal.has_permission('dispatch', 'execute', 'global'));
--> statement-breakpoint

CREATE POLICY inventory_commitment_lines_dispatch_update ON public.inventory_commitment_lines
  FOR UPDATE TO authenticated
  USING (rbac_internal.has_permission('dispatch', 'execute', 'global'))
  WITH CHECK (rbac_internal.has_permission('dispatch', 'execute', 'global'));
--> statement-breakpoint

GRANT UPDATE ON public.pick_lists, public.inventory_commitments,
  public.inventory_commitment_lines TO authenticated;

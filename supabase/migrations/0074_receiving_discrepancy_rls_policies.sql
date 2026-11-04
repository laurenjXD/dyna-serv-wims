-- Allow the approved receiving workflow to record carton-level OS&D shortages.
-- Migration 0069 created the table and enabled RLS but did not add policies or
-- grants, so any commit containing Missing cartons failed inside the transaction.

DROP POLICY IF EXISTS receiving_discrepancies_select ON public.receiving_discrepancies;
CREATE POLICY receiving_discrepancies_select
  ON public.receiving_discrepancies FOR SELECT TO authenticated
  USING (
    rbac_internal.has_permission('receiving', 'view', 'global')
    OR rbac_internal.has_permission('receiving', 'confirm', 'global')
    OR rbac_internal.has_permission('receiving', 'discrepancy_resolve', 'global')
  );

DROP POLICY IF EXISTS receiving_discrepancies_insert ON public.receiving_discrepancies;
CREATE POLICY receiving_discrepancies_insert
  ON public.receiving_discrepancies FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('receiving', 'confirm', 'global')
  );

DROP POLICY IF EXISTS receiving_discrepancies_update ON public.receiving_discrepancies;
CREATE POLICY receiving_discrepancies_update
  ON public.receiving_discrepancies FOR UPDATE TO authenticated
  USING (
    rbac_internal.has_permission('receiving', 'discrepancy_resolve', 'global')
  )
  WITH CHECK (
    rbac_internal.has_permission('receiving', 'discrepancy_resolve', 'global')
  );

GRANT SELECT, INSERT, UPDATE ON public.receiving_discrepancies TO authenticated;

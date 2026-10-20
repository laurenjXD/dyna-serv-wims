-- Migration 0055: allow the migration billing capability to write recurring
-- fee lines. The migration commit already requires an administrator and the
-- reporting.financial_read capability; keep this table aligned with that
-- application gate and the vmi_contract_terms policy in 0054.

ALTER TABLE public.vmi_recurring_fee_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vmi_recurring_fee_lines FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS vmi_recurring_fee_lines_select ON public.vmi_recurring_fee_lines;
CREATE POLICY vmi_recurring_fee_lines_select ON public.vmi_recurring_fee_lines
  FOR SELECT TO authenticated
  USING (
    rbac_internal.has_permission('reporting', 'financial_read', 'global')
    OR rbac_internal.has_permission('vmi_contract_terms', 'read', 'global')
  );
--> statement-breakpoint

DROP POLICY IF EXISTS vmi_recurring_fee_lines_insert ON public.vmi_recurring_fee_lines;
CREATE POLICY vmi_recurring_fee_lines_insert ON public.vmi_recurring_fee_lines
  FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('reporting', 'financial_read', 'global')
    OR rbac_internal.has_permission('vmi_contract_terms', 'manage', 'global')
  );
--> statement-breakpoint

DROP POLICY IF EXISTS vmi_recurring_fee_lines_update ON public.vmi_recurring_fee_lines;
CREATE POLICY vmi_recurring_fee_lines_update ON public.vmi_recurring_fee_lines
  FOR UPDATE TO authenticated
  USING (
    rbac_internal.has_permission('reporting', 'financial_read', 'global')
    OR rbac_internal.has_permission('vmi_contract_terms', 'manage', 'global')
  )
  WITH CHECK (
    rbac_internal.has_permission('reporting', 'financial_read', 'global')
    OR rbac_internal.has_permission('vmi_contract_terms', 'manage', 'global')
  );
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON public.vmi_recurring_fee_lines TO authenticated;

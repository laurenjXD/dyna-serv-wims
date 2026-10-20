-- Migration 0054: keep VMI contract-term writes aligned with the billing
-- capability used by the migration commit action.
--
-- Two historical 0041 migrations exist in this repository. Depending on the
-- deployed migration history, the final vmi_contract_terms policy may require
-- either vmi_contract_terms.manage or reporting.financial_read. The migration
-- action intentionally accepts either administrator capability, so the RLS
-- policy must do the same. This is limited to the existing administrator /
-- financial capability; it does not grant a new role or bypass RLS.

ALTER TABLE public.vmi_contract_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vmi_contract_terms FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS vmi_contract_terms_select ON public.vmi_contract_terms;
CREATE POLICY vmi_contract_terms_select ON public.vmi_contract_terms
  FOR SELECT TO authenticated
  USING (
    rbac_internal.has_permission('reporting', 'financial_read', 'global')
    OR rbac_internal.has_permission('vmi_contract_terms', 'read', 'global')
  );
--> statement-breakpoint

DROP POLICY IF EXISTS vmi_contract_terms_insert ON public.vmi_contract_terms;
CREATE POLICY vmi_contract_terms_insert ON public.vmi_contract_terms
  FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('reporting', 'financial_read', 'global')
    OR rbac_internal.has_permission('vmi_contract_terms', 'manage', 'global')
  );
--> statement-breakpoint

DROP POLICY IF EXISTS vmi_contract_terms_update ON public.vmi_contract_terms;
CREATE POLICY vmi_contract_terms_update ON public.vmi_contract_terms
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

GRANT SELECT, INSERT, UPDATE ON public.vmi_contract_terms TO authenticated;

-- Migration 0041: Dynamic capability-based RLS for VMI and Billing tables.
--
-- Gated by capability `reporting.financial_read` (global), which is assigned
-- dynamically via role grants in Settings.
--
-- Covers:
--   1. vmi_contract_terms
--   2. vmi_recurring_fee_lines
--   3. vmi_daily_balance_ledger
--   4. vmi_charge_lines
--   5. vmi_permits
--   6. vmi_billing_periods
--   7. vmi_payments
--   8. vmi_manpower_hours_log

-- ===========================================================================
-- 1. `vmi_contract_terms`
-- ===========================================================================
ALTER TABLE public.vmi_contract_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vmi_contract_terms FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY vmi_contract_terms_select ON public.vmi_contract_terms
  FOR SELECT TO authenticated
  USING (
    rbac_internal.has_permission('reporting', 'financial_read', 'global')
  );
--> statement-breakpoint

CREATE POLICY vmi_contract_terms_insert ON public.vmi_contract_terms
  FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('reporting', 'financial_read', 'global')
  );
--> statement-breakpoint

CREATE POLICY vmi_contract_terms_update ON public.vmi_contract_terms
  FOR UPDATE TO authenticated
  USING (
    rbac_internal.has_permission('reporting', 'financial_read', 'global')
  )
  WITH CHECK (
    rbac_internal.has_permission('reporting', 'financial_read', 'global')
  );
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON public.vmi_contract_terms TO authenticated;
--> statement-breakpoint

-- ===========================================================================
-- 2. `vmi_recurring_fee_lines`
-- ===========================================================================
ALTER TABLE public.vmi_recurring_fee_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vmi_recurring_fee_lines FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY vmi_recurring_fee_lines_select ON public.vmi_recurring_fee_lines
  FOR SELECT TO authenticated
  USING (
    rbac_internal.has_permission('reporting', 'financial_read', 'global')
  );
--> statement-breakpoint

CREATE POLICY vmi_recurring_fee_lines_insert ON public.vmi_recurring_fee_lines
  FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('reporting', 'financial_read', 'global')
  );
--> statement-breakpoint

CREATE POLICY vmi_recurring_fee_lines_update ON public.vmi_recurring_fee_lines
  FOR UPDATE TO authenticated
  USING (
    rbac_internal.has_permission('reporting', 'financial_read', 'global')
  )
  WITH CHECK (
    rbac_internal.has_permission('reporting', 'financial_read', 'global')
  );
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON public.vmi_recurring_fee_lines TO authenticated;
--> statement-breakpoint

-- ===========================================================================
-- 3. `vmi_daily_balance_ledger`
-- ===========================================================================
ALTER TABLE public.vmi_daily_balance_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vmi_daily_balance_ledger FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY vmi_daily_balance_ledger_select ON public.vmi_daily_balance_ledger
  FOR SELECT TO authenticated
  USING (
    rbac_internal.has_permission('reporting', 'financial_read', 'global')
  );
--> statement-breakpoint

CREATE POLICY vmi_daily_balance_ledger_insert ON public.vmi_daily_balance_ledger
  FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('reporting', 'financial_read', 'global')
  );
--> statement-breakpoint

GRANT SELECT, INSERT ON public.vmi_daily_balance_ledger TO authenticated;
--> statement-breakpoint

-- ===========================================================================
-- 4. `vmi_charge_lines`
-- ===========================================================================
ALTER TABLE public.vmi_charge_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vmi_charge_lines FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY vmi_charge_lines_select ON public.vmi_charge_lines
  FOR SELECT TO authenticated
  USING (
    rbac_internal.has_permission('reporting', 'financial_read', 'global')
  );
--> statement-breakpoint

CREATE POLICY vmi_charge_lines_insert ON public.vmi_charge_lines
  FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('reporting', 'financial_read', 'global')
  );
--> statement-breakpoint

CREATE POLICY vmi_charge_lines_update ON public.vmi_charge_lines
  FOR UPDATE TO authenticated
  USING (
    rbac_internal.has_permission('reporting', 'financial_read', 'global')
  )
  WITH CHECK (
    rbac_internal.has_permission('reporting', 'financial_read', 'global')
  );
--> statement-breakpoint

CREATE POLICY vmi_charge_lines_delete ON public.vmi_charge_lines
  FOR DELETE TO authenticated
  USING (
    rbac_internal.has_permission('reporting', 'financial_read', 'global')
  );
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vmi_charge_lines TO authenticated;
--> statement-breakpoint

-- ===========================================================================
-- 5. `vmi_permits`
-- ===========================================================================
ALTER TABLE public.vmi_permits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vmi_permits FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY vmi_permits_select ON public.vmi_permits
  FOR SELECT TO authenticated
  USING (
    rbac_internal.has_permission('reporting', 'financial_read', 'global')
  );
--> statement-breakpoint

CREATE POLICY vmi_permits_insert ON public.vmi_permits
  FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('reporting', 'financial_read', 'global')
  );
--> statement-breakpoint

CREATE POLICY vmi_permits_update ON public.vmi_permits
  FOR UPDATE TO authenticated
  USING (
    rbac_internal.has_permission('reporting', 'financial_read', 'global')
  )
  WITH CHECK (
    rbac_internal.has_permission('reporting', 'financial_read', 'global')
  );
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON public.vmi_permits TO authenticated;
--> statement-breakpoint

-- ===========================================================================
-- 6. `vmi_billing_periods`
-- ===========================================================================
ALTER TABLE public.vmi_billing_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vmi_billing_periods FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY vmi_billing_periods_select ON public.vmi_billing_periods
  FOR SELECT TO authenticated
  USING (
    rbac_internal.has_permission('reporting', 'financial_read', 'global')
  );
--> statement-breakpoint

CREATE POLICY vmi_billing_periods_insert ON public.vmi_billing_periods
  FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('reporting', 'financial_read', 'global')
  );
--> statement-breakpoint

CREATE POLICY vmi_billing_periods_update ON public.vmi_billing_periods
  FOR UPDATE TO authenticated
  USING (
    rbac_internal.has_permission('reporting', 'financial_read', 'global')
  )
  WITH CHECK (
    rbac_internal.has_permission('reporting', 'financial_read', 'global')
  );
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON public.vmi_billing_periods TO authenticated;
--> statement-breakpoint

-- ===========================================================================
-- 7. `vmi_payments`
-- ===========================================================================
ALTER TABLE public.vmi_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vmi_payments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY vmi_payments_select ON public.vmi_payments
  FOR SELECT TO authenticated
  USING (
    rbac_internal.has_permission('reporting', 'financial_read', 'global')
  );
--> statement-breakpoint

GRANT SELECT ON public.vmi_payments TO authenticated;
--> statement-breakpoint

-- ===========================================================================
-- 8. `vmi_manpower_hours_log`
-- ===========================================================================
ALTER TABLE public.vmi_manpower_hours_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vmi_manpower_hours_log FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY vmi_manpower_hours_log_select ON public.vmi_manpower_hours_log
  FOR SELECT TO authenticated
  USING (
    rbac_internal.has_permission('reporting', 'financial_read', 'global')
  );
--> statement-breakpoint

CREATE POLICY vmi_manpower_hours_log_insert ON public.vmi_manpower_hours_log
  FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('reporting', 'financial_read', 'global')
  );
--> statement-breakpoint

CREATE POLICY vmi_manpower_hours_log_update ON public.vmi_manpower_hours_log
  FOR UPDATE TO authenticated
  USING (
    rbac_internal.has_permission('reporting', 'financial_read', 'global')
  )
  WITH CHECK (
    rbac_internal.has_permission('reporting', 'financial_read', 'global')
  );
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON public.vmi_manpower_hours_log TO authenticated;

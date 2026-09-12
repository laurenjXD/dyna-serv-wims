-- specs/12-vmi-billing/design.md §4 / tasks.md F.1-F.5
--
-- Complete the VMI billing RLS boundary for the tables left open by 0041.
-- Office financial users can read the full billing workspace; an assigned VMI
-- party user can read only its own billing rows. Party users never receive a
-- mutation policy. The application layer additionally narrows close/payment
-- commands to the approved Administrator workflow.

-- ---------------------------------------------------------------------------
-- Shared read predicate: reporting.financial_read for office users, or the
-- existing party-portal capability for the owning VMI party.
-- ---------------------------------------------------------------------------

-- 0041 established the office policies; widen only SELECT so the owning
-- party can see its own contract and permit context without gaining access to
-- the office Billing & Pricing workspace or any mutation operation.
DROP POLICY IF EXISTS vmi_contract_terms_select ON public.vmi_contract_terms;
CREATE POLICY vmi_contract_terms_select ON public.vmi_contract_terms
  FOR SELECT TO authenticated
  USING (
    rbac_internal.has_permission('vmi_contract_terms', 'read', 'global')
    OR rbac_internal.can_access_party_resource('vmi_statements', 'read', party_id, 'vmi')
  );
--> statement-breakpoint

DROP POLICY IF EXISTS vmi_permits_select ON public.vmi_permits;
CREATE POLICY vmi_permits_select ON public.vmi_permits
  FOR SELECT TO authenticated
  USING (
    rbac_internal.has_permission('vmi_permits', 'read', 'global')
    OR rbac_internal.can_access_party_resource('vmi_statements', 'read', party_id, 'vmi')
  );
--> statement-breakpoint

ALTER TABLE public.vmi_recurring_fee_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vmi_recurring_fee_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE public.vmi_daily_balance_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vmi_daily_balance_ledger FORCE ROW LEVEL SECURITY;
ALTER TABLE public.vmi_charge_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vmi_charge_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE public.vmi_billing_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vmi_billing_periods FORCE ROW LEVEL SECURITY;
ALTER TABLE public.vmi_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vmi_payments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.vmi_manpower_hours_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vmi_manpower_hours_log FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS vmi_recurring_fee_lines_select ON public.vmi_recurring_fee_lines;
CREATE POLICY vmi_recurring_fee_lines_select ON public.vmi_recurring_fee_lines
  FOR SELECT TO authenticated
  USING (
    rbac_internal.has_permission('reporting', 'financial_read', 'global')
    OR rbac_internal.can_access_party_resource('vmi_statements', 'read', party_id, 'vmi')
  );
--> statement-breakpoint

DROP POLICY IF EXISTS vmi_recurring_fee_lines_insert ON public.vmi_recurring_fee_lines;
CREATE POLICY vmi_recurring_fee_lines_insert ON public.vmi_recurring_fee_lines
  FOR INSERT TO authenticated
  WITH CHECK (rbac_internal.has_permission('reporting', 'financial_read', 'global'));
--> statement-breakpoint

DROP POLICY IF EXISTS vmi_recurring_fee_lines_update ON public.vmi_recurring_fee_lines;
CREATE POLICY vmi_recurring_fee_lines_update ON public.vmi_recurring_fee_lines
  FOR UPDATE TO authenticated
  USING (rbac_internal.has_permission('reporting', 'financial_read', 'global'))
  WITH CHECK (rbac_internal.has_permission('reporting', 'financial_read', 'global'));
--> statement-breakpoint

DROP POLICY IF EXISTS vmi_recurring_fee_lines_delete ON public.vmi_recurring_fee_lines;
CREATE POLICY vmi_recurring_fee_lines_delete ON public.vmi_recurring_fee_lines
  FOR DELETE TO authenticated
  USING (rbac_internal.has_permission('reporting', 'financial_read', 'global'));
--> statement-breakpoint

DROP POLICY IF EXISTS vmi_daily_balance_ledger_select ON public.vmi_daily_balance_ledger;
CREATE POLICY vmi_daily_balance_ledger_select ON public.vmi_daily_balance_ledger
  FOR SELECT TO authenticated
  USING (
    rbac_internal.has_permission('reporting', 'financial_read', 'global')
    OR rbac_internal.can_access_party_resource('vmi_statements', 'read', party_id, 'vmi')
  );
-- No INSERT/UPDATE/DELETE policy: the internal cron route uses service_role,
-- and the ledger is immutable for authenticated callers.
--> statement-breakpoint

DROP POLICY IF EXISTS vmi_charge_lines_select ON public.vmi_charge_lines;
CREATE POLICY vmi_charge_lines_select ON public.vmi_charge_lines
  FOR SELECT TO authenticated
  USING (
    rbac_internal.has_permission('reporting', 'financial_read', 'global')
    OR rbac_internal.can_access_party_resource('vmi_statements', 'read', party_id, 'vmi')
  );
--> statement-breakpoint

DROP POLICY IF EXISTS vmi_charge_lines_insert ON public.vmi_charge_lines;
CREATE POLICY vmi_charge_lines_insert ON public.vmi_charge_lines
  FOR INSERT TO authenticated
  WITH CHECK (rbac_internal.has_permission('reporting', 'financial_read', 'global'));
--> statement-breakpoint

DROP POLICY IF EXISTS vmi_charge_lines_update ON public.vmi_charge_lines;
CREATE POLICY vmi_charge_lines_update ON public.vmi_charge_lines
  FOR UPDATE TO authenticated
  USING (rbac_internal.has_permission('reporting', 'financial_read', 'global'))
  WITH CHECK (rbac_internal.has_permission('reporting', 'financial_read', 'global'));
--> statement-breakpoint

DROP POLICY IF EXISTS vmi_billing_periods_select ON public.vmi_billing_periods;
CREATE POLICY vmi_billing_periods_select ON public.vmi_billing_periods
  FOR SELECT TO authenticated
  USING (
    rbac_internal.has_permission('reporting', 'financial_read', 'global')
    OR rbac_internal.can_access_party_resource('vmi_statements', 'read', party_id, 'vmi')
  );
--> statement-breakpoint

DROP POLICY IF EXISTS vmi_billing_periods_insert ON public.vmi_billing_periods;
CREATE POLICY vmi_billing_periods_insert ON public.vmi_billing_periods
  FOR INSERT TO authenticated
  WITH CHECK (rbac_internal.has_permission('reporting', 'financial_read', 'global'));
--> statement-breakpoint

DROP POLICY IF EXISTS vmi_billing_periods_update ON public.vmi_billing_periods;
CREATE POLICY vmi_billing_periods_update ON public.vmi_billing_periods
  FOR UPDATE TO authenticated
  USING (rbac_internal.has_permission('reporting', 'financial_read', 'global'))
  WITH CHECK (rbac_internal.has_permission('reporting', 'financial_read', 'global'));
--> statement-breakpoint

DROP POLICY IF EXISTS vmi_payments_select ON public.vmi_payments;
CREATE POLICY vmi_payments_select ON public.vmi_payments
  FOR SELECT TO authenticated
  USING (
    rbac_internal.has_permission('reporting', 'financial_read', 'global')
    OR rbac_internal.can_access_party_resource('vmi_statements', 'read', party_id, 'vmi')
  );
--> statement-breakpoint

DROP POLICY IF EXISTS vmi_payments_insert ON public.vmi_payments;
CREATE POLICY vmi_payments_insert ON public.vmi_payments
  FOR INSERT TO authenticated
  WITH CHECK (rbac_internal.has_permission('reporting', 'financial_read', 'global'));
-- No UPDATE/DELETE policy: payment history is append-only.
--> statement-breakpoint

DROP POLICY IF EXISTS vmi_manpower_hours_log_select ON public.vmi_manpower_hours_log;
CREATE POLICY vmi_manpower_hours_log_select ON public.vmi_manpower_hours_log
  FOR SELECT TO authenticated
  USING (
    rbac_internal.has_permission('reporting', 'financial_read', 'global')
    OR rbac_internal.can_access_party_resource('vmi_statements', 'read', party_id, 'vmi')
  );
--> statement-breakpoint

DROP POLICY IF EXISTS vmi_manpower_hours_log_insert ON public.vmi_manpower_hours_log;
CREATE POLICY vmi_manpower_hours_log_insert ON public.vmi_manpower_hours_log
  FOR INSERT TO authenticated
  WITH CHECK (rbac_internal.has_permission('reporting', 'financial_read', 'global'));
-- No UPDATE/DELETE policy: a new period entry is append-only.
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vmi_recurring_fee_lines TO authenticated;
GRANT SELECT ON public.vmi_daily_balance_ledger TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.vmi_charge_lines TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.vmi_billing_periods TO authenticated;
GRANT SELECT, INSERT ON public.vmi_payments TO authenticated;
GRANT SELECT, INSERT ON public.vmi_manpower_hours_log TO authenticated;

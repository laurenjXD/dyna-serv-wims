-- Gap fix (rbac-rls-reviewer, "07 receiving reversed" per-line commit rework
-- follow-up -- see specs/00-steering/revision-log.md and
-- specs/07-incoming-receiving/design.md §9):
--
-- Gap 1: `lots`, `lot_location_balances`, and `inventory_transactions` had
-- SELECT policies (0008_rls_policies.sql) and GRANT SELECT only. No INSERT
-- policy or GRANT INSERT existed for any of the three, despite
-- `commitWrrLine` (lib/actions/receiving.ts) inserting into all three under
-- `receiving.confirm`, and `dispatchPickList` (lib/actions/withdrawals.ts)
-- inserting into `inventory_transactions` under `dispatch.execute`. A grep of
-- lib/actions/*.ts confirms these are the only two current legitimate
-- writers of these three tables:
--   - `lots` INSERT:                   receiving.confirm only
--   - `lot_location_balances` INSERT:  receiving.confirm only
--   - `inventory_transactions` INSERT: receiving.confirm OR dispatch.execute
-- (`transfers.ts` inserts only into transfer_requests/inspection_cases/
-- inspection_dispositions -- it does not yet write to these three tables;
-- `withdrawals.ts`'s pick_list.generate path inserts inventory_commitments/
-- lines, not these three, either.) If a future feature adds another
-- legitimate writer (e.g. `11`'s transfer execution posting its own
-- inventory_transactions rows), its capability must be OR'd into the
-- relevant policy below rather than assumed to already be covered.
--
-- Both capabilities ('receiving','confirm','global' and
-- 'dispatch','execute','global') are already seeded in
-- 0005_rbac_constraints_and_seed.sql and already granted to warehouse_staff
-- and supervisor -- no new capability is introduced here.
--
-- Gap 2: wrr_items.committed_at (0021_wrr_item_committed_at.sql) is the
-- per-line commit idempotency gate for commitWrrLine's conditional
-- `UPDATE ... WHERE committed_at IS NULL`. wrr_items_update
-- (0012_receiving_disposition_and_policies.sql) deliberately carries no
-- WITH CHECK ("column-level CHECK constraints and app-layer validation own
-- the field-level rules") so this is fixed with a BEFORE UPDATE trigger, not
-- a WITH CHECK clause that would contradict that documented design choice.
-- The trigger rejects any UPDATE that would move committed_at from a
-- non-NULL value back to NULL or to a different non-NULL value -- i.e. once
-- set, committed_at is a one-way, no-further-change gate. NULL -> timestamp
-- (the normal commit) and no-change updates remain allowed.

-- ===========================================================================
-- 1. INSERT policy + GRANT for `lots`.
-- ===========================================================================

CREATE POLICY lots_insert ON public.lots
  FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('receiving', 'confirm', 'global')
  );
--> statement-breakpoint

GRANT INSERT ON public.lots TO authenticated;
--> statement-breakpoint

-- ===========================================================================
-- 2. INSERT policy + GRANT for `lot_location_balances`.
-- ===========================================================================

CREATE POLICY lot_location_balances_insert ON public.lot_location_balances
  FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('receiving', 'confirm', 'global')
  );
--> statement-breakpoint

GRANT INSERT ON public.lot_location_balances TO authenticated;
--> statement-breakpoint

-- ===========================================================================
-- 3. INSERT policy + GRANT for `inventory_transactions`.
--    Two legitimate writers today: receiving's per-line commit
--    (receiving.confirm) and outgoing dispatch (dispatch.execute).
-- ===========================================================================

CREATE POLICY inventory_transactions_insert ON public.inventory_transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('receiving', 'confirm', 'global')
    OR rbac_internal.has_permission('dispatch', 'execute', 'global')
  );
--> statement-breakpoint

GRANT INSERT ON public.inventory_transactions TO authenticated;
--> statement-breakpoint

-- ===========================================================================
-- 4. wrr_items.committed_at one-way trigger (Gap 2).
--    Plain (non-SECURITY DEFINER) trigger function: it only compares NEW vs
--    OLD on the row already being updated under the caller's own RLS-checked
--    UPDATE, so no elevated privilege is needed.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.wrr_items_protect_committed_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.committed_at IS NOT NULL AND NEW.committed_at IS DISTINCT FROM OLD.committed_at THEN
    RAISE EXCEPTION 'wrr_items.committed_at cannot be changed once set (id=%)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER wrr_items_protect_committed_at
  BEFORE UPDATE ON public.wrr_items
  FOR EACH ROW
  EXECUTE FUNCTION public.wrr_items_protect_committed_at();

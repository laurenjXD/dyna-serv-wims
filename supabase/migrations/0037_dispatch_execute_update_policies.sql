-- Gap fix (main-thread task, "dispatchPickList Stage 2 dispatch fix" follow-up
-- -- see specs/08-outgoing-withdrawal-and-two-stage-commitment/design.md §7 and
-- 0023_core_and_pick_write_policies.sql's own header note, section 7/8:
-- "Cancellation of inventory_commitments to 'executed' is explicitly a TODO
-- in the command body today ... no UPDATE policy is added for
-- inventory_commitments/inventory_commitment_lines here, because there is no
-- real caller yet to gate ... When that TODO is implemented, its migration
-- must add the matching UPDATE policy alongside the code, following this same
-- pattern."
--
-- That TODO is now implemented: `dispatchPickList` (lib/actions/withdrawals.ts,
-- Stage 2, gated on `dispatch.execute`) now performs real UPDATEs, per line
-- and per pick list, against three tables that previously had SELECT/INSERT
-- policies only (0008_rls_policies.sql for SELECT;
-- 0022_receiving_inventory_insert_policies.sql /
-- 0023_core_and_pick_write_policies.sql for INSERT). Because
-- `dispatchPickList` runs inside `withRlsTransaction` (real, non-bypassing
-- RLS enforcement -- see 0023's own "A2 app-wide RLS session-binding rollout"
-- header), every one of these UPDATEs currently fails closed with
-- "permission denied for table ..." A read of `dispatchPickList`'s body
-- (2026-08-20) confirms the exact operations, all inside the same dispatch
-- transaction:
--
--   - lot_location_balances: UPDATE qty_remaining, qty_committed, updated_at
--     (per pick_list_items line -- decrements the authoritative balance and
--     releases the Stage 1 reservation on the same row).
--   - inventory_commitment_lines: UPDATE status ('active' -> 'executed'),
--     qty_executed, updated_at (per line).
--   - inventory_commitments: UPDATE status ('active' -> 'executed'),
--     completed_at, updated_at (the parent header, once per pick list, after
--     every line above has executed).
--
-- (`pick_lists` already has its matching Stage 2 UPDATE policy --
-- `pick_lists_update` in 0023 -- added at the same time as `pick_lists_insert`
-- for exactly this reason; this migration follows that same policy shape for
-- the three tables 0023 explicitly deferred.)
--
-- Capability + scope: `dispatch.execute` at `global` scope, exactly as named
-- in the task and already seeded/granted in 0005_rbac_constraints_and_seed.sql
-- (warehouse_staff, supervisor) and 0027_administrator_operational_capabilities.sql
-- (administrator). No new capability is introduced here -- same discipline as
-- 0022/0023.
--
-- Scoping match against each table's existing SELECT/INSERT policies (per
-- task instruction: match the existing pattern, do not invent a different
-- authorization model for UPDATE):
--
--   - lot_location_balances: the existing SELECT policy
--     (`lot_location_balances_select`, 0008) is two-branch --
--     `inventory.read` global OR a VMI party-scoped join through the parent
--     `lots` row. The existing INSERT policy (`lot_location_balances_insert`,
--     0022) is single-branch, staff-only (`receiving.confirm`), because
--     receiving is the only current INSERT writer and there is no
--     party-initiated insert path. The same reasoning applies to UPDATE:
--     `dispatchPickList` is warehouse-floor/dispatch-staff-only (there is no
--     party-initiated dispatch-execution path, and `can_access_party_resource`
--     is a *read* helper -- design.md never describes a party-scoped write
--     branch for this table), so this UPDATE policy is single-branch,
--     staff-only (`dispatch.execute`), mirroring INSERT's shape rather than
--     SELECT's two-branch shape -- consistent with how 0022/0023 already
--     narrowed INSERT relative to SELECT for this same table for the same
--     reason.
--   - inventory_commitments / inventory_commitment_lines: the existing SELECT
--     policies (0008) are staff-only, `pick_list.read` OR `dispatch.read`
--     (lines inherit via a join to the parent header). The existing INSERT
--     policies (0023) are staff-only, `pick_list.generate` (Stage 1). Both
--     are already single-branch, staff-only shapes with no party grant
--     anywhere in the existing SELECT/INSERT policies for these two tables --
--     this UPDATE policy continues that exact shape, staff-only, using
--     `dispatch.execute` (the Stage 2 counterpart to Stage 1's
--     `pick_list.generate`), exactly matching `pick_lists_update`'s existing
--     Stage 2 pattern (0023) for the sibling `pick_lists` table.
--
-- Same style as 0022/0023 throughout: CREATE POLICY ... FOR UPDATE TO
-- authenticated USING (...) WITH CHECK (...), followed by a narrow GRANT.

-- ===========================================================================
-- 1. UPDATE policy + GRANT for `lot_location_balances` (Stage 2,
--    dispatchPickList -- decrements qty_remaining/qty_committed).
-- ===========================================================================

CREATE POLICY lot_location_balances_update ON public.lot_location_balances
  FOR UPDATE TO authenticated
  USING (
    rbac_internal.has_permission('dispatch', 'execute', 'global')
  )
  WITH CHECK (
    rbac_internal.has_permission('dispatch', 'execute', 'global')
  );
--> statement-breakpoint

GRANT UPDATE ON public.lot_location_balances TO authenticated;
--> statement-breakpoint

-- ===========================================================================
-- 2. UPDATE policy + GRANT for `inventory_commitment_lines` (Stage 2,
--    dispatchPickList -- transitions each line to 'executed').
-- ===========================================================================

CREATE POLICY inventory_commitment_lines_update ON public.inventory_commitment_lines
  FOR UPDATE TO authenticated
  USING (
    rbac_internal.has_permission('dispatch', 'execute', 'global')
  )
  WITH CHECK (
    rbac_internal.has_permission('dispatch', 'execute', 'global')
  );
--> statement-breakpoint

GRANT UPDATE ON public.inventory_commitment_lines TO authenticated;
--> statement-breakpoint

-- ===========================================================================
-- 3. UPDATE policy + GRANT for `inventory_commitments` (Stage 2,
--    dispatchPickList -- transitions the parent header to 'executed' once
--    every line has executed).
-- ===========================================================================

CREATE POLICY inventory_commitments_update ON public.inventory_commitments
  FOR UPDATE TO authenticated
  USING (
    rbac_internal.has_permission('dispatch', 'execute', 'global')
  )
  WITH CHECK (
    rbac_internal.has_permission('dispatch', 'execute', 'global')
  );
--> statement-breakpoint

GRANT UPDATE ON public.inventory_commitments TO authenticated;

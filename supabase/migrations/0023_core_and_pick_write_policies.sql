-- Gap fix (rbac-rls-reviewer, A2 app-wide RLS session-binding rollout pass --
-- see specs/00-steering/revision-log.md, dated 2026-08-11):
--
-- Gap 1: `items`, `locations`, `parties`, `party_roles` had SELECT policies
-- only (0008_rls_policies.sql) and `GRANT SELECT ... TO authenticated` only.
-- No INSERT/UPDATE/DELETE policy or grant existed for any of the four,
-- despite `lib/actions/items.ts`, `lib/actions/locations.ts`, and
-- `lib/actions/parties.ts` performing real mutations now that the A2 rollout
-- runs these actions through each caller's own RLS-bound session rather than
-- a bypassing connection. Every one of those mutations currently fails
-- closed with "permission denied for table ..." A read of all three files
-- (2026-08-11) confirms the exact operations:
--   - items.ts:     createItem (INSERT), updateItem (UPDATE, full row),
--                    deactivateItem (UPDATE, sets is_active = false only --
--                    a soft delete, never a real DELETE). No DELETE anywhere.
--   - locations.ts: createLocation (INSERT), updateLocation (UPDATE, full
--                    row), deactivateLocation (UPDATE, sets is_active =
--                    false only). No DELETE anywhere.
--   - parties.ts:   createParty (INSERT), updateParty (UPDATE, full row),
--                    deactivateParty (UPDATE, sets is_active = false only).
--                    addPartyRole (INSERT into party_roles), removePartyRole
--                    (a REAL DELETE from party_roles, scoped by both
--                    roleRowId AND partyId). No UPDATE on party_roles
--                    anywhere -- role rows are add/remove only, never edited
--                    in place.
--
-- Each table's mutation policies are gated on that table's own `.manage`
-- capability -- `items.manage` / `locations.manage` / `parties.manage` --
-- all three already seeded and granted to `administrator` only, at `global`
-- scope, in 0005_rbac_constraints_and_seed.sql (confirmed by re-reading that
-- migration directly, not assumed). `party_roles` has no capability catalog
-- entry of its own in design.md §3.2's catalog -- it is a sub-record of
-- `parties`, so its write policies are gated on `parties.manage`, exactly
-- like its existing SELECT policy (`party_roles_select` in
-- 0008_rls_policies.sql) already inherits visibility from the parent
-- `parties` row rather than defining an independent capability.
--
-- Gap 2: `pick_lists`, `pick_list_items`, `inventory_commitments`,
-- `inventory_commitment_lines` had the same SELECT-only shape. 0022's own
-- header comment explicitly flagged this as a known, deliberately
-- out-of-scope gap at the time ("`withdrawals.ts`'s pick_list.generate path
-- inserts inventory_commitments/lines, not these three [lots/
-- lot_location_balances/inventory_transactions], either" -- naming the gap
-- without closing it). A read of `lib/actions/withdrawals.ts` (2026-08-11)
-- confirms the exact operations, against
-- specs/08-outgoing-withdrawal-and-two-stage-commitment/design.md §6/§7 and
-- the capability catalog:
--   - commitWithdrawal (Stage 1, requires `pick_list.generate`): INSERT into
--     pick_lists, pick_list_items, inventory_commitments, and
--     inventory_commitment_lines -- all four, in the same server-command
--     transaction.
--   - dispatchPickList (Stage 2, requires `dispatch.execute`): UPDATE
--     pick_lists.status (and updated_at) to 'dispatched'. Cancellation of
--     inventory_commitments to 'executed' is explicitly a TODO in the
--     command body today ("resolve commitment id and update commitment +
--     lines atomically" -- not yet implemented) -- no UPDATE policy is added
--     for inventory_commitments/inventory_commitment_lines here, because
--     there is no real caller yet to gate; adding one now would be
--     speculative, not a fix for an observed gap. When that TODO is
--     implemented, its migration must add the matching UPDATE policy
--     alongside the code, following this same pattern.
--   - No UPDATE anywhere for pick_list_items in current code.
--
-- Both capabilities ('pick_list','generate','global' and
-- 'dispatch','execute','global') are already seeded in
-- 0005_rbac_constraints_and_seed.sql and already granted to warehouse_staff
-- and supervisor -- no new capability is introduced here, matching 0022's
-- established discipline.
--
-- Same style as 0022_receiving_inventory_insert_policies.sql throughout:
-- CREATE POLICY ... FOR INSERT/UPDATE TO authenticated WITH CHECK (...),
-- followed by a narrow GRANT.

-- ===========================================================================
-- 1. INSERT/UPDATE policies + GRANTs for `items`.
-- ===========================================================================

CREATE POLICY items_insert ON public.items
  FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('items', 'manage', 'global')
  );
--> statement-breakpoint

CREATE POLICY items_update ON public.items
  FOR UPDATE TO authenticated
  USING (
    rbac_internal.has_permission('items', 'manage', 'global')
  )
  WITH CHECK (
    rbac_internal.has_permission('items', 'manage', 'global')
  );
--> statement-breakpoint

GRANT INSERT, UPDATE ON public.items TO authenticated;
--> statement-breakpoint

-- ===========================================================================
-- 2. INSERT/UPDATE policies + GRANTs for `locations`.
-- ===========================================================================

CREATE POLICY locations_insert ON public.locations
  FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('locations', 'manage', 'global')
  );
--> statement-breakpoint

CREATE POLICY locations_update ON public.locations
  FOR UPDATE TO authenticated
  USING (
    rbac_internal.has_permission('locations', 'manage', 'global')
  )
  WITH CHECK (
    rbac_internal.has_permission('locations', 'manage', 'global')
  );
--> statement-breakpoint

GRANT INSERT, UPDATE ON public.locations TO authenticated;
--> statement-breakpoint

-- ===========================================================================
-- 3. INSERT/UPDATE policies + GRANTs for `parties`.
-- ===========================================================================

CREATE POLICY parties_insert ON public.parties
  FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('parties', 'manage', 'global')
  );
--> statement-breakpoint

CREATE POLICY parties_update ON public.parties
  FOR UPDATE TO authenticated
  USING (
    rbac_internal.has_permission('parties', 'manage', 'global')
  )
  WITH CHECK (
    rbac_internal.has_permission('parties', 'manage', 'global')
  );
--> statement-breakpoint

GRANT INSERT, UPDATE ON public.parties TO authenticated;
--> statement-breakpoint

-- ===========================================================================
-- 4. INSERT/DELETE policies + GRANTs for `party_roles` (gated on
--    `parties.manage`, the parent resource's capability -- no independent
--    `party_roles` capability exists in the catalog). No UPDATE: role rows
--    are add/remove only, never edited in place.
-- ===========================================================================

CREATE POLICY party_roles_insert ON public.party_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('parties', 'manage', 'global')
  );
--> statement-breakpoint

CREATE POLICY party_roles_delete ON public.party_roles
  FOR DELETE TO authenticated
  USING (
    rbac_internal.has_permission('parties', 'manage', 'global')
  );
--> statement-breakpoint

GRANT INSERT, DELETE ON public.party_roles TO authenticated;
--> statement-breakpoint

-- ===========================================================================
-- 5. INSERT policy + GRANT for `pick_lists` (Stage 1, commitWithdrawal).
-- ===========================================================================

CREATE POLICY pick_lists_insert ON public.pick_lists
  FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('pick_list', 'generate', 'global')
  );
--> statement-breakpoint

-- UPDATE policy for `pick_lists` (Stage 2, dispatchPickList -- transitions
-- status to 'dispatched').
CREATE POLICY pick_lists_update ON public.pick_lists
  FOR UPDATE TO authenticated
  USING (
    rbac_internal.has_permission('dispatch', 'execute', 'global')
  )
  WITH CHECK (
    rbac_internal.has_permission('dispatch', 'execute', 'global')
  );
--> statement-breakpoint

GRANT INSERT, UPDATE ON public.pick_lists TO authenticated;
--> statement-breakpoint

-- ===========================================================================
-- 6. INSERT policy + GRANT for `pick_list_items` (Stage 1, commitWithdrawal).
--    No UPDATE anywhere in current code.
-- ===========================================================================

CREATE POLICY pick_list_items_insert ON public.pick_list_items
  FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('pick_list', 'generate', 'global')
  );
--> statement-breakpoint

GRANT INSERT ON public.pick_list_items TO authenticated;
--> statement-breakpoint

-- ===========================================================================
-- 7. INSERT policy + GRANT for `inventory_commitments` (Stage 1,
--    commitWithdrawal). No UPDATE policy -- the Stage 2 "transition
--    commitment to executed" path is a TODO in dispatchPickList today, not a
--    real caller; see header note.
-- ===========================================================================

CREATE POLICY inventory_commitments_insert ON public.inventory_commitments
  FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('pick_list', 'generate', 'global')
  );
--> statement-breakpoint

GRANT INSERT ON public.inventory_commitments TO authenticated;
--> statement-breakpoint

-- ===========================================================================
-- 8. INSERT policy + GRANT for `inventory_commitment_lines` (Stage 1,
--    commitWithdrawal). No UPDATE policy -- see note in section 7.
-- ===========================================================================

CREATE POLICY inventory_commitment_lines_insert ON public.inventory_commitment_lines
  FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('pick_list', 'generate', 'global')
  );
--> statement-breakpoint

GRANT INSERT ON public.inventory_commitment_lines TO authenticated;

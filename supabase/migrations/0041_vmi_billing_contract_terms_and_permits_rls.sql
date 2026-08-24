-- specs/12-vmi-billing/design.md §4 / tasks.md Task Group F (F.1, partial)
--
-- Closes a real, currently-live security gap: `vmi_contract_terms` and
-- `vmi_permits` (both defined in lib/db/schema/vmi_billing.ts, both created
-- in 0034_vmi_billing_tables.sql) have NO Row Level Security enabled at all
-- today — confirmed by direct grep across supabase/migrations/ before writing
-- this file: there is no `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` for
-- either table anywhere. Every authenticated Postgres role can currently
-- read/insert/update/delete every party's contract rate card and every
-- party's import/export permit unrestricted. tasks.md's own B.9/B.10/B.12
-- notes confirm this was known and deliberately deferred ("RLS confirmed
-- correctly absent, Task Group F, separate not-yet-done work") — this
-- migration is the first slice of that deferred work, scoped narrowly to the
-- two tables blocking tonight's VMI billing rates/permits CRUD screens
-- (`billing-pricing/vmi/contracts/[partyId]/edit`, F.1/E.4, and
-- `billing-pricing/vmi/permits/[partyId]`, F.1/E.5). The remaining Task
-- Group F tables (`vmi_recurring_fee_lines`, `vmi_daily_balance_ledger`,
-- `vmi_charge_lines`, `vmi_billing_periods`, `vmi_payments`) are NOT touched
-- here and remain open follow-up work.
--
-- Mirrors the sibling Trading Pricing pattern exactly
-- (0038_trading_pricing_rbac_capabilities.sql /
-- 0039_trading_pricing_rls_policies.sql), which closed the identical gap for
-- `trading_policies` (also an effective-dated rate-card version-history
-- table with no RLS at all after its own creation migration,
-- 0033_trading_pricing.sql):
--   1. Seed four new capability rows into the `permissions` catalog plus
--      their `role_permissions` grants (idempotent, ON CONFLICT DO NOTHING),
--      matching 0005's/0027's/0038's INSERT permissions -> INSERT
--      role_permissions two-step structure.
--   2. Enable + force RLS on both tables, one CREATE POLICY per
--      capability-gated operation via
--      rbac_internal.has_permission(resource, action, scope_kind) — never a
--      bare application-layer WHERE clause — plus a narrow GRANT to
--      `authenticated` matching exactly what the policies allow.
--
-- Capability identifiers seeded below (verbatim, matching the request):
--   vmi_contract_terms.read    -> supervisor, administrator (global)
--   vmi_contract_terms.manage  -> supervisor, administrator (global)
--   vmi_permits.read           -> supervisor, administrator (global)
--   vmi_permits.manage         -> supervisor, administrator (global)
--
-- Deliberately NOT granted to warehouse_staff, unlike trading_policies.read
-- (which IS granted to warehouse_staff because 08's Stage 1 pick-list
-- commitment needs to resolve the active Trading rate card mid-transaction
-- under the picker's own session). No equivalent floor-level action exists
-- for VMI contract terms or permits — both are office-only per design.md §4
-- and match `reporting.financial_read`'s existing Supervisor/Administrator
-- tier (specs/12-vmi-billing/design.md, "Capability gate:
-- reporting.financial_read for read access").
--
-- Both tables are party_id-scoped columns, but per the request this is an
-- OFFICE cross-party capability, not per-party RLS narrowing — a
-- supervisor/administrator holding vmi_contract_terms.read/manage sees and
-- edits every party's row, not just an assigned subset. This mirrors
-- trading_policies' policy shape in 0039 exactly: capability-gated USING/
-- WITH CHECK clauses with no party_id predicate at all.
--
-- vmi_contract_terms is an effective-dated version-history table (its own
-- header comment in vmi_billing.ts: "a rate edit never overwrites history:
-- it closes the current row (effective_to = boundary) and inserts a new
-- one"). Per that same file's B.1 task note, the "at most one open row per
-- party" invariant is intentionally application-layer only (no DB-level
-- unique constraint on party_id alone), so "manage" here grants INSERT
-- (the new version row) and UPDATE (closing the current row's effective_to)
-- under the same capability, exactly matching trading_policies' policy shape
-- in 0039 — RLS does not itself restrict UPDATE to only the effective_to
-- column; that narrower guarantee is an application-layer contract owned by
-- the E.4 edit action, same division of responsibility 0039 established for
-- trading_policies. No DELETE policy: superseded rows are closed, never
-- physically deleted, matching trading_policies' "no DELETE policy, on
-- purpose" comment.
--
-- vmi_permits has no version-history requirement (an `is_active` boolean,
-- not effective-dating) — plain CRUD, so `manage` covers INSERT, UPDATE, and
-- DELETE.
--
-- All statements are idempotent: `ON CONFLICT ... DO NOTHING` for the
-- permission/role_permission seed inserts (0005's/0027's/0038's pattern),
-- and `DROP POLICY IF EXISTS` before each `CREATE POLICY` (matching
-- 0034_inventory_unit_tracking_and_location_write_fix.sql's idempotent-repair
-- pattern) in case of a partial prior run.

-- ===========================================================================
-- 1. Seed the four new VMI Billing capabilities into the catalog.
-- ===========================================================================

INSERT INTO "permissions" ("resource", "action", "description")
VALUES
  ('vmi_contract_terms', 'read', 'View a VMI contract-terms (storage/handling/documentation rate card) row for a party, including its version history.'),
  ('vmi_contract_terms', 'manage', 'Create a new VMI contract-terms version for a party (closes the current open row and inserts a new one; never a plain in-place rate edit).'),
  ('vmi_permits', 'read', 'View a VMI import/export permit row for a party.'),
  ('vmi_permits', 'manage', 'Create, edit, or remove a VMI import/export permit row for a party.')
ON CONFLICT ("resource", "action") DO NOTHING;
--> statement-breakpoint

-- ===========================================================================
-- 2. Seed role_permissions grants for the four new capabilities, joined by
--    role key and (resource, action) rather than hard-coded UUIDs, matching
--    0005's/0027's/0038's pattern. Supervisor and Administrator only — no
--    warehouse_staff grant for either table (see header comment).
-- ===========================================================================

INSERT INTO "role_permissions" ("role_id", "permission_id", "scope_kind")
SELECT r."id", p."id", v.scope_kind::"scope_kind"
FROM (VALUES
  -- vmi_contract_terms.read — supervisor, administrator (office rate-card
  -- read, matches reporting.financial_read's existing tier).
  ('supervisor', 'vmi_contract_terms', 'read', 'global'),
  ('administrator', 'vmi_contract_terms', 'read', 'global'),

  -- vmi_contract_terms.manage — supervisor, administrator (create a new
  -- version: close current + insert new, never a plain UPDATE of rate
  -- values on an existing row).
  ('supervisor', 'vmi_contract_terms', 'manage', 'global'),
  ('administrator', 'vmi_contract_terms', 'manage', 'global'),

  -- vmi_permits.read — supervisor, administrator.
  ('supervisor', 'vmi_permits', 'read', 'global'),
  ('administrator', 'vmi_permits', 'read', 'global'),

  -- vmi_permits.manage — supervisor, administrator (plain CRUD).
  ('supervisor', 'vmi_permits', 'manage', 'global'),
  ('administrator', 'vmi_permits', 'manage', 'global')
) AS v(role_key, resource, action, scope_kind)
JOIN "roles" r ON r."key" = v.role_key
JOIN "permissions" p ON p."resource" = v.resource AND p."action" = v.action
ON CONFLICT ("role_id", "permission_id", "scope_kind") DO NOTHING;
--> statement-breakpoint

-- ===========================================================================
-- 3. `vmi_contract_terms` — the rate card version history. Append/close
--    only, never physically deleted (superseded rows get effective_to set,
--    is_active=false, per the table's own header comment) — no DELETE
--    policy, on purpose, matching trading_policies (0039).
-- ===========================================================================

ALTER TABLE public.vmi_contract_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vmi_contract_terms FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS vmi_contract_terms_select ON public.vmi_contract_terms;
CREATE POLICY vmi_contract_terms_select ON public.vmi_contract_terms
  FOR SELECT TO authenticated
  USING (
    rbac_internal.has_permission('vmi_contract_terms', 'read', 'global')
  );
--> statement-breakpoint

DROP POLICY IF EXISTS vmi_contract_terms_insert ON public.vmi_contract_terms;
CREATE POLICY vmi_contract_terms_insert ON public.vmi_contract_terms
  FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('vmi_contract_terms', 'manage', 'global')
  );
--> statement-breakpoint

DROP POLICY IF EXISTS vmi_contract_terms_update ON public.vmi_contract_terms;
CREATE POLICY vmi_contract_terms_update ON public.vmi_contract_terms
  FOR UPDATE TO authenticated
  USING (
    rbac_internal.has_permission('vmi_contract_terms', 'manage', 'global')
  )
  WITH CHECK (
    rbac_internal.has_permission('vmi_contract_terms', 'manage', 'global')
  );
--> statement-breakpoint

-- No DELETE policy: default-deny by omission, matching this table's
-- version-history design (superseded, never removed).

GRANT SELECT, INSERT, UPDATE ON public.vmi_contract_terms TO authenticated;
--> statement-breakpoint

-- ===========================================================================
-- 4. `vmi_permits` — plain CRUD (is_active boolean, not effective-dating).
-- ===========================================================================

ALTER TABLE public.vmi_permits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vmi_permits FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS vmi_permits_select ON public.vmi_permits;
CREATE POLICY vmi_permits_select ON public.vmi_permits
  FOR SELECT TO authenticated
  USING (
    rbac_internal.has_permission('vmi_permits', 'read', 'global')
  );
--> statement-breakpoint

DROP POLICY IF EXISTS vmi_permits_insert ON public.vmi_permits;
CREATE POLICY vmi_permits_insert ON public.vmi_permits
  FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('vmi_permits', 'manage', 'global')
  );
--> statement-breakpoint

DROP POLICY IF EXISTS vmi_permits_update ON public.vmi_permits;
CREATE POLICY vmi_permits_update ON public.vmi_permits
  FOR UPDATE TO authenticated
  USING (
    rbac_internal.has_permission('vmi_permits', 'manage', 'global')
  )
  WITH CHECK (
    rbac_internal.has_permission('vmi_permits', 'manage', 'global')
  );
--> statement-breakpoint

DROP POLICY IF EXISTS vmi_permits_delete ON public.vmi_permits;
CREATE POLICY vmi_permits_delete ON public.vmi_permits
  FOR DELETE TO authenticated
  USING (
    rbac_internal.has_permission('vmi_permits', 'manage', 'global')
  );
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vmi_permits TO authenticated;

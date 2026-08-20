-- specs/13-trading-orders-and-pricing/design.md §6 / tasks.md Task 3
-- ("Implement default-deny RLS") + rbac-rls-reviewer's review of
-- lib/actions/trading-pricing.ts's freezeTradingPrice (Task 4, already
-- implemented and unit-tested, but never runnable against real Postgres
-- until this migration closes two real gaps).
--
-- 0031_trading_pricing.sql created `trading_policies`/`trading_invoice_lines`
-- with NO RLS enable, NO policies, and NO grants at all — confirmed by
-- direct re-read before writing this file. This migration is the first RLS
-- pass for those two tables, plus two adjacent gaps `freezeTradingPrice`'s
-- own code exposed:
--   1. `audit_log` has a SELECT-admin policy only (0008_rls_policies.sql);
--      its own header comment there explicitly defers INSERT to "a trusted
--      server/service mechanism," never built. `freezeTradingPrice`'s
--      override path (design.md §5, R2.3) writes an audit_log row directly
--      under the caller's own RLS-bound session (lib/db/rls-transaction.ts's
--      withRlsTransaction — this repo's established per-request session
--      binding, not a service-role bypass) and would fail closed today.
--   2. `forex_rates`'s existing SELECT policy (0008) is supervisor/
--      administrator only, but `freezeTradingPrice` calls
--      `db.select().from(forexRates)` under a warehouse_staff caller's own
--      session (a warehouse_staff holder of trading_policies.read routinely
--      reaches this code path via 08's Stage 1 pick-list commitment, per
--      0036's own header comment) — that read would also fail closed today.
--
-- Policy/grant shape follows this repo's established pairing convention
-- throughout (0014_transfer_rls_policies.sql, 0023_core_and_pick_write_
-- policies.sql): every table gets ENABLE + FORCE ROW LEVEL SECURITY, one
-- CREATE POLICY per capability-gated operation via
-- rbac_internal.has_permission(resource, action, scope_kind) — never a bare
-- application-layer WHERE clause — and a narrow, explicit GRANT to
-- `authenticated` matching exactly the operations policies allow, no more.
--
-- Capability keys used below are exactly 0036_trading_pricing_rbac_
-- capabilities.sql's seeded catalog (re-read directly before writing this
-- file, not assumed):
--   trading_policies.read        -> warehouse_staff, supervisor, administrator (global)
--   trading_policies.manage      -> supervisor, administrator (global)
--   trading_prices.read_internal -> supervisor, administrator (global) (not used here — that's
--                                    Task 3's still-open "internal vs customer-facing projection"
--                                    item, a column-redaction concern for the read path/view layer,
--                                    not a table-level RLS predicate; not implemented in this pass)
--   trading_prices.override      -> supervisor, administrator (global)
-- plus the pre-existing `reporting.financial_read` (supervisor, administrator,
-- global — 0005_rbac_constraints_and_seed.sql) for the Trading Pricing &
-- Margin Ledger UI tab design.md §7a names as trading_invoice_lines' reader.

-- ===========================================================================
-- 1. `trading_policies` — the rate card. Append/edit only, never physically
--    deleted (superseded rows get effective_to set + is_active=false, per
--    design.md §2's own comment) — no DELETE policy, on purpose.
-- ===========================================================================

ALTER TABLE public.trading_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_policies FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY trading_policies_select ON public.trading_policies
  FOR SELECT TO authenticated
  USING (
    rbac_internal.has_permission('trading_policies', 'read', 'global')
  );
--> statement-breakpoint

CREATE POLICY trading_policies_insert ON public.trading_policies
  FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('trading_policies', 'manage', 'global')
  );
--> statement-breakpoint

CREATE POLICY trading_policies_update ON public.trading_policies
  FOR UPDATE TO authenticated
  USING (
    rbac_internal.has_permission('trading_policies', 'manage', 'global')
  )
  WITH CHECK (
    rbac_internal.has_permission('trading_policies', 'manage', 'global')
  );
--> statement-breakpoint

-- No DELETE policy: default-deny by omission, matching this table's
-- version-history design (superseded, never removed).

GRANT SELECT, INSERT, UPDATE ON public.trading_policies TO authenticated;
--> statement-breakpoint

-- ===========================================================================
-- 2. `trading_invoice_lines` — the frozen transaction record. Immutable by
--    design (no updated_at column at all, design.md §3): no UPDATE/DELETE
--    policy and no UPDATE/DELETE grant, matching the established
--    "no-UPDATE/DELETE immutable row" pattern already used for
--    wrr_item_unit_scans (0025) in this codebase.
--
--    INSERT is gated on trading_policies.read — matching freezeTradingPrice's
--    OWN base authorization check (lib/actions/trading-pricing.ts, Step 1,
--    checked before ANY DB access) exactly: that is the one and only
--    capability that lets a caller enter the freeze flow at all, so it is
--    also the correct gate for the row it writes. (The override path adds
--    trading_prices.override as a SECOND, additional application-layer gate
--    before the same insert — see the audit_log policy in section 3 below —
--    but the base trading_policies.read gate is still required for every
--    insert, override or not, matching the code's actual control flow.)
--
--    SELECT is gated on reporting.financial_read, matching design.md §7a's
--    stated gating for the Trading Pricing & Margin Ledger UI tab
--    (tasks.md Task 6, 2026-08-19 bullet) that reads this table back.
-- ===========================================================================

ALTER TABLE public.trading_invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_invoice_lines FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY trading_invoice_lines_insert ON public.trading_invoice_lines
  FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('trading_policies', 'read', 'global')
  );
--> statement-breakpoint

CREATE POLICY trading_invoice_lines_select ON public.trading_invoice_lines
  FOR SELECT TO authenticated
  USING (
    rbac_internal.has_permission('reporting', 'financial_read', 'global')
  );
--> statement-breakpoint

-- No UPDATE/DELETE policy at all — immutable by design, no code path in this
-- repo ever edits or deletes a trading_invoice_lines row.

GRANT SELECT, INSERT ON public.trading_invoice_lines TO authenticated;
--> statement-breakpoint

-- ===========================================================================
-- 3. `audit_log` INSERT gap — narrowly scoped to the one real caller that
--    exists today: freezeTradingPrice's override path
--    (lib/actions/trading-pricing.ts, Step 8), which requires
--    trading_prices.override to even reach the override branch (Step 3,
--    checked before any DB access). This mirrors that application-layer gate
--    exactly, and deliberately does NOT build a general-purpose audit-log
--    writer for all authenticated users or all capabilities — that remains
--    out of scope (0008_rls_policies.sql's header note: INSERT was
--    deliberately deferred to "a trusted server/service mechanism," which
--    this migration does not attempt to build wholesale here).
--
--    The existing SELECT policy/grant for admins (audit_log_select_admin,
--    0008) is untouched.
-- ===========================================================================

CREATE POLICY audit_log_insert_trading_price_override ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('trading_prices', 'override', 'global')
  );
--> statement-breakpoint

GRANT INSERT ON public.audit_log TO authenticated;
--> statement-breakpoint

-- ===========================================================================
-- 4. `forex_rates` mismatch — freezeTradingPrice needs a warehouse_staff
--    caller (who holds trading_policies.read, per 0036's own header note on
--    08's Stage 1 pick-list commitment reaching this code path) to read this
--    table for cross-currency price resolution (Step 5). The existing
--    `forex_rates_select` policy (0008) only allows supervisor/administrator
--    via forex_rates.read.
--
--    Widened via ALTER POLICY, not DROP+CREATE — same policy object/name,
--    original supervisor/administrator branch left completely intact, one
--    additional OR-branch added. This is this repo's established multi-branch
--    SELECT policy shape (e.g. lot_location_balances_select, 0008), applied
--    here as a widening edit rather than a replacement.
--
--    No new GRANT: `GRANT SELECT ON public.forex_rates TO authenticated`
--    already exists (0008, confirmed by direct re-read before writing this
--    file) and covers both branches of the widened policy — a SELECT grant
--    is not itself branch-scoped.
-- ===========================================================================

ALTER POLICY forex_rates_select ON public.forex_rates
  USING (
    rbac_internal.has_permission('forex_rates', 'read', 'global')
    OR rbac_internal.has_permission('trading_policies', 'read', 'global')
  );

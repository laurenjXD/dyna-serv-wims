-- specs/13-trading-orders-and-pricing/design.md §6 / tasks.md Task 3
--
-- Adds the four canonical Trading Pricing capability identifiers to the RBAC
-- catalog, per design.md §6's "Capability vocabulary (final identifiers
-- owned by `02`)" line and requirements.md's informal-prose aliases
-- (`trading.price_set` / `trading.margin_view` / `trading.price_override`):
--
--   - trading_policies.read        (informal alias: the read counterpart of
--                                    `trading.price_set` — "read a rate card")
--   - trading_policies.manage      (= `trading.price_set` — create/edit a
--                                    trading_policies row)
--   - trading_prices.read_internal (= `trading.margin_view` — view
--                                    buy_cost/margin/margin% internal-only
--                                    columns)
--   - trading_prices.override      (= `trading.price_override` — override a
--                                    resolved price with mandatory reason)
--
-- New capabilities added in a later migration rather than editing the
-- already-applied 0005_rbac_constraints_and_seed.sql in place, matching the
-- established precedent in 0027_administrator_operational_capabilities.sql.
-- Unlike 0027 (which only needed new role_permissions rows for
-- already-seeded permissions), this migration also seeds four brand-new
-- `permissions` rows, since `trading_policies`/`trading_prices` are new
-- resources not present in 0005's catalog — matching 0005's own
-- INSERT permissions -> INSERT role_permissions two-step structure.
--
-- Role grants (design.md §6, requirements.md, tasks.md Task 3):
--   - trading_policies.read: warehouse_staff, supervisor, administrator —
--     broader than the other three because `08`'s Stage 1 pick-list
--     commitment (a warehouse_staff action) needs to resolve the active
--     rate card as part of that same transaction; a floor picker doesn't
--     manage rate cards, but the system needs read access under their own
--     session to freeze a price during their commit.
--   - trading_policies.manage: supervisor, administrator only — rate-card
--     CRUD is an office/admin action.
--   - trading_prices.read_internal: supervisor, administrator only — per
--     requirements.md's explicit "Administrator & Supervisor" language for
--     margin visibility.
--   - trading_prices.override: supervisor, administrator only — an elevated
--     pricing action, same tier as trading_policies.manage.
--
-- All statements are idempotent (`ON CONFLICT ... DO NOTHING`), matching
-- 0005's and 0027's pattern, so this migration is safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Seed the four new Trading Pricing capabilities into the catalog.
-- ---------------------------------------------------------------------------

INSERT INTO "permissions" ("resource", "action", "description")
VALUES
  ('trading_policies', 'read', 'View a Trading rate-card (trading_policies) row for a (party, item) pair.'),
  ('trading_policies', 'manage', 'Create or edit a Trading rate-card (trading_policies) row for a (party, item) pair.'),
  ('trading_prices', 'read_internal', 'View internal-only Trading pricing columns (buy_cost, margin_amount, margin %) not shown in the customer-facing projection.'),
  ('trading_prices', 'override', 'Override a resolved Trading sell price at freeze time with a mandatory written reason.')
ON CONFLICT ("resource", "action") DO NOTHING;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2. Seed role_permissions grants for the four new capabilities, joined by
--    role key and (resource, action) rather than hard-coded UUIDs, matching
--    0005's and 0027's pattern.
-- ---------------------------------------------------------------------------

INSERT INTO "role_permissions" ("role_id", "permission_id", "scope_kind")
SELECT r."id", p."id", v.scope_kind::"scope_kind"
FROM (VALUES
  -- trading_policies.read — warehouse_staff, supervisor, administrator.
  -- Broader than the other three: 08's Stage 1 pick-list commitment (a
  -- warehouse_staff action) must resolve the active rate card under the
  -- picker's own session as part of that same transaction.
  ('warehouse_staff', 'trading_policies', 'read', 'global'),
  ('supervisor', 'trading_policies', 'read', 'global'),
  ('administrator', 'trading_policies', 'read', 'global'),

  -- trading_policies.manage — supervisor, administrator only (office/admin
  -- rate-card CRUD).
  ('supervisor', 'trading_policies', 'manage', 'global'),
  ('administrator', 'trading_policies', 'manage', 'global'),

  -- trading_prices.read_internal — supervisor, administrator only, per
  -- requirements.md's explicit "Administrator & Supervisor" margin
  -- visibility language.
  ('supervisor', 'trading_prices', 'read_internal', 'global'),
  ('administrator', 'trading_prices', 'read_internal', 'global'),

  -- trading_prices.override — supervisor, administrator only, same tier as
  -- trading_policies.manage.
  ('supervisor', 'trading_prices', 'override', 'global'),
  ('administrator', 'trading_prices', 'override', 'global')
) AS v(role_key, resource, action, scope_kind)
JOIN "roles" r ON r."key" = v.role_key
JOIN "permissions" p ON p."resource" = v.resource AND p."action" = v.action
ON CONFLICT ("role_id", "permission_id", "scope_kind") DO NOTHING;

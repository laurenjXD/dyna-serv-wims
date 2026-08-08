-- specs/02-rbac-roles/design.md §7 (7.1 default-deny baseline, 7.2 shared
-- policy helpers, 7.3 RBAC-table policies, 7.4 core-resource policy
-- patterns).
--
-- Hand-written migration (same pattern as 0005_rbac_constraints_and_seed.sql)
-- because RLS policies, SECURITY DEFINER functions, dedicated roles/schemas,
-- and a non-security_invoker view are all outside drizzle-kit's schema
-- builder.
--
-- Scope, per the cycle-2.4 work order:
--   - §7.2's five helper functions, in a dedicated `rbac_internal` schema,
--     owned by a new `rbac_definer` role (BYPASSRLS, table-scoped SELECT
--     only on the RBAC tables the helpers read).
--   - Every grant §7.2 enumerates as required (auth/rbac_internal/public
--     schema USAGE, auth.uid() EXECUTE, party_roles SELECT). NOTE (fixed
--     2026-08-08, both db-migration-verifier and rbac-rls-reviewer): this
--     migration deliberately does NOT grant `party_has_any_role` EXECUTE to
--     `authenticated` -- see the REVOKE/no-GRANT note at its declaration
--     below.
--   - One extra grant, `GRANT USAGE ON SCHEMA rbac_internal TO
--     authenticated`, added defensively beyond §7.2's enumerated list on
--     the hypothesis that it would be required for the RLS-embedded
--     function-call path. Real-Postgres testing during this migration's
--     own self-verification pass DISPROVED that hypothesis: revoking this
--     grant and re-running an authenticated-session query against a table
--     whose RLS policy calls an rbac_internal-qualified function still
--     succeeded. This matches documented Postgres behavior -- a policy
--     body's function-name resolution happens once, at CREATE POLICY time,
--     under the policy-creating role; a later query by a different role
--     only re-checks EXECUTE privilege on the already-resolved function
--     OID, not schema USAGE. The grant is left in place anyway (harmless,
--     and needed if any trusted server code ever calls these functions
--     directly by qualified name rather than only through an embedded
--     policy), but is NOT load-bearing for the RLS path itself -- noted
--     here so db-migration-verifier doesn't need to re-discover this.
--   - REVOKE EXECUTE ... FROM PUBLIC on all five helpers, in this same
--     migration.
--   - §7.3's RBAC-table policies.
--   - §7.4's core-resource policies for every table that exists in our
--     schema today (wrr_advance_notices, vmi_billing_statement,
--     vmi_credit_notes, and §8's admin mutation functions are explicitly
--     out of scope -- see the work order).
--
-- Every `assigned_party` policy calls `rbac_internal.can_access_party_resource`,
-- never `has_party_scope` directly (design.md §7.4's hard rule).
--
-- ---------------------------------------------------------------------------
-- FLAGGED FINDING (not silently "fixed" -- surfaced for db-migration-verifier
-- / rbac-rls-reviewer to resolve authoritatively):
--
-- §7.4's literal prose names `can_access_party_resource` resource strings
-- 'wrr_documents' and 'lots' and 'lot_location_balances' for the
-- party-scoped read patterns on those three tables. None of those three
-- strings exist as a seeded `permissions.resource` value in
-- 0005_rbac_constraints_and_seed.sql's capability catalog (§3.2's seeded
-- rows are `receiving`, `inspection`, `inventory`, `locations`, `pick_list`,
-- `fifo_override`, `dispatch`, `transfers`, `documents`, `vmi_statements`,
-- `reporting`, `parties`, `items`, `forex_rates`, `notifications`,
-- `shipment_labels`, `audit_log` -- no `wrr_documents`, `lots`, or
-- `lot_location_balances`). Calling `has_permission`/
-- `can_access_party_resource` with a resource string that has no matching
-- seeded permission row ALWAYS returns false, which would silently deny
-- 100% of party reads on these three tables regardless of party scope --
-- this is the exact same failure class already caught once for
-- `pick_list`/`pick_lists` (§7.2's pass-2 finding) and explicitly called out
-- there as "Using the table name instead of the capability key would
-- silently deny all party reads."
--
-- Unlike the `pick_list`/`pick_lists` case, there is no existing capability
-- catalog entry to fall back to here -- `documents`/`inventory` cover
-- different (broader/staff-facing) ground and substituting either would be
-- a judgment call, not a literal reading. The lowest-risk, most literal
-- resolution -- consistent with 0005's own header note that it is "a
-- hand-written follow-up ... supplementing generated DDL with a hand-written
-- migration for anything [that DDL layer] cannot express", i.e. completing
-- an already-approved catalog rather than redesigning it -- is to ADD the
-- three missing permission rows to the catalog, granted to `party_user` at
-- `assigned_party` scope only (internal-staff global access to these three
-- tables continues to use the EXISTING `receiving.view`/`inventory.read`
-- capabilities exactly as §7.4's own prose already describes for the staff
-- branch of each policy -- no global row is added for these three, to avoid
-- duplicating a grant the design never asked for).
--
-- This migration adds exactly these three missing catalog rows below, in a
-- clearly separated "capability catalog completion" section.
--
-- FIXED 2026-08-08 (db-migration-verifier and rbac-rls-reviewer, independently
-- converged on the same finding): a previous version of this migration also
-- literally implemented `can_access_party_resource('parties', 'read', id,
-- null)` for the `parties` table's party-user branch, per §7.4's original
-- text, and added a `('party_user', 'parties', 'read', 'assigned_party')`
-- role_permissions row to support it. Both reviewers proved this was a real
-- logic bug, not a faithful implementation: `has_party_scope`'s null-
-- flow_type matching only matches an assignment row whose OWN flow_type is
-- ALSO null (an all-flow grant) -- passing a literal `null` as the
-- REQUESTED flow_type does not mean "match any flow." A party user legitimately
-- scoped to one specific flow only (e.g. flow_type = 'vmi', a normal
-- administrative choice, not an edge case) was incorrectly denied all
-- visibility into their own counterparty's `parties` row. `design.md` §7.4
-- was corrected to specify a flow-agnostic direct assignment-existence check
-- instead -- see `rbac_internal.has_any_party_scope` below and the
-- `parties_select_party` / `party_roles_select` policies, which no longer
-- call `can_access_party_resource` at all for this table. The now-unused
-- `('party_user', 'parties', 'read', 'assigned_party')` catalog row has been
-- removed accordingly -- §3.2's capability catalog never listed an
-- `assigned_party` row for `parties` in the first place (only `global`), so
-- removing it also brings the migration back in line with the catalog as
-- written, not just with the corrected policy.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. Dedicated roles and schema.
-- ===========================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rbac_definer') THEN
    CREATE ROLE rbac_definer NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END $$;
--> statement-breakpoint

CREATE SCHEMA IF NOT EXISTS rbac_internal;
--> statement-breakpoint

-- ===========================================================================
-- 2. Grants §7.2 explicitly enumerates as required (real-Postgres
--    verification, 2026-08-05/06), plus schema USAGE on rbac_internal for
--    `authenticated` (this pass's own finding, see header note above).
-- ===========================================================================

GRANT USAGE ON SCHEMA auth TO rbac_definer;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION auth.uid() TO rbac_definer;
--> statement-breakpoint
GRANT USAGE ON SCHEMA rbac_internal TO rbac_definer;
--> statement-breakpoint
GRANT USAGE ON SCHEMA rbac_internal TO authenticated;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO authenticated;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO rbac_definer;
--> statement-breakpoint

-- rbac_definer's table-scoped SELECT-only access to the specific RBAC tables
-- the five helpers read -- no broader grant.
GRANT SELECT ON public.user_profiles TO rbac_definer;
--> statement-breakpoint
GRANT SELECT ON public.roles TO rbac_definer;
--> statement-breakpoint
GRANT SELECT ON public.permissions TO rbac_definer;
--> statement-breakpoint
GRANT SELECT ON public.role_permissions TO rbac_definer;
--> statement-breakpoint
GRANT SELECT ON public.user_roles TO rbac_definer;
--> statement-breakpoint
GRANT SELECT ON public.user_party_scopes TO rbac_definer;
--> statement-breakpoint
GRANT SELECT ON public.party_roles TO rbac_definer;
--> statement-breakpoint

-- ===========================================================================
-- 3. §7.2's five helper functions, in dependency order (can_access_party_
--    resource calls the other three; party_has_any_role is independent).
--    LANGUAGE sql, STABLE, SECURITY DEFINER, fixed empty search_path with
--    every referenced object fully schema-qualified (no search_path
--    injection surface).
-- ===========================================================================

CREATE FUNCTION rbac_internal.current_user_is_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles up
    WHERE up.id = auth.uid()
      AND up.status = 'active'
  );
$$;
--> statement-breakpoint

-- FIXED during this migration's own self-verification pass (real-Postgres,
-- not a design-level bug): §3.3's effective-authorization contract requires
-- BOTH "the user profile is active" AND "an active role grant" before a
-- request is permitted, and §5D/§8.4 require live deactivation to take
-- effect on the very next protected request. A first version of this
-- function checked only role/assignment validity, not profile status --
-- proven wrong by a real test fixture (an `inactive` warehouse_staff
-- profile with an otherwise-valid, non-revoked role assignment) still
-- passing `has_permission` and retaining full RLS-backed read access to
-- every `lots` row. `has_permission` now independently requires
-- `current_user_is_active()` itself, not just relying on callers (like
-- `can_access_party_resource`) to have already checked it -- RLS policies
-- call `has_permission` directly for global-scope checks and never call
-- `current_user_is_active()` separately, so if `has_permission` itself
-- didn't enforce this, every global-scope policy in this migration would
-- have silently kept working for deactivated accounts.
CREATE FUNCTION rbac_internal.has_permission(
  p_resource text,
  p_action text,
  p_scope_kind public.scope_kind
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT rbac_internal.current_user_is_active() AND EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id AND r.is_active
    JOIN public.role_permissions rp
      ON rp.role_id = ur.role_id AND rp.scope_kind = p_scope_kind
    JOIN public.permissions p ON p.id = rp.permission_id AND p.is_active
    WHERE ur.user_id = auth.uid()
      AND ur.revoked_at IS NULL
      AND ur.valid_from <= now()
      AND (ur.valid_until IS NULL OR ur.valid_until > now())
      AND p.resource = p_resource
      AND p.action = p_action
  );
$$;
--> statement-breakpoint

-- A null-flow_type assignment matches any requested flow_type EXCEPT
-- 'supplies' -- not a bare wildcard (design.md §3.2/§7.2).
CREATE FUNCTION rbac_internal.has_party_scope(
  p_party_id uuid,
  p_flow_type text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_party_scopes ups
    WHERE ups.user_id = auth.uid()
      AND ups.party_id = p_party_id
      AND ups.revoked_at IS NULL
      AND ups.valid_from <= now()
      AND (ups.valid_until IS NULL OR ups.valid_until > now())
      AND (
        ups.flow_type::text = p_flow_type
        OR (ups.flow_type IS NULL AND p_flow_type IS DISTINCT FROM 'supplies')
      )
  );
$$;
--> statement-breakpoint

-- Flow-agnostic party-scope existence check -- used ONLY by the `parties`
-- table's party-user SELECT branch (and `party_roles`, which inherits from
-- `parties`). Design.md §7.4's corrected (2026-08-08) `parties` bullet:
-- `parties` rows are not themselves flow-partitioned data, so this
-- deliberately does NOT route through `can_access_party_resource`'s (or
-- `has_party_scope`'s) flow-matching semantics at all -- it is a direct
-- existence check for ANY active, non-revoked `user_party_scopes` row for
-- this party belonging to the caller, regardless of that row's own
-- `flow_type` value (null or a specific flow). Routed through the same
-- SECURITY DEFINER/rbac_definer mechanism as every other helper here to
-- avoid the self-referential-RLS-recursion problem a bare inline `EXISTS`
-- against `user_party_scopes` would hit (that table carries its own
-- restrictive SELECT RLS, evaluated for the calling role at query time).
CREATE FUNCTION rbac_internal.has_any_party_scope(
  p_party_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT rbac_internal.current_user_is_active() AND EXISTS (
    SELECT 1
    FROM public.user_party_scopes ups
    WHERE ups.user_id = auth.uid()
      AND ups.party_id = p_party_id
      AND ups.revoked_at IS NULL
      AND ups.valid_from <= now()
      AND (ups.valid_until IS NULL OR ups.valid_until > now())
  );
$$;
--> statement-breakpoint

-- Combines capability + party scope, and independently, redundantly
-- hard-denies flow_type = 'supplies' regardless of has_party_scope's result
-- -- the second, non-derivative gate design.md §3.2 requires so no single
-- implementation slip exposes Supplies data.
CREATE FUNCTION rbac_internal.can_access_party_resource(
  p_resource text,
  p_action text,
  p_party_id uuid,
  p_flow_type text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    rbac_internal.current_user_is_active()
    AND rbac_internal.has_permission(p_resource, p_action, 'assigned_party'::public.scope_kind)
    AND rbac_internal.has_party_scope(p_party_id, p_flow_type)
    AND p_flow_type IS DISTINCT FROM 'supplies';
$$;
--> statement-breakpoint

CREATE FUNCTION rbac_internal.party_has_any_role(
  p_party_id uuid,
  p_roles text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.party_roles pr
    WHERE pr.party_id = p_party_id
      AND pr.role::text = ANY (p_roles)
  );
$$;
--> statement-breakpoint

-- Ownership: single dedicated privileged owner, not postgres / the
-- migration owner (design.md §7.2's "least-privilege ownership").
ALTER FUNCTION rbac_internal.current_user_is_active() OWNER TO rbac_definer;
--> statement-breakpoint
ALTER FUNCTION rbac_internal.has_permission(text, text, public.scope_kind) OWNER TO rbac_definer;
--> statement-breakpoint
ALTER FUNCTION rbac_internal.has_party_scope(uuid, text) OWNER TO rbac_definer;
--> statement-breakpoint
ALTER FUNCTION rbac_internal.has_any_party_scope(uuid) OWNER TO rbac_definer;
--> statement-breakpoint
ALTER FUNCTION rbac_internal.can_access_party_resource(text, text, uuid, text) OWNER TO rbac_definer;
--> statement-breakpoint
ALTER FUNCTION rbac_internal.party_has_any_role(uuid, text[]) OWNER TO rbac_definer;
--> statement-breakpoint

-- REVOKE EXECUTE FROM PUBLIC in the SAME migration that creates the
-- functions (pass-2 finding, and its finding-E recurrence for the fifth
-- helper -- do not repeat either bug here).
REVOKE EXECUTE ON FUNCTION rbac_internal.current_user_is_active() FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION rbac_internal.has_permission(text, text, public.scope_kind) FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION rbac_internal.has_party_scope(uuid, text) FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION rbac_internal.has_any_party_scope(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION rbac_internal.can_access_party_resource(text, text, uuid, text) FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION rbac_internal.party_has_any_role(uuid, text[]) FROM PUBLIC;
--> statement-breakpoint

-- `authenticated` needs EXECUTE for RLS policy evaluation (schema placement
-- in rbac_internal, never exposed via Supabase's PostgREST "Exposed
-- schemas" config, is what actually closes off client RPC access -- see
-- design.md §7.2's "PostgREST/RPC exposure" subsection -- withholding
-- EXECUTE is not the exposure-closing mechanism and is not done here).
GRANT EXECUTE ON FUNCTION rbac_internal.current_user_is_active() TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rbac_internal.has_permission(text, text, public.scope_kind) TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rbac_internal.has_party_scope(uuid, text) TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rbac_internal.has_any_party_scope(uuid) TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rbac_internal.can_access_party_resource(text, text, uuid, text) TO authenticated;
--> statement-breakpoint

-- FIXED 2026-08-08 (db-migration-verifier live-proved a cross-party
-- enumeration vulnerability; rbac-rls-reviewer independently flagged the
-- same grant): `party_has_any_role`'s ONLY spec'd caller is
-- `wrr_advance_notices`'s WITH CHECK policy (design.md §7.4, item 2), and
-- that table is explicitly out of scope for this migration (it does not
-- exist in our schema yet, per 01-core-data-model's own scaffolding notes).
-- There is currently NO legitimate caller for this function within an
-- ordinary `authenticated` session's reach -- every use of it in this
-- migration is internal, from other SECURITY DEFINER policy predicates that
-- already run under rbac_definer's own EXECUTE grant (see the function
-- grants above), not from a policy body evaluated as `authenticated`
-- itself. Granting EXECUTE to `authenticated` here let any signed-in user
-- call `rbac_internal.party_has_any_role(<any_party_id>, ARRAY['vendor',
-- 'supplier'])` directly and get a correct true/false classification for
-- ANY party in the system -- a real information-disclosure channel that
-- bypasses `parties`/`party_roles`' own RLS entirely, proven live by
-- db-migration-verifier. The function definition is KEPT (it is part of
-- §7.2's stable helper catalog and will be needed once `wrr_advance_notices`
-- is eventually built), and its REVOKE FROM PUBLIC above still stands, but
-- there is deliberately NO `GRANT EXECUTE ... TO authenticated` for it in
-- this migration. Do NOT "helpfully" add that grant back without also
-- building the `wrr_advance_notices` table and the WITH CHECK policy that
-- actually needs it -- add the grant in that future migration, scoped
-- together with its real caller, not preemptively here.

-- ===========================================================================
-- 4. Capability catalog completion -- see the header note above and
--    design.md §3.2's "Catalog addition (2026-08-08)" entry. Adds the three
--    missing permission rows and their party_user/assigned_party
--    role_permissions mappings for `wrr_documents.read`, `lots.read`, and
--    `lot_location_balances.read` -- these three, and only these three,
--    exactly matching §3.2's addition. (No `parties`/`read`/`assigned_party`
--    row: §3.2 never lists an `assigned_party` scope for `parties` -- only
--    `global` -- and the corrected `parties_select_party` /
--    `party_roles_select` policies below no longer call `has_permission`/
--    `can_access_party_resource` for the party-user branch at all, so no
--    catalog row is needed there. See the fixed-2026-08-08 header note.)
--    Idempotent, same ON CONFLICT discipline as 0005.
-- ===========================================================================

INSERT INTO "permissions" ("resource", "action", "description")
VALUES
  ('wrr_documents', 'read', 'View a WRR document (party-scoped read path referenced by design.md §7.4, added here because 0005 did not seed it).'),
  ('lots', 'read', 'View a lot (VMI party-scoped read path referenced by design.md §7.4, added here because 0005 did not seed it).'),
  ('lot_location_balances', 'read', 'View a lot/location balance (VMI party-scoped read path referenced by design.md §7.4, added here because 0005 did not seed it).')
ON CONFLICT ("resource", "action") DO NOTHING;
--> statement-breakpoint

INSERT INTO "role_permissions" ("role_id", "permission_id", "scope_kind")
SELECT r."id", p."id", v.scope_kind::"scope_kind"
FROM (VALUES
  ('party_user', 'wrr_documents', 'read', 'assigned_party'),
  ('party_user', 'lots', 'read', 'assigned_party'),
  ('party_user', 'lot_location_balances', 'read', 'assigned_party')
) AS v(role_key, resource, action, scope_kind)
JOIN "roles" r ON r."key" = v.role_key
JOIN "permissions" p ON p."resource" = v.resource AND p."action" = v.action
ON CONFLICT ("role_id", "permission_id", "scope_kind") DO NOTHING;
--> statement-breakpoint

-- ===========================================================================
-- 5. §7.3 RBAC-table policies.
--
-- For every table below whose §7.3 "Mutation path" column reads "Controlled
-- .../function/service" or "Migration-managed in v1": no INSERT/UPDATE/
-- DELETE policy is added for `authenticated`, on purpose -- default-deny by
-- omission IS the literal implementation of that row, not an omission of
-- one. Those controlled functions are §8's admin-mutation-function scope
-- (cycle 2.5), explicitly out of scope here.
-- ===========================================================================

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY user_profiles_select_self ON public.user_profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());
--> statement-breakpoint
CREATE POLICY user_profiles_select_admin ON public.user_profiles
  FOR SELECT TO authenticated
  USING (rbac_internal.has_permission('users', 'read', 'global'));
--> statement-breakpoint

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY roles_select_self ON public.roles
  FOR SELECT TO authenticated
  USING (
    is_active
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.role_id = roles.id
        AND ur.user_id = auth.uid()
        AND ur.revoked_at IS NULL
        AND ur.valid_from <= now()
        AND (ur.valid_until IS NULL OR ur.valid_until > now())
    )
  );
--> statement-breakpoint
CREATE POLICY roles_select_admin ON public.roles
  FOR SELECT TO authenticated
  USING (rbac_internal.has_permission('access_assignments', 'read', 'global'));
--> statement-breakpoint

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY permissions_select_self ON public.permissions
  FOR SELECT TO authenticated
  USING (
    is_active
    AND EXISTS (
      SELECT 1
      FROM public.role_permissions rp
      JOIN public.user_roles ur ON ur.role_id = rp.role_id
      WHERE rp.permission_id = permissions.id
        AND ur.user_id = auth.uid()
        AND ur.revoked_at IS NULL
        AND ur.valid_from <= now()
        AND (ur.valid_until IS NULL OR ur.valid_until > now())
    )
  );
--> statement-breakpoint
CREATE POLICY permissions_select_admin ON public.permissions
  FOR SELECT TO authenticated
  USING (rbac_internal.has_permission('access_assignments', 'read', 'global'));
--> statement-breakpoint

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY role_permissions_select_admin ON public.role_permissions
  FOR SELECT TO authenticated
  USING (rbac_internal.has_permission('access_assignments', 'read', 'global'));
--> statement-breakpoint

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY user_roles_select_self ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
--> statement-breakpoint
CREATE POLICY user_roles_select_admin ON public.user_roles
  FOR SELECT TO authenticated
  USING (rbac_internal.has_permission('access_assignments', 'read', 'global'));
--> statement-breakpoint

ALTER TABLE public.user_party_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_party_scopes FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY user_party_scopes_select_self ON public.user_party_scopes
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
--> statement-breakpoint
CREATE POLICY user_party_scopes_select_admin ON public.user_party_scopes
  FOR SELECT TO authenticated
  USING (rbac_internal.has_permission('party_scopes', 'read', 'global'));
--> statement-breakpoint

ALTER TABLE public.rbac_security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rbac_security_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY rbac_security_events_select_admin ON public.rbac_security_events
  FOR SELECT TO authenticated
  USING (rbac_internal.has_permission('security_events', 'read', 'global'));
--> statement-breakpoint
-- No self policy ("No default access" per §7.3). No INSERT/UPDATE/DELETE
-- policy for authenticated: §4.7's "Controlled insert only" / "no update or
-- delete" writer path is a trusted server/service mechanism outside the
-- ordinary authenticated RLS grant surface, mirroring audit_log's own
-- "trusted mutation path" treatment immediately below -- introducing that
-- writer mechanism is not this migration's scope.

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY audit_log_select_admin ON public.audit_log
  FOR SELECT TO authenticated
  USING (rbac_internal.has_permission('audit_log', 'read', 'global'));
--> statement-breakpoint
-- No party_user grant. No client-facing INSERT/UPDATE/DELETE policy
-- (design.md §7.4's explicit instruction for this table).

-- ===========================================================================
-- 6. §7.4 core-resource policies. SELECT-only, per design.md §2.2: "The
--    final RLS policy for each table is delivered with the feature that
--    finalizes that table's business relationship. RBAC supplies shared
--    policy helpers and the default-deny contract." INSERT/UPDATE/DELETE
--    policies for these operational tables belong to their owning feature
--    migrations (07/08/11/etc.), not this cycle -- omitting them here is the
--    correct default-deny baseline, not a gap.
-- ===========================================================================

-- wrr_documents: party/flow-scoped via vendor_party_id and flow_type.
-- NOTE: uses resource string 'wrr_documents' per §7.4's literal text -- see
-- the FLAGGED FINDING header note; the corresponding permission row is
-- seeded in section 4 above specifically to make this call succeed.
ALTER TABLE public.wrr_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wrr_documents FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY wrr_documents_select_staff ON public.wrr_documents
  FOR SELECT TO authenticated
  USING (rbac_internal.has_permission('receiving', 'view', 'global'));
--> statement-breakpoint
CREATE POLICY wrr_documents_select_party ON public.wrr_documents
  FOR SELECT TO authenticated
  USING (
    rbac_internal.can_access_party_resource('wrr_documents', 'read', vendor_party_id, flow_type::text)
  );
--> statement-breakpoint

-- wrr_items: inherits scope from parent wrr_documents.
ALTER TABLE public.wrr_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wrr_items FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY wrr_items_select ON public.wrr_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.wrr_documents wd
      WHERE wd.id = wrr_items.wrr_id
        AND (
          rbac_internal.has_permission('receiving', 'view', 'global')
          OR rbac_internal.can_access_party_resource('wrr_documents', 'read', wd.vendor_party_id, wd.flow_type::text)
        )
    )
  );
--> statement-breakpoint

-- wrr_inspection_logs: inherits WRR/vendor scope from parent wrr_documents.
ALTER TABLE public.wrr_inspection_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wrr_inspection_logs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY wrr_inspection_logs_select ON public.wrr_inspection_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.wrr_documents wd
      WHERE wd.id = wrr_inspection_logs.wrr_id
        AND (
          rbac_internal.has_permission('receiving', 'view', 'global')
          OR rbac_internal.can_access_party_resource('wrr_documents', 'read', wd.vendor_party_id, wd.flow_type::text)
        )
    )
  );
--> statement-breakpoint

-- lots: two-branch VMI/Trading logic. Trading gets NO direct grant --
-- there is deliberately no OR-branch checking flow_type = 'trading' here.
-- Supplies gets no branch either; can_access_party_resource's own
-- independent flow_type = 'supplies' hard-deny is a second, redundant gate
-- even though the VMI-only branch structure already excludes it.
ALTER TABLE public.lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lots FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY lots_select ON public.lots
  FOR SELECT TO authenticated
  USING (
    rbac_internal.has_permission('inventory', 'read', 'global')
    OR (
      flow_type = 'vmi'
      AND rbac_internal.can_access_party_resource('lots', 'read', owner_party_id, 'vmi')
    )
  );
--> statement-breakpoint

-- pick_lists: resource key is 'pick_list' (singular) matching the §3.2
-- capability catalog -- the pass-2-verified fix, not the table name.
ALTER TABLE public.pick_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pick_lists FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY pick_lists_select_staff ON public.pick_lists
  FOR SELECT TO authenticated
  USING (rbac_internal.has_permission('pick_list', 'read', 'global'));
--> statement-breakpoint
CREATE POLICY pick_lists_select_party ON public.pick_lists
  FOR SELECT TO authenticated
  USING (
    rbac_internal.can_access_party_resource('pick_list', 'read', customer_party_id, flow_type::text)
  );
--> statement-breakpoint

-- pick_list_items: inherits scope from parent pick_lists.
ALTER TABLE public.pick_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pick_list_items FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY pick_list_items_select ON public.pick_list_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pick_lists pl
      WHERE pl.id = pick_list_items.pick_list_id
        AND (
          rbac_internal.has_permission('pick_list', 'read', 'global')
          OR rbac_internal.can_access_party_resource('pick_list', 'read', pl.customer_party_id, pl.flow_type::text)
        )
    )
  );
--> statement-breakpoint

-- inventory_transactions: no direct party column, no party-user grant at
-- all in v1 (design.md §7.4's explicit instruction).
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY inventory_transactions_select_staff ON public.inventory_transactions
  FOR SELECT TO authenticated
  USING (rbac_internal.has_permission('inventory', 'read', 'global'));
--> statement-breakpoint

-- items: NO direct SELECT grant for party users -- only the internal-staff
-- policy exists on the base table. party_visible_items (below) is the sole
-- party-facing read path.
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY items_select_staff ON public.items
  FOR SELECT TO authenticated
  USING (rbac_internal.has_permission('items', 'read', 'global'));
--> statement-breakpoint

-- locations: operational/global capability only.
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY locations_select ON public.locations
  FOR SELECT TO authenticated
  USING (rbac_internal.has_permission('locations', 'read', 'global'));
--> statement-breakpoint

-- forex_rates: operational/global capability only (supervisor + admin,
-- per the seeded catalog -- warehouse_staff is NOT granted forex_rates.read).
ALTER TABLE public.forex_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forex_rates FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY forex_rates_select ON public.forex_rates
  FOR SELECT TO authenticated
  USING (rbac_internal.has_permission('forex_rates', 'read', 'global'));
--> statement-breakpoint

-- parties: staff/admin global, or party users scoped to their own party id.
-- FIXED 2026-08-08 (db-migration-verifier / rbac-rls-reviewer): the party
-- branch is a direct, flow-agnostic assignment-existence check via
-- has_any_party_scope, NOT can_access_party_resource -- `parties` rows are
-- not themselves flow-partitioned data, so a party user holding a
-- flow-specific (e.g. Trading-only) scope assignment can see their own
-- counterparty's `parties` row, exactly like a null/all-flow assignment can.
-- See the corrected design.md §7.4 `parties` bullet and the
-- has_any_party_scope helper's own comment above for why the previous
-- can_access_party_resource(..., NULL) formulation was a real bug, not a
-- faithful implementation.
ALTER TABLE public.parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parties FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY parties_select_staff ON public.parties
  FOR SELECT TO authenticated
  USING (rbac_internal.has_permission('parties', 'read', 'global'));
--> statement-breakpoint
CREATE POLICY parties_select_party ON public.parties
  FOR SELECT TO authenticated
  USING (rbac_internal.has_any_party_scope(id));
--> statement-breakpoint

-- party_roles: visibility inherits from the parent parties row. Uses the
-- same has_any_party_scope helper as parties_select_party above (fixed
-- 2026-08-08, same reasoning).
ALTER TABLE public.party_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.party_roles FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY party_roles_select ON public.party_roles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.parties p
      WHERE p.id = party_roles.party_id
        AND (
          rbac_internal.has_permission('parties', 'read', 'global')
          OR rbac_internal.has_any_party_scope(p.id)
        )
    )
  );
--> statement-breakpoint

-- item_categories: staff/admin global only; party context (where relevant)
-- is surfaced only through party_visible_items, never a direct grant here.
ALTER TABLE public.item_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_categories FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY item_categories_select ON public.item_categories
  FOR SELECT TO authenticated
  USING (rbac_internal.has_permission('items', 'read', 'global'));
--> statement-breakpoint

-- lot_location_balances: staff global; VMI party via one-hop join to the
-- parent lots row. Trading: no direct grant (matches the lots Trading
-- branch above). Supplies: staff-only, same as lots.
-- NOTE: uses resource string 'lot_location_balances' -- see FLAGGED FINDING.
ALTER TABLE public.lot_location_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lot_location_balances FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY lot_location_balances_select ON public.lot_location_balances
  FOR SELECT TO authenticated
  USING (
    rbac_internal.has_permission('inventory', 'read', 'global')
    OR EXISTS (
      SELECT 1 FROM public.lots l
      WHERE l.id = lot_location_balances.lot_id
        AND l.flow_type = 'vmi'
        AND rbac_internal.can_access_party_resource('lot_location_balances', 'read', l.owner_party_id, 'vmi')
    )
  );
--> statement-breakpoint

-- inventory_commitments: internal staff only via pick_list.read or
-- dispatch.read; no party-user grant.
ALTER TABLE public.inventory_commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_commitments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY inventory_commitments_select ON public.inventory_commitments
  FOR SELECT TO authenticated
  USING (
    rbac_internal.has_permission('pick_list', 'read', 'global')
    OR rbac_internal.has_permission('dispatch', 'read', 'global')
  );
--> statement-breakpoint

-- inventory_commitment_lines: select inherits from the parent
-- inventory_commitments row; no independent select policy, no party grant.
ALTER TABLE public.inventory_commitment_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_commitment_lines FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY inventory_commitment_lines_select ON public.inventory_commitment_lines
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.inventory_commitments ic
      WHERE ic.id = inventory_commitment_lines.commitment_id
        AND (
          rbac_internal.has_permission('pick_list', 'read', 'global')
          OR rbac_internal.has_permission('dispatch', 'read', 'global')
        )
    )
  );
--> statement-breakpoint

-- ===========================================================================
-- 7. party_visible_items: the sole party-facing read path for items.
--    Default (non-security_invoker) view, owned by rbac_definer, exposing
--    only the columns design.md §7.4 names -- never
--    default_supplier_party_id / buying_price / selling_price /
--    min_reorder_level. A security_invoker view would be subject to items'
--    own base-table RLS (which correctly grants party users zero rows),
--    always returning zero rows regardless of this view's own filter --
--    exactly why the default-owner form is required, not a style choice.
-- ===========================================================================

-- rbac_definer needs its own SELECT grant on the base tables this view
-- reads, distinct from (and narrower in purpose than) the RBAC-table grants
-- in section 2 above -- this is the view-owner mechanism's specific,
-- least-privilege table access, not a reuse of those grants.
GRANT SELECT ON public.items TO rbac_definer;
--> statement-breakpoint
GRANT SELECT ON public.pick_list_items TO rbac_definer;
--> statement-breakpoint
GRANT SELECT ON public.pick_lists TO rbac_definer;
--> statement-breakpoint
GRANT SELECT ON public.wrr_items TO rbac_definer;
--> statement-breakpoint
GRANT SELECT ON public.wrr_documents TO rbac_definer;
--> statement-breakpoint

CREATE VIEW public.party_visible_items
WITH (security_invoker = false)
AS
SELECT
  i.id,
  i.code,
  i.name,
  i.description,
  i.barcode,
  i.uom,
  i.spq,
  i.spq_meter,
  i.length_cm,
  i.width_cm,
  i.height_cm,
  i.volume_cm3,
  i.volume_cbm,
  i.is_perishable
FROM public.items i
WHERE
  EXISTS (
    SELECT 1
    FROM public.pick_list_items pli
    JOIN public.pick_lists pl ON pl.id = pli.pick_list_id
    WHERE pli.item_id = i.id
      AND rbac_internal.can_access_party_resource('pick_list', 'read', pl.customer_party_id, pl.flow_type::text)
  )
  OR EXISTS (
    SELECT 1
    FROM public.wrr_items wi
    JOIN public.wrr_documents wd ON wd.id = wi.wrr_id
    WHERE wi.item_id = i.id
      AND rbac_internal.can_access_party_resource('wrr_documents', 'read', wd.vendor_party_id, wd.flow_type::text)
  );
--> statement-breakpoint

ALTER VIEW public.party_visible_items OWNER TO rbac_definer;
--> statement-breakpoint

-- ===========================================================================
-- 8. Narrow, explicit table-level grants to `authenticated` -- SELECT only,
--    exactly matching the SELECT-only policies above (design.md §7.1: "no
--    broad authenticated table privileges beyond those required by explicit
--    policies").
-- ===========================================================================

GRANT SELECT ON public.user_profiles TO authenticated;
--> statement-breakpoint
GRANT SELECT ON public.roles TO authenticated;
--> statement-breakpoint
GRANT SELECT ON public.permissions TO authenticated;
--> statement-breakpoint
GRANT SELECT ON public.role_permissions TO authenticated;
--> statement-breakpoint
GRANT SELECT ON public.user_roles TO authenticated;
--> statement-breakpoint
GRANT SELECT ON public.user_party_scopes TO authenticated;
--> statement-breakpoint
GRANT SELECT ON public.rbac_security_events TO authenticated;
--> statement-breakpoint
GRANT SELECT ON public.audit_log TO authenticated;
--> statement-breakpoint
GRANT SELECT ON public.wrr_documents TO authenticated;
--> statement-breakpoint
GRANT SELECT ON public.wrr_items TO authenticated;
--> statement-breakpoint
GRANT SELECT ON public.wrr_inspection_logs TO authenticated;
--> statement-breakpoint
GRANT SELECT ON public.lots TO authenticated;
--> statement-breakpoint
GRANT SELECT ON public.pick_lists TO authenticated;
--> statement-breakpoint
GRANT SELECT ON public.pick_list_items TO authenticated;
--> statement-breakpoint
GRANT SELECT ON public.inventory_transactions TO authenticated;
--> statement-breakpoint
GRANT SELECT ON public.items TO authenticated;
--> statement-breakpoint
GRANT SELECT ON public.locations TO authenticated;
--> statement-breakpoint
GRANT SELECT ON public.forex_rates TO authenticated;
--> statement-breakpoint
GRANT SELECT ON public.parties TO authenticated;
--> statement-breakpoint
GRANT SELECT ON public.party_roles TO authenticated;
--> statement-breakpoint
GRANT SELECT ON public.item_categories TO authenticated;
--> statement-breakpoint
GRANT SELECT ON public.lot_location_balances TO authenticated;
--> statement-breakpoint
GRANT SELECT ON public.inventory_commitments TO authenticated;
--> statement-breakpoint
GRANT SELECT ON public.inventory_commitment_lines TO authenticated;
--> statement-breakpoint
GRANT SELECT ON public.party_visible_items TO authenticated;

-- Production bug found live (2026-08-19): every RLS-bound mutation
-- (createParty/createItem/createLocation/createWrr, all routed through
-- lib/db/rls-transaction.ts's withRlsTransaction) started failing with
-- "permission denied for schema auth" from inside
-- rbac_internal.has_permission -- yet the SELECT policies that call the
-- same function kept working. Root cause: 0008_rls_policies.sql granted
-- `rbac_definer` (the SECURITY DEFINER owner of every RBAC helper function)
-- `USAGE ON SCHEMA auth` and `EXECUTE ON FUNCTION auth.uid()`, but a live
-- check of `pg_namespace.nspacl` for `auth` shows `rbac_definer` no longer
-- listed -- Supabase does not guarantee custom-role grants on its
-- platform-managed `auth` schema survive its own maintenance, so this can
-- silently regress at any time without a corresponding change in this
-- repo. The plain (non-SECURITY-DEFINER) RLS policies that inline
-- `auth.uid()` directly (e.g. `user_profiles_select_self`,
-- `user_roles_select_self`, `user_party_scopes_select_self` in
-- 0008_rls_policies.sql) are unaffected -- they run as the `authenticated`
-- role, which independently keeps `USAGE ON SCHEMA auth` from Supabase's
-- own default grants.
--
-- Fix: stop depending on the `auth` schema at all inside `rbac_internal`'s
-- SECURITY DEFINER functions. `auth.uid()` is itself just
-- `current_setting('request.jwt.claims', true)::jsonb ->> 'sub'` cast to
-- uuid (Supabase's own published implementation) -- the exact same GUC
-- lib/db/rls-transaction.ts's `buildRlsClaimStatements` already sets via
-- `set_config('request.jwt.claims', ..., true)` before every callback
-- query. Reading that GUC directly inside `public`/`rbac_internal` removes
-- the cross-schema call, and with it the fragile dependency on a grant a
-- platform-managed schema can revoke out from under this repo.
--
-- `rbac_internal.current_uid()` centralizes that expression so the four
-- call sites below (current_user_is_active, has_permission,
-- has_party_scope, has_any_party_scope) share one definition rather than
-- repeating the JSON-extraction expression four times. CREATE OR REPLACE
-- keeps each function's OID stable, so every existing RLS policy that
-- already references these functions by name keeps working unchanged --
-- no policy needs to be dropped or recreated.

CREATE FUNCTION rbac_internal.current_uid()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
$$;
--> statement-breakpoint

ALTER FUNCTION rbac_internal.current_uid() OWNER TO rbac_definer;
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION rbac_internal.current_uid() FROM PUBLIC;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION rbac_internal.current_uid() TO authenticated;
--> statement-breakpoint

-- ===========================================================================
-- Redefine the four affected functions to call rbac_internal.current_uid()
-- instead of auth.uid(). Bodies are otherwise byte-for-byte identical to
-- 0008_rls_policies.sql's originals.
-- ===========================================================================

CREATE OR REPLACE FUNCTION rbac_internal.current_user_is_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles up
    WHERE up.id = rbac_internal.current_uid()
      AND up.status = 'active'
  );
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION rbac_internal.has_permission(
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
    WHERE ur.user_id = rbac_internal.current_uid()
      AND ur.revoked_at IS NULL
      AND ur.valid_from <= now()
      AND (ur.valid_until IS NULL OR ur.valid_until > now())
      AND p.resource = p_resource
      AND p.action = p_action
  );
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION rbac_internal.has_party_scope(
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
    WHERE ups.user_id = rbac_internal.current_uid()
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

CREATE OR REPLACE FUNCTION rbac_internal.has_any_party_scope(
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
    WHERE ups.user_id = rbac_internal.current_uid()
      AND ups.party_id = p_party_id
      AND ups.revoked_at IS NULL
      AND ups.valid_from <= now()
      AND (ups.valid_until IS NULL OR ups.valid_until > now())
  );
$$;

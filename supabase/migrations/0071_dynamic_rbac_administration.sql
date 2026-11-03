-- Approved 02 dynamic-RBAC amendment, 2026-11-03.
-- Runtime callers enter as authenticated with transaction-local auth.uid().
-- No write policy is added to RBAC tables: these controlled functions are
-- the only ordinary authenticated mutation path. All events commit atomically.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'rbac_admin_writer') THEN
    CREATE ROLE rbac_admin_writer NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'postgres') THEN
    GRANT rbac_admin_writer TO postgres;
  END IF;
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public, auth, rbac_internal TO rbac_admin_writer;
GRANT CREATE ON SCHEMA rbac_internal TO rbac_admin_writer;
GRANT EXECUTE ON FUNCTION auth.uid() TO rbac_admin_writer;
GRANT EXECUTE ON FUNCTION rbac_internal.has_permission(text, text, public.scope_kind) TO rbac_admin_writer;
GRANT SELECT ON public.roles, public.role_permissions, public.permissions,
  public.user_roles, public.user_profiles, public.user_party_scopes, public.parties TO rbac_admin_writer;
GRANT INSERT, UPDATE ON public.roles, public.user_roles TO rbac_admin_writer;
GRANT INSERT, DELETE ON public.role_permissions TO rbac_admin_writer;
GRANT UPDATE ON public.user_profiles TO rbac_admin_writer;
GRANT INSERT ON public.audit_log TO rbac_admin_writer;
--> statement-breakpoint
-- The canonical scope vocabulary comes only from migration-managed system
-- mappings. Custom grants can never enlarge their own allowed-scope catalog.
CREATE VIEW rbac_internal.permission_scope_catalog AS
  SELECT DISTINCT rp.permission_id, rp.scope_kind
  FROM public.role_permissions rp
  JOIN public.roles r ON r.id = rp.role_id AND r.is_system;
ALTER VIEW rbac_internal.permission_scope_catalog OWNER TO rbac_admin_writer;
REVOKE ALL ON rbac_internal.permission_scope_catalog FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
CREATE FUNCTION rbac_internal.require_access_administrator()
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT rbac_internal.has_permission('access_assignments', 'grant', 'global')
     OR NOT rbac_internal.has_permission('access_assignments', 'revoke', 'global')
     OR NOT EXISTS (
       SELECT 1 FROM public.user_roles ur
       JOIN public.roles r ON r.id = ur.role_id
       WHERE ur.user_id = auth.uid() AND ur.revoked_at IS NULL
         AND ur.valid_from <= now() AND (ur.valid_until IS NULL OR ur.valid_until > now())
         AND r.key = 'administrator' AND r.is_system AND r.is_active
     ) THEN
    RAISE EXCEPTION 'Only an active access administrator can change roles or assignments.' USING ERRCODE = '42501';
  END IF;
END $$;
ALTER FUNCTION rbac_internal.require_access_administrator() OWNER TO rbac_admin_writer;
REVOKE ALL ON FUNCTION rbac_internal.require_access_administrator() FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
CREATE FUNCTION rbac_internal.assert_recovery_administrator()
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_profiles up
    JOIN public.user_roles ur ON ur.user_id = up.id
    JOIN public.roles r ON r.id = ur.role_id
    WHERE up.status = 'active' AND r.key = 'administrator' AND r.is_system AND r.is_active
      AND ur.revoked_at IS NULL AND ur.valid_from <= now()
      AND (ur.valid_until IS NULL OR ur.valid_until > now())
  ) THEN
    RAISE EXCEPTION 'The last active administrator cannot be removed. Assign another active administrator first.' USING ERRCODE = '23514';
  END IF;
END $$;
ALTER FUNCTION rbac_internal.assert_recovery_administrator() OWNER TO rbac_admin_writer;
REVOKE ALL ON FUNCTION rbac_internal.assert_recovery_administrator() FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
CREATE FUNCTION rbac_internal.assert_user_role_scopes(p_user_id uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_global boolean; v_scoped boolean; v_scope boolean; v_party_role boolean;
BEGIN
  SELECT coalesce(bool_or(rp.scope_kind = 'global'), false),
         coalesce(bool_or(rp.scope_kind = 'assigned_party'), false)
  INTO v_global, v_scoped
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id AND r.is_active
  JOIN public.role_permissions rp ON rp.role_id = r.id
  JOIN public.permissions p ON p.id = rp.permission_id AND p.is_active
  WHERE ur.user_id = p_user_id AND ur.revoked_at IS NULL
    AND ur.valid_from <= now() AND (ur.valid_until IS NULL OR ur.valid_until > now());
  SELECT EXISTS (
    SELECT 1 FROM public.user_party_scopes ups
    JOIN public.parties p ON p.id = ups.party_id AND p.is_active
    WHERE ups.user_id = p_user_id AND ups.revoked_at IS NULL
      AND ups.valid_from <= now() AND (ups.valid_until IS NULL OR ups.valid_until > now())
      AND (ups.flow_type IS NULL OR ups.flow_type::text <> 'supplies')
  ) INTO v_scope;
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_user_id AND ur.revoked_at IS NULL AND r.is_active
      AND r.key = 'party_user' AND r.is_system
      AND ur.valid_from <= now() AND (ur.valid_until IS NULL OR ur.valid_until > now())
  ) INTO v_party_role;
  IF (v_scoped OR v_party_role) AND NOT v_scope THEN
    RAISE EXCEPTION 'An Organization-scoped role requires a current Organization scope.' USING ERRCODE = '23514';
  END IF;
  IF v_global AND (v_scoped OR v_scope OR v_party_role) THEN
    RAISE EXCEPTION 'Organization-scoped accounts cannot receive warehouse-wide permissions. Separate internal and Organization accounts.' USING ERRCODE = '23514';
  END IF;
END $$;
ALTER FUNCTION rbac_internal.assert_user_role_scopes(uuid) OWNER TO rbac_admin_writer;
REVOKE ALL ON FUNCTION rbac_internal.assert_user_role_scopes(uuid) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
CREATE FUNCTION rbac_internal.admin_permission_catalog()
RETURNS TABLE(permission_id uuid, resource text, action text, description text, scope_kind public.scope_kind)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT rbac_internal.has_permission('access_assignments', 'read', 'global') THEN
    RAISE EXCEPTION 'Access denied.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT p.id, p.resource::text, p.action::text, p.description, c.scope_kind
    FROM rbac_internal.permission_scope_catalog c
    JOIN public.permissions p ON p.id = c.permission_id AND p.is_active
    ORDER BY p.resource, p.action, c.scope_kind;
END $$;
ALTER FUNCTION rbac_internal.admin_permission_catalog() OWNER TO rbac_admin_writer;
REVOKE ALL ON FUNCTION rbac_internal.admin_permission_catalog() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rbac_internal.admin_permission_catalog() TO authenticated;
--> statement-breakpoint
CREATE FUNCTION rbac_internal.admin_list_roles()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_result jsonb;
BEGIN
  IF NOT rbac_internal.has_permission('access_assignments', 'read', 'global') THEN
    RAISE EXCEPTION 'Access denied.' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'key', r.key, 'name', r.name, 'description', coalesce(r.description, ''),
    'isSystem', r.is_system, 'isActive', r.is_active,
    'grants', coalesce((
      SELECT jsonb_agg(jsonb_build_object('permissionId', p.id, 'resource', p.resource,
        'action', p.action, 'scopeKind', rp.scope_kind) ORDER BY p.resource, p.action, rp.scope_kind)
      FROM public.role_permissions rp JOIN public.permissions p ON p.id = rp.permission_id AND p.is_active
      WHERE rp.role_id = r.id
    ), '[]'::jsonb)
  ) ORDER BY r.is_system DESC, r.name, r.id), '[]'::jsonb) INTO v_result
  FROM public.roles r;
  RETURN v_result;
END $$;
ALTER FUNCTION rbac_internal.admin_list_roles() OWNER TO rbac_admin_writer;
REVOKE ALL ON FUNCTION rbac_internal.admin_list_roles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rbac_internal.admin_list_roles() TO authenticated;
--> statement-breakpoint
CREATE FUNCTION rbac_internal.admin_get_user_access(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_role_ids jsonb; v_grants jsonb;
BEGIN
  IF NOT rbac_internal.has_permission('access_assignments', 'read', 'global') THEN
    RAISE EXCEPTION 'Access denied.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Account not found.' USING ERRCODE = 'P0002';
  END IF;
  SELECT coalesce(jsonb_agg(r.id ORDER BY r.key), '[]'::jsonb) INTO v_role_ids
    FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id AND r.is_active
    WHERE ur.user_id = p_user_id AND ur.revoked_at IS NULL
      AND ur.valid_from <= now() AND (ur.valid_until IS NULL OR ur.valid_until > now());
  SELECT coalesce(jsonb_agg(jsonb_build_object('permissionId', g.id, 'resource', g.resource,
    'action', g.action, 'scopeKind', g.scope_kind) ORDER BY g.resource, g.action, g.scope_kind), '[]'::jsonb)
  INTO v_grants FROM (
    SELECT DISTINCT p.id, p.resource, p.action, rp.scope_kind
    FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id AND r.is_active
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions p ON p.id = rp.permission_id AND p.is_active
    JOIN public.user_profiles up ON up.id = ur.user_id AND up.status = 'active'
    WHERE ur.user_id = p_user_id AND ur.revoked_at IS NULL
      AND ur.valid_from <= now() AND (ur.valid_until IS NULL OR ur.valid_until > now())
  ) g;
  RETURN jsonb_build_object('roleIds', v_role_ids, 'grants', v_grants);
END $$;
ALTER FUNCTION rbac_internal.admin_get_user_access(uuid) OWNER TO rbac_admin_writer;
REVOKE ALL ON FUNCTION rbac_internal.admin_get_user_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rbac_internal.admin_get_user_access(uuid) TO authenticated;
--> statement-breakpoint
CREATE FUNCTION rbac_internal.admin_save_role(
  p_role_id uuid, p_key text, p_name text, p_description text, p_grants jsonb, p_reason text
) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_role public.roles%ROWTYPE; v_id uuid; v_before jsonb; v_after jsonb; v_user uuid;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(20261103, 71);
  PERFORM rbac_internal.require_access_administrator();
  IF p_key IS NULL OR p_key !~ '^[a-z][a-z0-9_]{1,99}$'
     OR p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 2 AND 255
     OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 1000
     OR (p_description IS NOT NULL AND length(p_description) > 2000)
     OR p_grants IS NULL OR jsonb_typeof(p_grants) <> 'array' THEN
    RAISE EXCEPTION 'Invalid role details, grants, or change reason.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_grants) > 500 THEN
    RAISE EXCEPTION 'Too many role grants.' USING ERRCODE = '22023';
  END IF;
  -- Validate shape before casts: no permissive unknown-key or missing-key path.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_grants) e WHERE jsonb_typeof(e) <> 'object'
      OR NOT (e ? 'permissionId' AND e ? 'scopeKind')
      OR e - 'permissionId' - 'scopeKind' <> '{}'::jsonb
      OR jsonb_typeof(e->'permissionId') <> 'string'
      OR jsonb_typeof(e->'scopeKind') <> 'string'
      OR (e->>'permissionId') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      OR (e->>'scopeKind') NOT IN ('global', 'assigned_party')) THEN
    RAISE EXCEPTION 'Invalid canonical permission or scope.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_grants) e
    GROUP BY (e->>'permissionId')::uuid, e->>'scopeKind' HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Duplicate permission grants are not allowed.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_grants) e
    WHERE NOT EXISTS (
      SELECT 1 FROM rbac_internal.permission_scope_catalog c
      JOIN public.permissions p ON p.id = c.permission_id AND p.is_active
      WHERE c.permission_id = (e->>'permissionId')::uuid AND c.scope_kind::text = e->>'scopeKind'
    )
  ) THEN
    RAISE EXCEPTION 'Unsupported or inactive canonical permission/scope pair.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_grants) e WHERE e->>'scopeKind' = 'global')
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(p_grants) e WHERE e->>'scopeKind' = 'assigned_party') THEN
    RAISE EXCEPTION 'A role cannot mix warehouse-wide and Organization-scoped grants.' USING ERRCODE = '23514';
  END IF;
  IF p_role_id IS NOT NULL THEN
    SELECT * INTO v_role FROM public.roles WHERE id = p_role_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Role not found.' USING ERRCODE = 'P0002'; END IF;
    IF v_role.is_system THEN RAISE EXCEPTION 'System-defined roles cannot be edited.' USING ERRCODE = '42501'; END IF;
    IF v_role.key <> p_key THEN RAISE EXCEPTION 'A saved role key cannot be changed.' USING ERRCODE = '22023'; END IF;
    v_id := v_role.id;
    SELECT jsonb_build_object('role', to_jsonb(v_role), 'grants', coalesce(jsonb_agg(
      jsonb_build_object('permissionId', rp.permission_id, 'scopeKind', rp.scope_kind)
      ORDER BY rp.permission_id, rp.scope_kind) FILTER (WHERE rp.permission_id IS NOT NULL), '[]'::jsonb))
      INTO v_before FROM public.role_permissions rp WHERE rp.role_id = v_id;
    UPDATE public.roles SET name = btrim(p_name), description = p_description, is_active = true, updated_at = now() WHERE id = v_id;
  ELSE
    IF EXISTS (SELECT 1 FROM public.roles WHERE key = p_key) THEN
      RAISE EXCEPTION 'A role with this key already exists.' USING ERRCODE = '23505';
    END IF;
    INSERT INTO public.roles (key, name, description, is_system, is_active)
      VALUES (p_key, btrim(p_name), p_description, false, true) RETURNING id INTO v_id;
    v_before := NULL;
  END IF;
  DELETE FROM public.role_permissions WHERE role_id = v_id;
  INSERT INTO public.role_permissions (role_id, permission_id, scope_kind)
    SELECT DISTINCT v_id, (e->>'permissionId')::uuid, (e->>'scopeKind')::public.scope_kind
    FROM jsonb_array_elements(p_grants) e;
  -- Revalidate every active assignment; modifying a role must not silently
  -- convert an Organization account to warehouse-wide access.
  FOR v_user IN SELECT DISTINCT user_id FROM public.user_roles WHERE role_id = v_id
    AND revoked_at IS NULL AND valid_from <= now() AND (valid_until IS NULL OR valid_until > now()) LOOP
    PERFORM rbac_internal.assert_user_role_scopes(v_user);
  END LOOP;
  PERFORM rbac_internal.assert_recovery_administrator();
  SELECT jsonb_build_object('role', to_jsonb(r), 'grants', coalesce((
    SELECT jsonb_agg(jsonb_build_object('permissionId', rp.permission_id, 'scopeKind', rp.scope_kind)
      ORDER BY rp.permission_id, rp.scope_kind) FROM public.role_permissions rp WHERE rp.role_id = v_id
  ), '[]'::jsonb)) INTO v_after FROM public.roles r WHERE r.id = v_id;
  INSERT INTO public.audit_log (actor_user_id, actor_role, action, entity_type, entity_id, before_data, after_data, diff_data, correlation_id)
    VALUES (auth.uid(), 'administrator', 'dynamic_role_saved', 'roles', v_id, v_before, v_after,
      jsonb_build_object('reason', btrim(p_reason)), gen_random_uuid()::text);
  RETURN v_id;
END $$;
ALTER FUNCTION rbac_internal.admin_save_role(uuid, text, text, text, jsonb, text) OWNER TO rbac_admin_writer;
REVOKE ALL ON FUNCTION rbac_internal.admin_save_role(uuid, text, text, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rbac_internal.admin_save_role(uuid, text, text, text, jsonb, text) TO authenticated;
--> statement-breakpoint
CREATE FUNCTION rbac_internal.admin_deactivate_role(p_role_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_before jsonb; v_after jsonb; v_system boolean;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(20261103, 71);
  PERFORM rbac_internal.require_access_administrator();
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 1000 THEN
    RAISE EXCEPTION 'A change reason is required.' USING ERRCODE = '22023';
  END IF;
  SELECT to_jsonb(r), r.is_system INTO v_before, v_system FROM public.roles r WHERE r.id = p_role_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Role not found.' USING ERRCODE = 'P0002'; END IF;
  IF v_system THEN RAISE EXCEPTION 'System-defined roles cannot be deactivated.' USING ERRCODE = '42501'; END IF;
  UPDATE public.roles SET is_active = false, updated_at = now() WHERE id = p_role_id;
  PERFORM rbac_internal.assert_recovery_administrator();
  SELECT to_jsonb(r) INTO v_after FROM public.roles r WHERE r.id = p_role_id;
  INSERT INTO public.audit_log (actor_user_id, actor_role, action, entity_type, entity_id, before_data, after_data, diff_data, correlation_id)
    VALUES (auth.uid(), 'administrator', 'dynamic_role_deactivated', 'roles', p_role_id, v_before, v_after,
      jsonb_build_object('reason', btrim(p_reason)), gen_random_uuid()::text);
END $$;
ALTER FUNCTION rbac_internal.admin_deactivate_role(uuid, text) OWNER TO rbac_admin_writer;
REVOKE ALL ON FUNCTION rbac_internal.admin_deactivate_role(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rbac_internal.admin_deactivate_role(uuid, text) TO authenticated;
--> statement-breakpoint
CREATE FUNCTION rbac_internal.admin_replace_user_roles(p_user_id uuid, p_role_ids uuid[], p_reason text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_before jsonb; v_after jsonb;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(20261103, 71);
  PERFORM rbac_internal.require_access_administrator();
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 1000 OR p_role_ids IS NULL
     OR cardinality(p_role_ids) > 100 OR array_position(p_role_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Invalid account roles or change reason.' USING ERRCODE = '22023';
  END IF;
  IF cardinality(p_role_ids) <> (SELECT count(DISTINCT id) FROM unnest(p_role_ids) id) THEN
    RAISE EXCEPTION 'Duplicate role assignments are not allowed.' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.user_profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found.' USING ERRCODE = 'P0002'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_role_ids) requested(id) WHERE NOT EXISTS (
    SELECT 1 FROM public.roles r WHERE r.id = requested.id AND r.is_active
  )) THEN
    RAISE EXCEPTION 'Only existing active roles can be assigned.' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(ur) ORDER BY ur.id), '[]'::jsonb) INTO v_before
    FROM public.user_roles ur WHERE ur.user_id = p_user_id AND ur.revoked_at IS NULL;
  -- Preserve valid retained assignments and their original expiry. Ended or
  -- future assignments selected for immediate access get a new history row.
  UPDATE public.user_roles SET revoked_at = now(), revoked_by_user_id = auth.uid(), revocation_reason = btrim(p_reason)
    WHERE user_id = p_user_id AND revoked_at IS NULL AND (
      NOT (role_id = ANY(p_role_ids)) OR valid_from > now() OR (valid_until IS NOT NULL AND valid_until <= now())
    );
  INSERT INTO public.user_roles (user_id, role_id, granted_by_user_id, grant_reason)
    SELECT p_user_id, requested.id, auth.uid(), btrim(p_reason) FROM (SELECT DISTINCT unnest(p_role_ids) AS id) requested
    WHERE NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p_user_id AND ur.role_id = requested.id AND ur.revoked_at IS NULL);
  PERFORM rbac_internal.assert_user_role_scopes(p_user_id);
  PERFORM rbac_internal.assert_recovery_administrator();
  SELECT coalesce(jsonb_agg(to_jsonb(ur) ORDER BY ur.id), '[]'::jsonb) INTO v_after
    FROM public.user_roles ur WHERE ur.user_id = p_user_id AND ur.revoked_at IS NULL;
  INSERT INTO public.audit_log (actor_user_id, actor_role, action, entity_type, entity_id, before_data, after_data, diff_data, correlation_id)
    VALUES (auth.uid(), 'administrator', 'user_roles_replaced', 'user_profiles', p_user_id, v_before, v_after,
      jsonb_build_object('reason', btrim(p_reason)), gen_random_uuid()::text);
END $$;
ALTER FUNCTION rbac_internal.admin_replace_user_roles(uuid, uuid[], text) OWNER TO rbac_admin_writer;
REVOKE ALL ON FUNCTION rbac_internal.admin_replace_user_roles(uuid, uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rbac_internal.admin_replace_user_roles(uuid, uuid[], text) TO authenticated;
--> statement-breakpoint
CREATE FUNCTION rbac_internal.admin_set_user_active(p_user_id uuid, p_active boolean, p_reason text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_before jsonb; v_after jsonb;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(20261103, 71);
  PERFORM rbac_internal.require_access_administrator();
  IF p_active IS NULL OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 1000 THEN
    RAISE EXCEPTION 'A status and change reason are required.' USING ERRCODE = '22023';
  END IF;
  IF NOT rbac_internal.has_permission('users', CASE WHEN p_active THEN 'activate' ELSE 'deactivate' END, 'global') THEN
    RAISE EXCEPTION 'Access denied.' USING ERRCODE = '42501';
  END IF;
  SELECT to_jsonb(up) INTO v_before FROM public.user_profiles up WHERE up.id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found.' USING ERRCODE = 'P0002'; END IF;
  UPDATE public.user_profiles SET status = CASE WHEN p_active THEN 'active'::public.user_profile_status ELSE 'inactive'::public.user_profile_status END,
    activated_at = CASE WHEN p_active THEN now() ELSE activated_at END,
    activated_by_user_id = CASE WHEN p_active THEN auth.uid() ELSE activated_by_user_id END,
    deactivated_at = CASE WHEN p_active THEN NULL ELSE now() END,
    deactivated_by_user_id = CASE WHEN p_active THEN NULL ELSE auth.uid() END,
    deactivation_reason = CASE WHEN p_active THEN NULL ELSE btrim(p_reason) END,
    updated_at = now() WHERE id = p_user_id;
  IF p_active THEN PERFORM rbac_internal.assert_user_role_scopes(p_user_id); END IF;
  PERFORM rbac_internal.assert_recovery_administrator();
  SELECT to_jsonb(up) INTO v_after FROM public.user_profiles up WHERE up.id = p_user_id;
  INSERT INTO public.audit_log (actor_user_id, actor_role, action, entity_type, entity_id, before_data, after_data, diff_data, correlation_id)
    VALUES (auth.uid(), 'administrator', CASE WHEN p_active THEN 'user_reactivated' ELSE 'user_suspended' END,
      'user_profiles', p_user_id, v_before, v_after, jsonb_build_object('reason', btrim(p_reason)), gen_random_uuid()::text);
END $$;
ALTER FUNCTION rbac_internal.admin_set_user_active(uuid, boolean, text) OWNER TO rbac_admin_writer;
REVOKE ALL ON FUNCTION rbac_internal.admin_set_user_active(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rbac_internal.admin_set_user_active(uuid, boolean, text) TO authenticated;
--> statement-breakpoint
-- The writer can neither create new runtime entry points nor modify the
-- canonical permission catalog. Only the migration owner can add vocabulary.



--> statement-breakpoint
-- Cancellation retains the identity/profile and history. Onboarding can only
-- transition an invited row, so an inactive cancelled account cannot reactivate.
CREATE FUNCTION rbac_internal.admin_cancel_invite(p_user_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_before jsonb; v_after jsonb; v_status public.user_profile_status;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(20261103, 71);
  PERFORM rbac_internal.require_access_administrator();
  IF NOT rbac_internal.has_permission('users', 'deactivate', 'global') THEN
    RAISE EXCEPTION 'Access denied.' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 1000 THEN
    RAISE EXCEPTION 'A reason is required to cancel an invitation.' USING ERRCODE = '22023';
  END IF;
  SELECT to_jsonb(up), up.status INTO v_before, v_status
    FROM public.user_profiles up WHERE up.id = p_user_id FOR UPDATE;
  IF NOT FOUND OR v_status <> 'invited' THEN
    RAISE EXCEPTION 'Only pending invitations can be cancelled.' USING ERRCODE = '23514';
  END IF;
  UPDATE public.user_profiles SET status = 'inactive', deactivated_at = now(),
    deactivated_by_user_id = auth.uid(), deactivation_reason = btrim(p_reason), updated_at = now()
    WHERE id = p_user_id;
  UPDATE public.user_roles SET revoked_at = now(), revoked_by_user_id = auth.uid(), revocation_reason = btrim(p_reason)
    WHERE user_id = p_user_id AND revoked_at IS NULL;
  UPDATE public.user_party_scopes SET revoked_at = now(), revoked_by_user_id = auth.uid(), revocation_reason = btrim(p_reason)
    WHERE user_id = p_user_id AND revoked_at IS NULL;
  PERFORM rbac_internal.assert_recovery_administrator();
  SELECT to_jsonb(up) INTO v_after FROM public.user_profiles up WHERE up.id = p_user_id;
  INSERT INTO public.audit_log (actor_user_id, actor_role, action, entity_type, entity_id, before_data, after_data, diff_data, correlation_id)
    VALUES (auth.uid(), 'administrator', 'invite_cancelled', 'user_profiles', p_user_id,
      v_before, v_after, jsonb_build_object('reason', btrim(p_reason)), gen_random_uuid()::text);
END $$;
ALTER FUNCTION rbac_internal.admin_cancel_invite(uuid, text) OWNER TO rbac_admin_writer;
REVOKE ALL ON FUNCTION rbac_internal.admin_cancel_invite(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rbac_internal.admin_cancel_invite(uuid, text) TO authenticated;
GRANT UPDATE ON public.user_party_scopes TO rbac_admin_writer;
REVOKE CREATE ON SCHEMA rbac_internal FROM rbac_admin_writer;

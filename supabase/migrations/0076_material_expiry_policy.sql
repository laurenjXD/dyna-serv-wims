-- Approved material-expiry amendment, 2026-11-04. Physical stock and billing
-- remain unchanged by the calendar cutoff. All release guards use server time.
ALTER TYPE public.pick_list_status ADD VALUE IF NOT EXISTS 'cancelled';

ALTER TABLE public.items
  ADD COLUMN expiry_policy text NOT NULL DEFAULT 'block_release',
  ADD COLUMN expiry_policy_version integer NOT NULL DEFAULT 1,
  ADD CONSTRAINT items_expiry_policy_valid CHECK (expiry_policy IN ('block_release', 'allow_with_acknowledgement')),
  ADD CONSTRAINT items_expiry_policy_version_positive CHECK (expiry_policy_version > 0);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'expiry_policy_writer') THEN
    CREATE ROLE expiry_policy_writer NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'postgres') THEN
    GRANT expiry_policy_writer TO postgres;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public, auth, rbac_internal TO expiry_policy_writer;
GRANT EXECUTE ON FUNCTION auth.uid() TO expiry_policy_writer;
GRANT EXECUTE ON FUNCTION rbac_internal.has_permission(text, text, public.scope_kind) TO expiry_policy_writer;
GRANT EXECUTE ON FUNCTION rbac_internal.current_user_is_active() TO expiry_policy_writer;
GRANT EXECUTE ON FUNCTION rbac_internal.can_access_party_resource(text, text, uuid, text) TO expiry_policy_writer;
GRANT SELECT ON public.items, public.lots, public.locations, public.wrr_items,
  public.wrr_documents, public.pick_lists, public.pick_list_items,
  public.lot_location_balances, public.inventory_commitments,
  public.inventory_commitment_lines TO expiry_policy_writer;
GRANT INSERT ON public.audit_log TO expiry_policy_writer;
-- PostgreSQL requires a column UPDATE privilege for FOR SHARE row locks. The
-- NOLOGIN trigger owner receives only identity-column lock privilege here.
GRANT UPDATE (id) ON public.items, public.lots, public.wrr_items TO expiry_policy_writer;

CREATE FUNCTION public.inventory_business_date() RETURNS date
LANGUAGE sql VOLATILE SET search_path = '' AS $$
  SELECT (clock_timestamp() AT TIME ZONE 'Asia/Manila')::date
$$;
REVOKE ALL ON FUNCTION public.inventory_business_date() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inventory_business_date() TO authenticated, service_role, expiry_policy_writer;

CREATE FUNCTION public.inventory_expiry_eligible(
  p_status text, p_expiry_date date, p_policy text, p_is_perishable boolean
) RETURNS boolean LANGUAGE sql VOLATILE SET search_path = '' AS $$
  SELECT COALESCE(
    p_status = 'available'
    AND p_policy IN ('block_release', 'allow_with_acknowledgement')
    AND (NOT COALESCE(p_is_perishable, true) OR p_expiry_date IS NOT NULL)
    AND (p_expiry_date IS NULL OR p_expiry_date >= public.inventory_business_date()
         OR p_policy = 'allow_with_acknowledgement'), false)
$$;
REVOKE ALL ON FUNCTION public.inventory_expiry_eligible(text, date, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inventory_expiry_eligible(text, date, text, boolean) TO authenticated, service_role, expiry_policy_writer;

-- The aggregate remains an invoker view over scoped balances. Organization
-- users intentionally cannot read the full items table; expose only this
-- scoped boolean rather than granting access to reference prices or policy rows.
CREATE FUNCTION public.inventory_lot_expiry_eligible(p_lot_id uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE((SELECT public.inventory_expiry_eligible(l.status::text, l.expiry_date, i.expiry_policy, i.is_perishable)
    FROM public.lots l JOIN public.items i ON i.id = l.item_id WHERE l.id = p_lot_id
    AND (rbac_internal.has_permission('inventory', 'read', 'global')
      OR (l.flow_type::text = 'vmi' AND rbac_internal.can_access_party_resource('lots', 'read', l.owner_party_id, 'vmi'))
      OR current_setting('role', true) = 'service_role'
      OR (COALESCE(current_setting('role', true), 'none') IN ('none', '')
          AND pg_has_role(session_user, 'expiry_policy_writer', 'MEMBER')))), false)
$$;
ALTER FUNCTION public.inventory_lot_expiry_eligible(uuid) OWNER TO expiry_policy_writer;
REVOKE ALL ON FUNCTION public.inventory_lot_expiry_eligible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inventory_lot_expiry_eligible(uuid) TO authenticated, service_role;

CREATE FUNCTION public.guard_item_expiry_policy() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_reason text; v_actor uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.expiry_policy_version IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'expiry_policy_version_is_server_owned' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.expiry_policy_version IS DISTINCT FROM OLD.expiry_policy_version THEN
    RAISE EXCEPTION 'expiry_policy_version_is_server_owned' USING ERRCODE = '23514';
  END IF;
  IF NEW.expiry_policy IS DISTINCT FROM OLD.expiry_policy THEN
    v_actor := auth.uid();
    IF v_actor IS NULL OR NOT rbac_internal.has_permission('items', 'manage', 'global') THEN
      RAISE EXCEPTION 'expiry_policy_forbidden' USING ERRCODE = '42501';
    END IF;
    v_reason := btrim(current_setting('app.expiry_policy_reason', true));
    IF v_reason IS NULL OR length(v_reason) NOT BETWEEN 1 AND 1000 THEN
      RAISE EXCEPTION 'expiry_policy_reason_required' USING ERRCODE = '23514';
    END IF;
    NEW.expiry_policy_version := OLD.expiry_policy_version + 1;
    NEW.updated_at := clock_timestamp();
    INSERT INTO public.audit_log(actor_user_id, actor_role, action, entity_type, entity_id, before_data, after_data, correlation_id)
    VALUES(v_actor, 'expiry_policy_editor', 'expiry_policy_changed', 'items', NEW.id,
      jsonb_build_object('expiryPolicy', OLD.expiry_policy, 'expiryPolicyVersion', OLD.expiry_policy_version),
      jsonb_build_object('expiryPolicy', NEW.expiry_policy, 'expiryPolicyVersion', NEW.expiry_policy_version, 'reason', v_reason),
      gen_random_uuid()::text);
  END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION public.guard_item_expiry_policy() OWNER TO expiry_policy_writer;
REVOKE ALL ON FUNCTION public.guard_item_expiry_policy() FROM PUBLIC;
CREATE TRIGGER items_expiry_policy_guard BEFORE INSERT OR UPDATE OF expiry_policy, expiry_policy_version ON public.items
FOR EACH ROW EXECUTE FUNCTION public.guard_item_expiry_policy();

CREATE TABLE public.expiry_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage text NOT NULL CONSTRAINT expiry_acknowledgements_stage_valid CHECK (stage IN ('receiving', 'generation', 'dispatch')),
  source_id uuid NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reason text NOT NULL CONSTRAINT expiry_acknowledgements_reason_valid CHECK (length(btrim(reason)) BETWEEN 1 AND 1000),
  business_date date NOT NULL,
  fingerprint varchar(64) NOT NULL CONSTRAINT expiry_acknowledgements_fingerprint_valid CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  lines jsonb NOT NULL CONSTRAINT expiry_acknowledgements_lines_valid CHECK (jsonb_typeof(lines) = 'array' AND jsonb_array_length(lines) > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT expiry_acknowledgements_command_fingerprint_unique UNIQUE(stage, source_id, fingerprint)
);
CREATE INDEX expiry_acknowledgements_source_idx ON public.expiry_acknowledgements(stage, source_id);
CREATE INDEX expiry_acknowledgements_actor_idx ON public.expiry_acknowledgements(actor_user_id, created_at);
GRANT SELECT ON public.expiry_acknowledgements TO expiry_policy_writer;
ALTER TABLE public.expiry_acknowledgements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expiry_acknowledgements FORCE ROW LEVEL SECURITY;
CREATE POLICY expiry_acknowledgements_select ON public.expiry_acknowledgements FOR SELECT TO authenticated
USING (
  (stage = 'receiving' AND EXISTS (
    SELECT 1 FROM public.wrr_items wi JOIN public.wrr_documents wd ON wd.id = wi.wrr_id
    WHERE wi.id = source_id AND (rbac_internal.has_permission('receiving', 'view', 'global')
      OR rbac_internal.can_access_party_resource('wrr_documents', 'read', wd.vendor_party_id, wd.flow_type::text))))
  OR (stage IN ('generation', 'dispatch') AND EXISTS (
    SELECT 1 FROM public.pick_lists pl WHERE pl.id = source_id
      AND (rbac_internal.has_permission('pick_list', 'read', 'global')
        OR rbac_internal.has_permission('dispatch', 'read', 'global')
        OR rbac_internal.can_access_party_resource('pick_list', 'read', pl.customer_party_id, pl.flow_type::text))))
);
CREATE POLICY expiry_acknowledgements_insert ON public.expiry_acknowledgements FOR INSERT TO authenticated
WITH CHECK (
  actor_user_id = auth.uid() AND rbac_internal.current_user_is_active()
  AND ((stage = 'receiving' AND rbac_internal.has_permission('receiving', 'confirm', 'global'))
    OR (stage = 'generation' AND rbac_internal.has_permission('pick_list', 'generate', 'global'))
    OR (stage = 'dispatch' AND rbac_internal.has_permission('dispatch', 'execute', 'global')))
);
GRANT SELECT, INSERT ON public.expiry_acknowledgements TO authenticated;

CREATE FUNCTION public.guard_expiry_acknowledgement() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_line jsonb; v_item public.items%ROWTYPE; v_lot public.lots%ROWTYPE;
  v_wrr public.wrr_items%ROWTYPE; v_pick public.pick_lists%ROWTYPE; v_source_exists boolean;
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'expiry_acknowledgements_are_immutable' USING ERRCODE = '42501'; END IF;
  IF NEW.actor_user_id IS DISTINCT FROM auth.uid() OR NOT rbac_internal.current_user_is_active() THEN
    RAISE EXCEPTION 'expiry_acknowledgement_actor_invalid' USING ERRCODE = '42501';
  END IF;
  IF NOT ((NEW.stage = 'receiving' AND rbac_internal.has_permission('receiving', 'confirm', 'global'))
    OR (NEW.stage = 'generation' AND rbac_internal.has_permission('pick_list', 'generate', 'global'))
    OR (NEW.stage = 'dispatch' AND rbac_internal.has_permission('dispatch', 'execute', 'global'))) THEN
    RAISE EXCEPTION 'expiry_acknowledgement_forbidden' USING ERRCODE = '42501';
  END IF;
  IF NEW.business_date IS DISTINCT FROM public.inventory_business_date() THEN
    RAISE EXCEPTION 'expiry_acknowledgement_stale' USING ERRCODE = '23514';
  END IF;
  NEW.created_at := clock_timestamp();
  IF NEW.stage = 'receiving' THEN
    SELECT * INTO v_wrr FROM public.wrr_items WHERE id = NEW.source_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'expiry_acknowledgement_source_invalid' USING ERRCODE = '23514'; END IF;
  ELSE
    SELECT * INTO v_pick FROM public.pick_lists WHERE id = NEW.source_id FOR SHARE;
    IF NOT FOUND OR v_pick.status::text NOT IN ('allocated', 'picked') THEN
      RAISE EXCEPTION 'expiry_acknowledgement_source_invalid' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF jsonb_typeof(NEW.lines) IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.lines) = 0 THEN
    RAISE EXCEPTION 'expiry_acknowledgement_lines_required' USING ERRCODE = '23514';
  END IF;
  FOR v_line IN SELECT value FROM jsonb_array_elements(NEW.lines) LOOP
    SELECT * INTO v_item FROM public.items WHERE id = (v_line->>'itemId')::uuid FOR SHARE;
    IF NOT FOUND OR v_item.expiry_policy <> 'allow_with_acknowledgement'
      OR (v_line->>'expiryPolicy') IS DISTINCT FROM v_item.expiry_policy
      OR (v_line->>'expiryPolicyVersion')::integer IS DISTINCT FROM v_item.expiry_policy_version
      OR COALESCE((v_line->>'qty')::integer, 0) <= 0
      OR NOT EXISTS (SELECT 1 FROM public.locations WHERE id = (v_line->>'locationId')::uuid) THEN
      RAISE EXCEPTION 'expiry_acknowledgement_lines_invalid' USING ERRCODE = '23514';
    END IF;
    IF NEW.stage = 'receiving' THEN
      IF v_wrr.item_id IS DISTINCT FROM v_item.id
        OR (v_line->>'wrrItemId')::uuid IS DISTINCT FROM v_wrr.id
        OR (v_line->>'expiryDate')::date IS DISTINCT FROM v_wrr.expiry_date
        OR v_wrr.expiry_date IS NULL OR v_wrr.expiry_date >= NEW.business_date THEN
        RAISE EXCEPTION 'expiry_acknowledgement_lines_invalid' USING ERRCODE = '23514';
      END IF;
    ELSE
      SELECT * INTO v_lot FROM public.lots WHERE id = (v_line->>'lotId')::uuid FOR SHARE;
      IF NOT FOUND OR v_lot.item_id IS DISTINCT FROM v_item.id
        OR v_lot.flow_type IS DISTINCT FROM v_pick.flow_type
        OR (v_lot.flow_type::text = 'vmi' AND v_lot.owner_party_id IS DISTINCT FROM v_pick.customer_party_id)
        OR v_lot.status::text <> 'available'
        OR (v_line->>'expiryDate')::date IS DISTINCT FROM v_lot.expiry_date
        OR v_lot.expiry_date IS NULL OR v_lot.expiry_date >= NEW.business_date
        OR NOT EXISTS (SELECT 1 FROM public.lot_location_balances b
          WHERE b.lot_id = v_lot.id AND b.location_id = (v_line->>'locationId')::uuid) THEN
        RAISE EXCEPTION 'expiry_acknowledgement_lines_invalid' USING ERRCODE = '23514';
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
ALTER FUNCTION public.guard_expiry_acknowledgement() OWNER TO expiry_policy_writer;
REVOKE ALL ON FUNCTION public.guard_expiry_acknowledgement() FROM PUBLIC;
CREATE TRIGGER expiry_acknowledgements_guard BEFORE INSERT OR UPDATE OR DELETE ON public.expiry_acknowledgements
FOR EACH ROW EXECUTE FUNCTION public.guard_expiry_acknowledgement();

CREATE FUNCTION public.guard_expiry_stock_commitment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_lot public.lots%ROWTYPE; v_item public.items%ROWTYPE;
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.qty_committed > 0)
    OR (TG_OP = 'UPDATE' AND NEW.qty_committed > OLD.qty_committed) THEN
    SELECT * INTO v_lot FROM public.lots WHERE id = NEW.lot_id;
    SELECT * INTO v_item FROM public.items WHERE id = v_lot.item_id FOR SHARE;
    SELECT * INTO v_lot FROM public.lots WHERE id = NEW.lot_id FOR SHARE;
    IF v_lot.item_id IS DISTINCT FROM v_item.id THEN
      RAISE EXCEPTION 'stock_expiry_review_changed' USING ERRCODE = '40001';
    END IF;
    IF NOT public.inventory_expiry_eligible(v_lot.status::text, v_lot.expiry_date, v_item.expiry_policy, v_item.is_perishable) THEN
      RAISE EXCEPTION 'stock_expiry_blocked' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION public.guard_expiry_stock_commitment() OWNER TO expiry_policy_writer;
REVOKE ALL ON FUNCTION public.guard_expiry_stock_commitment() FROM PUBLIC;
CREATE TRIGGER lot_location_balances_expiry_guard BEFORE INSERT OR UPDATE OF qty_committed ON public.lot_location_balances
FOR EACH ROW EXECUTE FUNCTION public.guard_expiry_stock_commitment();

-- The balance guard enforces current eligibility; this line-level guard also
-- requires generation-stage evidence before a permissive expired allocation
-- can become a durable commitment. A direct balance write cannot substitute
-- for the exact reviewed pick-list line.
CREATE FUNCTION public.guard_expiry_commitment_line_acknowledgement() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_pick_item public.pick_list_items%ROWTYPE; v_pick public.pick_lists%ROWTYPE;
  v_balance public.lot_location_balances%ROWTYPE; v_lot public.lots%ROWTYPE; v_item public.items%ROWTYPE;
BEGIN
  IF NEW.status::text <> 'active' OR NEW.qty_committed <= 0 THEN RETURN NEW; END IF;
  SELECT * INTO v_pick_item FROM public.pick_list_items WHERE id = NEW.pick_list_item_id;
  SELECT * INTO v_pick FROM public.pick_lists WHERE id = v_pick_item.pick_list_id;
  SELECT * INTO v_balance FROM public.lot_location_balances WHERE id = NEW.lot_location_balance_id;
  IF v_pick.id IS NULL OR v_pick_item.id IS NULL OR v_balance.id IS NULL
    OR v_balance.lot_id IS DISTINCT FROM v_pick_item.lot_id
    OR v_balance.location_id IS DISTINCT FROM v_pick_item.location_id
    OR v_pick_item.qty IS DISTINCT FROM NEW.qty_committed THEN
    RAISE EXCEPTION 'expiry_commitment_line_mismatch' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_lot FROM public.lots WHERE id = v_balance.lot_id FOR SHARE;
  SELECT * INTO v_item FROM public.items WHERE id = v_lot.item_id FOR SHARE;
  IF v_lot.expiry_date < public.inventory_business_date()
    AND v_item.expiry_policy = 'allow_with_acknowledgement'
    AND NOT EXISTS (
      SELECT 1 FROM public.expiry_acknowledgements a
      CROSS JOIN LATERAL jsonb_array_elements(a.lines) e(value)
      WHERE a.stage = 'generation' AND a.source_id = v_pick.id AND a.actor_user_id = auth.uid()
        AND a.business_date = public.inventory_business_date()
        AND (e.value->>'itemId')::uuid = v_pick_item.item_id
        AND (e.value->>'lotId')::uuid = v_pick_item.lot_id
        AND (e.value->>'locationId')::uuid = v_pick_item.location_id
        AND (e.value->>'qty')::integer = v_pick_item.qty
        AND (e.value->>'expiryDate')::date = v_lot.expiry_date
        AND (e.value->>'expiryPolicy') = v_item.expiry_policy
        AND (e.value->>'expiryPolicyVersion')::integer = v_item.expiry_policy_version
    ) THEN
    RAISE EXCEPTION 'expiry_generation_acknowledgement_required' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION public.guard_expiry_commitment_line_acknowledgement() OWNER TO expiry_policy_writer;
REVOKE ALL ON FUNCTION public.guard_expiry_commitment_line_acknowledgement() FROM PUBLIC;
CREATE TRIGGER inventory_commitment_lines_expiry_ack_guard
BEFORE INSERT OR UPDATE OF qty_committed, status ON public.inventory_commitment_lines
FOR EACH ROW EXECUTE FUNCTION public.guard_expiry_commitment_line_acknowledgement();

CREATE FUNCTION public.guard_expiry_stock_release() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_lot public.lots%ROWTYPE; v_item public.items%ROWTYPE; v_stage text; v_source uuid; v_location uuid;
BEGIN
  IF NEW.movement_type::text NOT IN ('pick', 'receiving') THEN RETURN NEW; END IF;
  SELECT * INTO v_lot FROM public.lots WHERE id = NEW.lot_id;
  SELECT * INTO v_item FROM public.items WHERE id = v_lot.item_id FOR SHARE;
  SELECT * INTO v_lot FROM public.lots WHERE id = NEW.lot_id FOR SHARE;
  IF v_lot.item_id IS DISTINCT FROM v_item.id THEN
    RAISE EXCEPTION 'stock_expiry_review_changed' USING ERRCODE = '40001';
  END IF;
  -- Inspection receipts remain quarantined and require no release acknowledgement.
  IF NEW.movement_type::text = 'receiving' AND v_lot.status::text = 'quarantined' THEN RETURN NEW; END IF;
  IF NOT public.inventory_expiry_eligible(v_lot.status::text, v_lot.expiry_date, v_item.expiry_policy, v_item.is_perishable) THEN
    RAISE EXCEPTION 'stock_expiry_blocked' USING ERRCODE = '23514';
  END IF;
  IF v_lot.expiry_date < public.inventory_business_date() THEN
    IF NEW.movement_type::text = 'pick' THEN
      v_stage := 'dispatch'; v_source := NEW.pick_list_id; v_location := NEW.from_location_id;
    ELSE
      v_stage := 'receiving'; v_source := v_lot.wrr_item_id; v_location := NEW.to_location_id;
    END IF;
    IF NEW.performed_by_user_id IS DISTINCT FROM auth.uid() OR NOT EXISTS (
      SELECT 1 FROM public.expiry_acknowledgements a
      CROSS JOIN LATERAL jsonb_array_elements(a.lines) e(value)
      WHERE a.stage = v_stage AND a.source_id = v_source AND a.actor_user_id = auth.uid()
        AND a.business_date = public.inventory_business_date()
        AND (e.value->>'itemId')::uuid = NEW.item_id
        AND ((v_stage = 'dispatch' AND (e.value->>'lotId')::uuid = NEW.lot_id)
          OR (v_stage = 'receiving' AND (e.value->>'wrrItemId')::uuid = v_lot.wrr_item_id))
        AND (e.value->>'locationId')::uuid = v_location
        AND (e.value->>'qty')::integer = NEW.qty
        AND (e.value->>'expiryDate')::date = v_lot.expiry_date
        AND (e.value->>'expiryPolicy') = v_item.expiry_policy
        AND (e.value->>'expiryPolicyVersion')::integer = v_item.expiry_policy_version
    ) THEN RAISE EXCEPTION 'stock_expiry_acknowledgement_required' USING ERRCODE = '23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION public.guard_expiry_stock_release() OWNER TO expiry_policy_writer;
REVOKE ALL ON FUNCTION public.guard_expiry_stock_release() FROM PUBLIC;
CREATE TRIGGER inventory_transactions_expiry_guard BEFORE INSERT ON public.inventory_transactions
FOR EACH ROW EXECUTE FUNCTION public.guard_expiry_stock_release();

GRANT SELECT ON public.inspection_cases TO expiry_policy_writer;
CREATE FUNCTION public.guard_inspection_expiry_release() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_case public.inspection_cases%ROWTYPE; v_lot public.lots%ROWTYPE; v_item public.items%ROWTYPE;
BEGIN
  IF NEW.disposition_type NOT IN ('store', 'return_to_stock') THEN RETURN NEW; END IF;
  SELECT * INTO v_case FROM public.inspection_cases WHERE id = NEW.inspection_case_id;
  SELECT * INTO v_lot FROM public.lots WHERE id = v_case.lot_id;
  SELECT * INTO v_item FROM public.items WHERE id = v_lot.item_id FOR SHARE;
  SELECT * INTO v_lot FROM public.lots WHERE id = v_case.lot_id FOR SHARE;
  IF v_lot.id IS NULL OR v_item.id IS NULL OR v_case.item_id IS DISTINCT FROM v_item.id
    OR NOT public.inventory_expiry_eligible('available', v_lot.expiry_date, v_item.expiry_policy, v_item.is_perishable) THEN
    RAISE EXCEPTION 'stock_expiry_blocked' USING ERRCODE = '23514';
  END IF;
  -- This checks whether the proposed quality-release destination may be usable;
  -- it does not perform a quality release, move stock, or authorize dispatch.
  RETURN NEW;
END $$;
ALTER FUNCTION public.guard_inspection_expiry_release() OWNER TO expiry_policy_writer;
REVOKE ALL ON FUNCTION public.guard_inspection_expiry_release() FROM PUBLIC;
CREATE TRIGGER inspection_dispositions_expiry_guard BEFORE INSERT OR UPDATE OF disposition_type ON public.inspection_dispositions
FOR EACH ROW EXECUTE FUNCTION public.guard_inspection_expiry_release();

-- UPDATE-only recovery policy is kept behind a controlled function, rather than
-- widening ordinary pick-list/commitment/balance write policies.
GRANT UPDATE ON public.pick_lists, public.inventory_commitments, public.inventory_commitment_lines,
  public.lot_location_balances, public.inventory_units TO expiry_policy_writer;
GRANT SELECT ON public.inventory_units, public.carton_status_history, public.audit_log TO expiry_policy_writer;
GRANT INSERT ON public.carton_status_history TO expiry_policy_writer;
CREATE FUNCTION public.release_expiry_blocked_pick_list(p_pick_list_id uuid, p_reason text, p_physically_returned boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_pick public.pick_lists%ROWTYPE; v_actor uuid; v_reason text; v_balance record; v_unit record;
BEGIN
  v_actor := auth.uid(); v_reason := btrim(p_reason);
  IF v_actor IS NULL OR NOT rbac_internal.current_user_is_active()
    OR NOT rbac_internal.has_permission('pick_list', 'generate', 'global') THEN
    RAISE EXCEPTION 'expiry_recovery_forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL OR length(v_reason) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'expiry_recovery_reason_required' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_pick FROM public.pick_lists WHERE id = p_pick_list_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'expiry_recovery_not_found' USING ERRCODE = '23514'; END IF;
  IF v_pick.status::text = 'cancelled' AND EXISTS (
    SELECT 1 FROM public.audit_log WHERE entity_type = 'pick_lists' AND entity_id = p_pick_list_id AND action = 'expiry_recovery'
  ) THEN RETURN jsonb_build_object('ok', true, 'alreadyReleased', true); END IF;
  IF v_pick.status::text NOT IN ('allocated', 'picked') THEN
    RAISE EXCEPTION 'expiry_recovery_stale' USING ERRCODE = '23514';
  END IF;
  -- Use deterministic item/lot locks, shared with dispatch and policy edits.
  PERFORM 1 FROM public.items i WHERE i.id IN (
    SELECT pli.item_id FROM public.pick_list_items pli WHERE pli.pick_list_id = p_pick_list_id
  ) ORDER BY i.id FOR SHARE;
  PERFORM 1 FROM public.lots l WHERE l.id IN (
    SELECT pli.lot_id FROM public.pick_list_items pli WHERE pli.pick_list_id = p_pick_list_id
  ) ORDER BY l.id FOR SHARE;
  IF NOT EXISTS (
    SELECT 1 FROM public.pick_list_items pli JOIN public.lots l ON l.id = pli.lot_id
    JOIN public.items i ON i.id = l.item_id
    JOIN public.inventory_commitment_lines cl ON cl.pick_list_item_id = pli.id
    JOIN public.inventory_commitments c ON c.id = cl.commitment_id
    WHERE pli.pick_list_id = p_pick_list_id AND cl.status::text = 'active' AND c.status::text = 'active'
      AND l.expiry_date < public.inventory_business_date() AND i.expiry_policy = 'block_release'
  ) THEN RAISE EXCEPTION 'expiry_recovery_not_blocked' USING ERRCODE = '23514'; END IF;
  IF NOT COALESCE(p_physically_returned, false) AND EXISTS (
    SELECT 1 FROM public.inventory_units u JOIN public.pick_list_items pli ON pli.id = u.pick_list_item_id
    WHERE pli.pick_list_id = p_pick_list_id AND u.status = 'selected'
  ) THEN RAISE EXCEPTION 'expiry_recovery_physical_return_required' USING ERRCODE = '23514'; END IF;
  PERFORM 1 FROM public.inventory_commitments WHERE pick_list_id = p_pick_list_id ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.inventory_commitment_lines cl JOIN public.inventory_commitments c ON c.id = cl.commitment_id
    WHERE c.pick_list_id = p_pick_list_id ORDER BY cl.id FOR UPDATE OF cl;
  FOR v_balance IN
    SELECT b.id, SUM(cl.qty_committed - cl.qty_executed)::integer AS release_qty
    FROM public.inventory_commitment_lines cl JOIN public.inventory_commitments c ON c.id = cl.commitment_id
    JOIN public.lot_location_balances b ON b.id = cl.lot_location_balance_id
    WHERE c.pick_list_id = p_pick_list_id AND c.status::text = 'active' AND cl.status::text = 'active'
    GROUP BY b.id ORDER BY b.id
  LOOP
    UPDATE public.lot_location_balances SET qty_committed = qty_committed - v_balance.release_qty,
      version = version + 1, updated_at = clock_timestamp()
    WHERE id = v_balance.id AND qty_committed >= v_balance.release_qty;
    IF NOT FOUND THEN RAISE EXCEPTION 'expiry_recovery_balance_changed' USING ERRCODE = '40001'; END IF;
  END LOOP;
  FOR v_unit IN
    SELECT u.* FROM public.inventory_units u JOIN public.pick_list_items pli ON pli.id = u.pick_list_item_id
    WHERE pli.pick_list_id = p_pick_list_id AND u.status IN ('reserved', 'selected') ORDER BY u.id FOR UPDATE OF u
  LOOP
    INSERT INTO public.carton_status_history(inventory_unit_id, carton_id, previous_status, new_status, location_id, changed_by_user_id, reason)
    VALUES(v_unit.id, v_unit.carton_id, v_unit.status, 'available', v_unit.location_id, v_actor, left('Expiry recovery: ' || v_reason, 500));
    UPDATE public.inventory_units SET status = 'available', pick_list_item_id = NULL, updated_at = clock_timestamp() WHERE id = v_unit.id;
  END LOOP;
  UPDATE public.inventory_commitment_lines cl SET status = 'released', updated_at = clock_timestamp()
    FROM public.inventory_commitments c WHERE c.id = cl.commitment_id AND c.pick_list_id = p_pick_list_id
      AND c.status::text = 'active' AND cl.status::text = 'active';
  UPDATE public.inventory_commitments SET status = 'released', released_at = clock_timestamp(), updated_at = clock_timestamp()
    WHERE pick_list_id = p_pick_list_id AND status::text = 'active';
  UPDATE public.pick_lists SET status = 'cancelled', updated_at = clock_timestamp() WHERE id = p_pick_list_id;
  INSERT INTO public.audit_log(actor_user_id, actor_role, action, entity_type, entity_id, before_data, after_data, correlation_id)
  VALUES(v_actor, 'expiry_recovery_operator', 'expiry_recovery', 'pick_lists', p_pick_list_id,
    jsonb_build_object('status', v_pick.status), jsonb_build_object('status', 'cancelled', 'reason', v_reason,
      'physicallyReturned', COALESCE(p_physically_returned, false)), gen_random_uuid()::text);
  RETURN jsonb_build_object('ok', true);
END $$;
ALTER FUNCTION public.release_expiry_blocked_pick_list(uuid, text, boolean) OWNER TO expiry_policy_writer;
REVOKE ALL ON FUNCTION public.release_expiry_blocked_pick_list(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_expiry_blocked_pick_list(uuid, text, boolean) TO authenticated;

-- Same column order/types as the existing views; append expiry facts only.
CREATE OR REPLACE VIEW public.lot_inventory_totals WITH (security_invoker = true) AS
SELECT b.lot_id, SUM(b.qty_received) AS qty_received, SUM(b.qty_remaining) AS qty_remaining,
  SUM(b.qty_committed) AS qty_committed,
  CASE WHEN public.inventory_lot_expiry_eligible(b.lot_id)
    THEN SUM(b.qty_remaining - b.qty_committed) ELSE 0 END AS qty_available,
  CASE WHEN l.status::text = 'available' AND i.expiry_policy = 'allow_with_acknowledgement'
    AND l.expiry_date < public.inventory_business_date()
    THEN SUM(b.qty_remaining - b.qty_committed) ELSE 0 END AS qty_expiry_ack_required
FROM public.lot_location_balances b JOIN public.lots l ON l.id = b.lot_id
JOIN public.items i ON i.id = l.item_id
GROUP BY b.lot_id, l.status, i.expiry_policy, l.expiry_date;

CREATE OR REPLACE VIEW public.master_inventory_tracking AS
SELECT llb.id AS lot_location_balance_id, l.id AS lot_id, l.lot_number, l.flow_type,
  l.status AS lot_status, l.owner_party_id, l.expiry_date, l.manufacture_date, l.created_at AS lot_created_at,
  i.id AS item_id, i.code AS item_code, i.name AS item_name, i.supplier_item_code, i.dsgc_item_number,
  CASE l.flow_type WHEN 'vmi' THEN COALESCE(i.supplier_item_code, i.code) ELSE COALESCE(i.dsgc_item_number, i.code) END AS displayed_item_code,
  CASE l.flow_type WHEN 'vmi' THEN i.supplier_item_code IS NULL ELSE i.dsgc_item_number IS NULL END AS item_code_is_provisional,
  ic.id AS category_id, ic.name AS category_name, loc.id AS location_id, loc.label AS location_label,
  loc.location_type, llb.qty_received, llb.qty_remaining, llb.qty_committed,
  CASE WHEN public.inventory_expiry_eligible(l.status::text, l.expiry_date, i.expiry_policy, i.is_perishable)
    THEN llb.qty_remaining - llb.qty_committed ELSE 0 END AS qty_available,
  ROW_NUMBER() OVER (PARTITION BY l.item_id, l.flow_type ORDER BY l.expiry_date ASC NULLS LAST, l.created_at ASC) AS fefo_fifo_rank,
  i.expiry_policy, i.expiry_policy_version,
  COALESCE(l.expiry_date < public.inventory_business_date(), false) AS past_expiry,
  COALESCE((public.inventory_expiry_eligible(l.status::text, l.expiry_date, i.expiry_policy, i.is_perishable)
    AND l.expiry_date < public.inventory_business_date()), false) AS requires_expiry_acknowledgement,
  CASE WHEN l.status::text = 'available' AND i.expiry_policy = 'block_release' AND l.expiry_date < public.inventory_business_date()
    THEN llb.qty_remaining - llb.qty_committed ELSE 0 END AS qty_expiry_blocked,
  CASE WHEN l.status::text <> 'available' OR (i.is_perishable AND l.expiry_date IS NULL)
    THEN llb.qty_remaining - llb.qty_committed ELSE 0 END AS qty_quality_unavailable,
  CASE WHEN public.inventory_expiry_eligible(l.status::text, l.expiry_date, i.expiry_policy, i.is_perishable)
    AND l.expiry_date < public.inventory_business_date()
    THEN llb.qty_remaining - llb.qty_committed ELSE 0 END AS qty_expiry_ack_required
FROM public.lot_location_balances llb JOIN public.lots l ON l.id = llb.lot_id
JOIN public.items i ON i.id = l.item_id LEFT JOIN public.item_categories ic ON ic.id = i.category_id
JOIN public.locations loc ON loc.id = llb.location_id;

-- Advisory only: one recipient/event regardless of cron retries. The event key
-- includes date/policy revision, preserving later policy changes as new facts.
CREATE UNIQUE INDEX notifications_stock_expiry_event_unique
  ON public.notifications(recipient_user_id, source_id, source_type) WHERE category = 'stock_expiry';
GRANT SELECT ON public.user_profiles, public.user_roles, public.roles,
  public.role_permissions, public.permissions TO expiry_policy_writer;
GRANT INSERT ON public.notifications TO expiry_policy_writer;
CREATE FUNCTION public.emit_stock_expiry_alerts() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_count integer;
BEGIN
  INSERT INTO public.notifications(recipient_user_id, category, title, body, source_type, source_id, flow_type)
  SELECT DISTINCT up.id, 'stock_expiry', 'Past expiry: ' || i.code,
    'Lot ' || l.lot_number || ' expired ' || l.expiry_date::text || '. '
      || CASE i.expiry_policy WHEN 'block_release' THEN 'Release is blocked. Review replacement stock or Inspection.'
           ELSE 'Release requires acknowledgement and a reason.' END
      || ' Open commitments: ' || (SELECT COUNT(DISTINCT c.id)::text FROM public.inventory_commitments c
          JOIN public.inventory_commitment_lines cl ON cl.commitment_id = c.id
          JOIN public.lot_location_balances b ON b.id = cl.lot_location_balance_id
          WHERE b.lot_id = l.id AND c.status::text = 'active' AND cl.status::text = 'active'),
    'lot_expiry:' || l.expiry_date::text || ':v' || i.expiry_policy_version::text, l.id, l.flow_type
  FROM public.lots l JOIN public.items i ON i.id = l.item_id
  CROSS JOIN public.user_profiles up
  WHERE l.expiry_date < public.inventory_business_date() AND up.status::text = 'active'
    AND EXISTS (SELECT 1 FROM public.lot_location_balances b WHERE b.lot_id = l.id AND b.qty_remaining > 0)
    AND EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
      JOIN public.role_permissions rp ON rp.role_id = r.id JOIN public.permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = up.id AND ur.revoked_at IS NULL AND ur.valid_from <= clock_timestamp()
        AND (ur.valid_until IS NULL OR ur.valid_until > clock_timestamp()) AND r.is_active
        AND rp.scope_kind::text = 'global' AND p.resource = 'inventory' AND p.action = 'read')
    AND EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
      JOIN public.role_permissions rp ON rp.role_id = r.id JOIN public.permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = up.id AND ur.revoked_at IS NULL AND ur.valid_from <= clock_timestamp()
        AND (ur.valid_until IS NULL OR ur.valid_until > clock_timestamp()) AND r.is_active
        AND rp.scope_kind::text = 'global' AND p.resource = 'inspection' AND p.action = 'resolve')
  ON CONFLICT (recipient_user_id, source_id, source_type) WHERE category = 'stock_expiry' DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
ALTER FUNCTION public.emit_stock_expiry_alerts() OWNER TO expiry_policy_writer;
REVOKE ALL ON FUNCTION public.emit_stock_expiry_alerts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.emit_stock_expiry_alerts() TO service_role;
DO $$ BEGIN
  PERFORM cron.schedule('material-expiry-attention-daily', '5 16 * * *', $cron$SELECT public.emit_stock_expiry_alerts();$cron$);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron scheduling unavailable (%); material expiry guards remain enforced.', SQLERRM;
END $$;

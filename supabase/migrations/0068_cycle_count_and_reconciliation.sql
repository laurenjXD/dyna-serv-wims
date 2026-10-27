-- Physical stock count and approved reconciliation. This is not opening-stock
-- migration and does not replace WRR Receiving.
CREATE TABLE public.cycle_count_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  count_number varchar(50) NOT NULL UNIQUE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  status varchar(20) NOT NULL DEFAULT 'counting' CHECK (status IN ('counting', 'submitted', 'approved', 'rejected', 'posted', 'cancelled')),
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  submitted_by_user_id uuid REFERENCES auth.users(id),
  approved_by_user_id uuid REFERENCES auth.users(id),
  posted_by_user_id uuid REFERENCES auth.users(id),
  rejection_reason text,
  version integer NOT NULL DEFAULT 1,
  idempotency_key varchar(120) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cycle_count_sessions_location_status_idx ON public.cycle_count_sessions(location_id, status);

CREATE TABLE public.cycle_count_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.cycle_count_sessions(id) ON DELETE CASCADE,
  balance_id uuid NOT NULL REFERENCES public.lot_location_balances(id) ON DELETE RESTRICT,
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
  lot_id uuid NOT NULL REFERENCES public.lots(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  system_qty integer NOT NULL CHECK (system_qty >= 0),
  counted_qty integer CHECK (counted_qty >= 0),
  variance integer,
  balance_version integer NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'uncounted' CHECK (status IN ('uncounted', 'counted', 'recount_required', 'blocked', 'posted')),
  counted_by_user_id uuid REFERENCES auth.users(id),
  counted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cycle_count_lines_session_balance_unique UNIQUE(session_id, balance_id)
);

CREATE INDEX cycle_count_lines_session_status_idx ON public.cycle_count_lines(session_id, status);

CREATE TABLE public.cycle_count_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.cycle_count_sessions(id) ON DELETE CASCADE,
  line_id uuid REFERENCES public.cycle_count_lines(id) ON DELETE CASCADE,
  event_type varchar(30) NOT NULL,
  raw_value text,
  counted_qty integer,
  note text,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cycle_count_events_session_created_idx ON public.cycle_count_events(session_id, created_at);

ALTER TABLE public.inventory_transactions ADD COLUMN cycle_count_session_id uuid REFERENCES public.cycle_count_sessions(id);

INSERT INTO public.permissions(resource, action, description) VALUES
  ('cycle_count', 'view', 'View physical stock count sessions and variances.'),
  ('cycle_count', 'create', 'Create a physical stock count session.'),
  ('cycle_count', 'count', 'Record physical stock counts.'),
  ('cycle_count', 'review', 'Review and approve physical stock variances.'),
  ('cycle_count', 'post', 'Post approved inventory reconciliation adjustments.')
ON CONFLICT (resource, action) DO NOTHING;

INSERT INTO public.role_permissions(role_id, permission_id, scope_kind)
SELECT r.id, p.id, 'global'::public.scope_kind
FROM public.roles r
JOIN public.permissions p ON p.resource = 'cycle_count'
WHERE r.key IN ('warehouse_staff', 'supervisor', 'administrator')
  AND ((p.action IN ('view', 'create', 'count') AND r.key IN ('warehouse_staff', 'supervisor', 'administrator'))
    OR (p.action IN ('review', 'post') AND r.key IN ('supervisor', 'administrator')))
ON CONFLICT DO NOTHING;

ALTER TABLE public.cycle_count_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cycle_count_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cycle_count_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY cycle_count_sessions_select ON public.cycle_count_sessions FOR SELECT TO authenticated
  USING (rbac_internal.has_permission('cycle_count', 'view', 'global'));
CREATE POLICY cycle_count_sessions_insert ON public.cycle_count_sessions FOR INSERT TO authenticated
  WITH CHECK (rbac_internal.has_permission('cycle_count', 'create', 'global'));
CREATE POLICY cycle_count_sessions_update ON public.cycle_count_sessions FOR UPDATE TO authenticated
  USING (rbac_internal.has_permission('cycle_count', 'count', 'global') OR rbac_internal.has_permission('cycle_count', 'review', 'global') OR rbac_internal.has_permission('cycle_count', 'post', 'global'))
  WITH CHECK (rbac_internal.has_permission('cycle_count', 'count', 'global') OR rbac_internal.has_permission('cycle_count', 'review', 'global') OR rbac_internal.has_permission('cycle_count', 'post', 'global'));
CREATE POLICY cycle_count_lines_select ON public.cycle_count_lines FOR SELECT TO authenticated
  USING (rbac_internal.has_permission('cycle_count', 'view', 'global'));
CREATE POLICY cycle_count_lines_insert ON public.cycle_count_lines FOR INSERT TO authenticated
  WITH CHECK (rbac_internal.has_permission('cycle_count', 'create', 'global'));
CREATE POLICY cycle_count_lines_update ON public.cycle_count_lines FOR UPDATE TO authenticated
  USING (rbac_internal.has_permission('cycle_count', 'count', 'global') OR rbac_internal.has_permission('cycle_count', 'review', 'global') OR rbac_internal.has_permission('cycle_count', 'post', 'global'));
CREATE POLICY cycle_count_events_select ON public.cycle_count_events FOR SELECT TO authenticated
  USING (rbac_internal.has_permission('cycle_count', 'view', 'global'));
CREATE POLICY cycle_count_events_insert ON public.cycle_count_events FOR INSERT TO authenticated
  WITH CHECK (rbac_internal.has_permission('cycle_count', 'count', 'global') OR rbac_internal.has_permission('cycle_count', 'review', 'global'));

GRANT SELECT, INSERT, UPDATE ON public.cycle_count_sessions, public.cycle_count_lines, public.cycle_count_events TO authenticated;

CREATE POLICY lot_location_balances_cycle_count_update ON public.lot_location_balances FOR UPDATE TO authenticated
  USING (rbac_internal.has_permission('cycle_count', 'post', 'global'))
  WITH CHECK (rbac_internal.has_permission('cycle_count', 'post', 'global'));

CREATE POLICY inventory_transactions_cycle_count_insert ON public.inventory_transactions FOR INSERT TO authenticated
  WITH CHECK (rbac_internal.has_permission('cycle_count', 'post', 'global'));

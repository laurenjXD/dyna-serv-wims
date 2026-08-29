-- Carton-level traceability foundation — specs/23-carton-level-traceability.
-- Adds identity/history only; existing inventory quantity and reservation
-- authorities remain unchanged.

ALTER TABLE public.inventory_units
  ADD COLUMN IF NOT EXISTS carton_id varchar(80);

-- Legacy rows did not have a printed carton identifier. Their internal UUID is
-- stable and globally unique, so it is safe as a deterministic relabelling key.
UPDATE public.inventory_units
SET carton_id = 'DSGC-CTN-LEGACY-' || replace(unit_id::text, '-', '')
WHERE carton_id IS NULL;

ALTER TABLE public.inventory_units
  ALTER COLUMN carton_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_units_carton_id_unique
  ON public.inventory_units(carton_id);

CREATE TABLE IF NOT EXISTS public.carton_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_unit_id uuid NOT NULL REFERENCES public.inventory_units(id) ON DELETE RESTRICT,
  carton_id varchar(80) NOT NULL,
  previous_status varchar(30),
  new_status varchar(30) NOT NULL,
  previous_quantity integer CHECK (previous_quantity IS NULL OR previous_quantity >= 0),
  new_quantity integer CHECK (new_quantity IS NULL OR new_quantity >= 0),
  location_id uuid REFERENCES public.locations(id) ON DELETE RESTRICT,
  source_transaction_id uuid,
  changed_by_user_id uuid NOT NULL,
  reason varchar(500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS carton_status_history_carton_timeline_idx
  ON public.carton_status_history(carton_id, created_at);
CREATE INDEX IF NOT EXISTS carton_status_history_unit_timeline_idx
  ON public.carton_status_history(inventory_unit_id, created_at);

ALTER TABLE public.carton_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carton_status_history FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS carton_status_history_select ON public.carton_status_history;
CREATE POLICY carton_status_history_select ON public.carton_status_history
  FOR SELECT TO authenticated
  USING (
    rbac_internal.has_permission('inventory', 'read', 'global')
    OR rbac_internal.has_permission('pick_list', 'execute', 'global')
    OR rbac_internal.has_permission('dispatch', 'execute', 'global')
  );

DROP POLICY IF EXISTS carton_status_history_insert ON public.carton_status_history;
CREATE POLICY carton_status_history_insert ON public.carton_status_history
  FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('receiving', 'confirm', 'global')
    OR rbac_internal.has_permission('pick_list', 'execute', 'global')
    OR rbac_internal.has_permission('dispatch', 'execute', 'global')
  );

GRANT SELECT, INSERT ON public.carton_status_history TO authenticated;

-- Durable physical-box identity for exact picking, plus an idempotent repair
-- for deployed databases whose location mutation policies were not applied.

DROP POLICY IF EXISTS locations_insert ON public.locations;
CREATE POLICY locations_insert ON public.locations
  FOR INSERT TO authenticated
  WITH CHECK (rbac_internal.has_permission('locations', 'manage', 'global'));

DROP POLICY IF EXISTS locations_update ON public.locations;
CREATE POLICY locations_update ON public.locations
  FOR UPDATE TO authenticated
  USING (rbac_internal.has_permission('locations', 'manage', 'global'))
  WITH CHECK (rbac_internal.has_permission('locations', 'manage', 'global'));

GRANT INSERT, UPDATE ON public.locations TO authenticated;

CREATE TABLE public.inventory_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL UNIQUE,
  unit_index integer NOT NULL CHECK (unit_index > 0),
  wrr_item_id uuid NOT NULL REFERENCES public.wrr_items(id) ON DELETE RESTRICT,
  lot_id uuid NOT NULL REFERENCES public.lots(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  status varchar(20) NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'selected', 'dispatched', 'quarantined')),
  pick_list_item_id uuid REFERENCES public.pick_list_items(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_units_wrr_item_index_unique UNIQUE (wrr_item_id, unit_index),
  CONSTRAINT inventory_units_selection_shape CHECK (
    (status IN ('available', 'quarantined') AND pick_list_item_id IS NULL)
    OR (status IN ('selected', 'dispatched') AND pick_list_item_id IS NOT NULL)
  )
);

CREATE INDEX inventory_units_source_idx
  ON public.inventory_units(lot_id, location_id, status);
CREATE INDEX inventory_units_pick_list_item_idx
  ON public.inventory_units(pick_list_item_id);

ALTER TABLE public.inventory_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_units FORCE ROW LEVEL SECURITY;

CREATE POLICY inventory_units_select ON public.inventory_units
  FOR SELECT TO authenticated
  USING (
    rbac_internal.has_permission('inventory', 'read', 'global')
    OR rbac_internal.has_permission('pick_list', 'execute', 'global')
    OR rbac_internal.has_permission('dispatch', 'execute', 'global')
  );

CREATE POLICY inventory_units_insert ON public.inventory_units
  FOR INSERT TO authenticated
  WITH CHECK (rbac_internal.has_permission('receiving', 'confirm', 'global'));

CREATE POLICY inventory_units_update ON public.inventory_units
  FOR UPDATE TO authenticated
  USING (
    rbac_internal.has_permission('pick_list', 'execute', 'global')
    OR rbac_internal.has_permission('dispatch', 'execute', 'global')
  )
  WITH CHECK (
    rbac_internal.has_permission('pick_list', 'execute', 'global')
    OR rbac_internal.has_permission('dispatch', 'execute', 'global')
  );

GRANT SELECT, INSERT, UPDATE ON public.inventory_units TO authenticated;

-- Existing aggregate stock did not retain printed carton IDs. Backfill stable
-- system IDs so it is visible to the exact-pick workflow; those legacy boxes
-- should be relabelled before their first exact pick.
WITH expanded AS (
  SELECT
    l.wrr_item_id,
    llb.lot_id,
    llb.location_id,
    row_number() OVER (
      PARTITION BY l.wrr_item_id
      ORDER BY llb.location_id, generated.unit_offset
    )::integer AS unit_index
  FROM public.lot_location_balances llb
  JOIN public.lots l ON l.id = llb.lot_id
  CROSS JOIN LATERAL generate_series(1, llb.qty_remaining) AS generated(unit_offset)
), identified AS (
  SELECT
    expanded.*,
    replace(expanded.wrr_item_id::text, '-', '') AS source_hex,
    lpad(to_hex(expanded.unit_index), 8, '0') AS index_hex
  FROM expanded
)
INSERT INTO public.inventory_units (
  unit_id, unit_index, wrr_item_id, lot_id, location_id, status
)
SELECT
  (
    substr(source_hex || index_hex, 1, 8) || '-' ||
    substr(source_hex || index_hex, 9, 4) || '-' ||
    substr(source_hex || index_hex, 13, 4) || '-' ||
    substr(source_hex || index_hex, 17, 4) || '-' ||
    substr(source_hex || index_hex, 21, 12)
  )::uuid,
  unit_index,
  wrr_item_id,
  lot_id,
  location_id,
  CASE WHEN EXISTS (
    SELECT 1 FROM public.lots existing_lot
    WHERE existing_lot.id = identified.lot_id AND existing_lot.status = 'quarantined'
  ) THEN 'quarantined' ELSE 'available' END
FROM identified
ON CONFLICT DO NOTHING;

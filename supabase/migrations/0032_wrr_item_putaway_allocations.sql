-- Batch putaway allocation plan (specs/01 and 07, 2026-08-20).
-- This is staging data only. Inventory is created exclusively by the final
-- receipt transaction after quantity, location and capacity revalidation.
CREATE TABLE public.wrr_item_putaway_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wrr_item_id uuid NOT NULL REFERENCES public.wrr_items(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  qty integer NOT NULL CHECK (qty > 0),
  created_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wrr_item_putaway_allocations_line_location_unique UNIQUE (wrr_item_id, location_id)
);

CREATE INDEX wrr_item_putaway_allocations_wrr_item_id_idx
  ON public.wrr_item_putaway_allocations(wrr_item_id);

ALTER TABLE public.wrr_item_putaway_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY wrr_item_putaway_allocations_select
  ON public.wrr_item_putaway_allocations FOR SELECT TO authenticated
  USING (rbac_internal.has_permission('receiving', 'view', 'global'));

CREATE POLICY wrr_item_putaway_allocations_insert
  ON public.wrr_item_putaway_allocations FOR INSERT TO authenticated
  WITH CHECK (rbac_internal.has_permission('receiving', 'confirm', 'global'));

GRANT SELECT, INSERT ON public.wrr_item_putaway_allocations TO authenticated;

-- Migration-origin carton identities for deferred carton traceability.
-- Approved by specs/24-data-migration-and-seeding/amendment-carton-traceability.md.

ALTER TABLE public.inventory_units
  ALTER COLUMN wrr_item_id DROP NOT NULL;
--> statement-breakpoint

ALTER TABLE public.inventory_units
  ADD COLUMN IF NOT EXISTS migration_batch_id uuid REFERENCES public.migration_batches(id) ON DELETE RESTRICT;
--> statement-breakpoint

ALTER TABLE public.inventory_units
  ADD CONSTRAINT inventory_units_origin_shape CHECK (
    (wrr_item_id IS NOT NULL AND migration_batch_id IS NULL)
    OR (wrr_item_id IS NULL AND migration_batch_id IS NOT NULL)
  );
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS inventory_units_migration_batch_idx
  ON public.inventory_units(migration_batch_id, lot_id);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS inventory_units_migration_index_unique
  ON public.inventory_units(migration_batch_id, lot_id, unit_index)
  WHERE migration_batch_id IS NOT NULL;
--> statement-breakpoint

DROP POLICY IF EXISTS inventory_units_insert ON public.inventory_units;
CREATE POLICY inventory_units_insert ON public.inventory_units
  FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('receiving', 'confirm', 'global')
    OR rbac_internal.has_permission('parties', 'manage', 'global')
  );
--> statement-breakpoint

ALTER TABLE public.lots
  ADD COLUMN IF NOT EXISTS carton_trace_status varchar(20) NOT NULL DEFAULT 'pending';
--> statement-breakpoint

ALTER TABLE public.lots
  ADD CONSTRAINT lots_carton_trace_status_check
  CHECK (carton_trace_status IN ('pending', 'active'));
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS lots_carton_trace_status_idx
  ON public.lots(carton_trace_status);

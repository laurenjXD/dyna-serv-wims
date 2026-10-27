-- The Product Owner clarified that FS1/FS2 are not physical warehouse
-- locations. Remove only unreferenced legacy rows; rows with operational
-- history remain recoverable and are not silently deleted.

BEGIN;

CREATE TEMP TABLE _fs_location_refs ON COMMIT DROP AS
  SELECT location_id AS id FROM public.lot_location_balances
  UNION SELECT location_id FROM public.inventory_units WHERE location_id IS NOT NULL
  UNION SELECT location_id FROM public.carton_status_history WHERE location_id IS NOT NULL
  UNION SELECT location_id FROM public.pick_list_items
  UNION SELECT from_location_id FROM public.inventory_transactions WHERE from_location_id IS NOT NULL
  UNION SELECT to_location_id FROM public.inventory_transactions WHERE to_location_id IS NOT NULL
  UNION SELECT from_location_id FROM public.transfer_requests WHERE from_location_id IS NOT NULL
  UNION SELECT to_location_id FROM public.transfer_requests WHERE to_location_id IS NOT NULL
  UNION SELECT location_id FROM public.wrr_item_putaway_allocations
  UNION SELECT putaway_location_id FROM public.wrr_items WHERE putaway_location_id IS NOT NULL;

DELETE FROM public.locations l
WHERE (
    l.label ~* '^FS[12]-[0-9]+$'
    OR upper(trim(l.rack)) IN ('FS1', 'FS2')
  )
  AND NOT EXISTS (SELECT 1 FROM _fs_location_refs r WHERE r.id = l.id);

COMMIT;

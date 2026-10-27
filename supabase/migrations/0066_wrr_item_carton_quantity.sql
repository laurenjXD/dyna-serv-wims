-- WRR quantity-grain correction.
--
-- Existing deployments stored physical cartons in expected_qty. Preserve that
-- history as carton_qty, then convert expected_qty to base units using the
-- enrolled item's SPQ. Unresolved legacy lines use SPQ 1 until enrollment;
-- they remain readable and cannot be committed until the server validates the
-- item/SPQ relationship.

ALTER TABLE public.wrr_items
  ADD COLUMN IF NOT EXISTS carton_qty integer;

UPDATE public.wrr_items wi
SET carton_qty = wi.expected_qty
WHERE wi.carton_qty IS NULL;

UPDATE public.wrr_items wi
SET expected_qty = wi.carton_qty * COALESCE(i.spq, 1)
FROM public.items i
WHERE i.id = wi.item_id;

ALTER TABLE public.wrr_items
  ALTER COLUMN carton_qty SET NOT NULL;

ALTER TABLE public.wrr_items
  ADD CONSTRAINT wrr_items_carton_qty_positive CHECK (carton_qty > 0),
  ADD CONSTRAINT wrr_items_expected_qty_positive CHECK (expected_qty > 0),
  ADD CONSTRAINT wrr_items_scanned_carton_qty_nonnegative CHECK (scanned_qty >= 0);

COMMENT ON COLUMN public.wrr_items.carton_qty IS
  'Explicit physical carton count declared by the CIPL/WRR; one carton QR is generated per carton.';
COMMENT ON COLUMN public.wrr_items.expected_qty IS
  'Expected total base units, server-validated as carton_qty multiplied by the enrolled item SPQ.';
COMMENT ON COLUMN public.wrr_items.scanned_qty IS
  'Accepted physical carton scan count; compared with carton_qty.';

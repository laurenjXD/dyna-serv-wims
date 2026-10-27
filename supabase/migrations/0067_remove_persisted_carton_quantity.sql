-- Carton QR count is derived from the WRR total units and the enrolled item's SPQ.
-- 0066 preserved and converted legacy data; this follow-up removes the redundant
-- persisted carton count so new WRRs have one authoritative quantity grain.

ALTER TABLE public.wrr_items
  DROP CONSTRAINT IF EXISTS wrr_items_carton_qty_positive;

ALTER TABLE public.wrr_items
  DROP COLUMN IF EXISTS carton_qty;

COMMENT ON COLUMN public.wrr_items.expected_qty IS
  'Expected total base units; complete carton QR count is derived as expected_qty divided by the enrolled item SPQ.';

COMMENT ON COLUMN public.wrr_items.scanned_qty IS
  'Accepted physical carton scan count; compared with the derived complete-carton count.';

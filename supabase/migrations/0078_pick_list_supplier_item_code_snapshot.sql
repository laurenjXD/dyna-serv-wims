-- The existing pick_list_items.item_code is the immutable rendered Item Code.
-- Backfill historical documents from the current supplier cross-reference;
-- new commitments write the supplier value directly.
UPDATE public.pick_list_items pli
SET item_code = i.supplier_item_code
FROM public.items i
WHERE i.id = pli.item_id
  AND NULLIF(BTRIM(i.supplier_item_code), '') IS NOT NULL
  AND pli.item_code IS DISTINCT FROM i.supplier_item_code;

COMMENT ON COLUMN public.pick_list_items.item_code IS
  'Immutable supplier item-code snapshot rendered as Item Code on pick-list and receipt documents.';

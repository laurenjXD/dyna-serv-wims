-- Product Owner revision plan (2026-11-10): preserve CIPL mapping evidence
-- and allow a received lot to retain its shipment packaging without mutating
-- the shared Material master SPQ.

ALTER TABLE public.wrr_documents
  ADD COLUMN IF NOT EXISTS cipl_mapping_snapshot jsonb;

COMMENT ON COLUMN public.wrr_documents.cipl_mapping_snapshot IS
  'Versioned CIPL source-to-canonical mapping evidence; not inventory authority.';

ALTER TABLE public.wrr_items
  ADD COLUMN IF NOT EXISTS spq_snapshot integer;

UPDATE public.wrr_items wi
SET spq_snapshot = i.spq
FROM public.items i
WHERE wi.item_id = i.id
  AND wi.spq_snapshot IS NULL;

ALTER TABLE public.wrr_items
  DROP CONSTRAINT IF EXISTS wrr_items_spq_snapshot_positive;

ALTER TABLE public.wrr_items
  ADD CONSTRAINT wrr_items_spq_snapshot_positive
  CHECK (spq_snapshot IS NULL OR spq_snapshot > 0);

COMMENT ON COLUMN public.wrr_items.spq_snapshot IS
  'Effective shipment SPQ used for carton derivation. Null only while the item is unresolved for enrollment.';

ALTER TABLE public.lots
  ADD COLUMN IF NOT EXISTS spq_snapshot integer;

UPDATE public.lots l
SET spq_snapshot = i.spq
FROM public.items i
WHERE l.item_id = i.id
  AND l.spq_snapshot IS NULL;

ALTER TABLE public.lots
  ALTER COLUMN spq_snapshot SET NOT NULL;

ALTER TABLE public.lots
  DROP CONSTRAINT IF EXISTS lots_spq_snapshot_positive;

ALTER TABLE public.lots
  ADD CONSTRAINT lots_spq_snapshot_positive CHECK (spq_snapshot > 0);

COMMENT ON COLUMN public.lots.spq_snapshot IS
  'Effective carton SPQ copied from the committed WRR line; never recomputed from items.spq.';

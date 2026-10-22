-- Outbound recipient identity amendment (2026-10-22).
-- customer_party_id remains the VMI/commercial relationship; this field is
-- the immutable physical recipient shown on pick/dispatch documents.
ALTER TABLE public.pick_lists
  ADD COLUMN IF NOT EXISTS end_customer_party_id uuid;

UPDATE public.pick_lists
SET end_customer_party_id = customer_party_id
WHERE end_customer_party_id IS NULL;

ALTER TABLE public.pick_lists
  ALTER COLUMN end_customer_party_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pick_lists_end_customer_party_id_parties_id_fk'
  ) THEN
    ALTER TABLE public.pick_lists
      ADD CONSTRAINT pick_lists_end_customer_party_id_parties_id_fk
      FOREIGN KEY (end_customer_party_id) REFERENCES public.parties(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS pick_lists_end_customer_party_id_idx
  ON public.pick_lists (end_customer_party_id);

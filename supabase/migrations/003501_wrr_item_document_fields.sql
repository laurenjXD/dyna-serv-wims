-- WRR document-field ownership amendment (2026-08-24).
-- Staged WRR lines retain the supplier-declared manufacture date and
-- non-quantity receiving remarks. The receipt command copies manufacture_date
-- to the created lot; it must never derive stock quantity from remarks.

ALTER TABLE public.wrr_items
  ADD COLUMN IF NOT EXISTS manufacture_date date,
  ADD COLUMN IF NOT EXISTS remarks text;

-- Parties schema amendment: split address into address_1/address_2; add payment_terms.
--
-- Traceability:
--   specs/01-core-data-model/design.md parties table (address_1/address_2/payment_terms)
--   specs/00-steering/revision-log.md 2026-08-08 — parties.address split entry
--
-- Background: the product owner's vendor/customer intake sheet has two address lines
-- and a payment_terms field. The original schema had a single text `address` column
-- and no payment_terms. This migration applies the approved amendment:
--   - RENAME address → address_1 (preserves existing data, no back-fill needed)
--   - ADD address_2 text (nullable — second address line, optional)
--   - ADD payment_terms varchar(100) (nullable — free text, not an enum, per revision-log.md)

ALTER TABLE public.parties
  RENAME COLUMN address TO address_1;
--> statement-breakpoint

ALTER TABLE public.parties
  ADD COLUMN IF NOT EXISTS address_2 text,
  ADD COLUMN IF NOT EXISTS payment_terms varchar(100);

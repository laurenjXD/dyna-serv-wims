-- Preserve the supplier-declared expiry date during WRR staging so the
-- perishable receiving invariant can be enforced before lot creation.
ALTER TABLE public.wrr_items
  ADD COLUMN IF NOT EXISTS expiry_date date;

COMMENT ON COLUMN public.wrr_items.expiry_date IS
  'Supplier-declared expiry date; required for perishable catalog items and copied to lots on receipt.';

-- Per-line putaway selection for incoming receiving.
--
-- Product-owner decision 2026-08-09: a store-disposition WRR line records
-- its designated storage location before receiving starts. The authoritative
-- confirmation transaction validates that location and creates the matching
-- lot balance + receiving ledger entry. Inspection-disposition lines leave
-- this nullable and resolve the active inspection location at commit time.

ALTER TABLE public.wrr_items
  ADD COLUMN putaway_location_id uuid
  REFERENCES public.locations(id) ON DELETE RESTRICT;
--> statement-breakpoint

CREATE INDEX wrr_items_putaway_location_id_idx
  ON public.wrr_items (putaway_location_id);

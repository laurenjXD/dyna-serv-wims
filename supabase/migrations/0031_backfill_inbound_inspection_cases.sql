-- Create the shared inspection tasks missing from inspect-disposition
-- receipts committed before the receiving handoff wrote inspection_cases.
--
-- The receipt's quarantined lot is already the authoritative evidence that
-- this line was held for inspection. This migration creates exactly one open
-- inbound case per WRR line when none exists, making those held lots visible
-- in Master Inventory → Inspection without changing any inventory balances.
--
-- Traceability:
--   specs/07-incoming-receiving/design.md §7.3 / §9
--   specs/11-transfer-and-inspection/design.md §6.1

INSERT INTO public.inspection_cases (
  context_type,
  source_ref_type,
  source_ref_id,
  lot_id,
  item_id,
  party_id,
  flow_type,
  status,
  opened_by
)
SELECT
  'inbound',
  'wrr_item',
  wi.id,
  l.id,
  wi.item_id,
  wd.vendor_party_id,
  wd.flow_type,
  'open',
  COALESCE(wd.confirmed_by_user_id, wd.staged_by_user_id)
FROM public.wrr_items wi
JOIN public.wrr_documents wd ON wd.id = wi.wrr_id
JOIN public.lots l ON l.wrr_item_id = wi.id
WHERE wi.disposition = 'inspect'
  AND wi.item_id IS NOT NULL
  AND l.status = 'quarantined'
  AND NOT EXISTS (
    SELECT 1
    FROM public.inspection_cases ic
    WHERE ic.context_type = 'inbound'
      AND ic.source_ref_type = 'wrr_item'
      AND ic.source_ref_id = wi.id
  );

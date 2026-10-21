-- Normalize the legacy/imported A-E location rows to the PDF-aligned rack
-- geometry. This is a data migration, not a second location registry:
--   Rack A: 30 levels x 4 positions = 120
--   Racks B-E: 12 levels x 4 positions = 48 each
--
-- Existing rows with stock or operational history are kept by ID and renamed
-- in place. Duplicate/incorrect rows are removed only when they have no
-- references. The current max CBM value is preserved for existing rows and
-- used for new empty slots because the PDF supplies pallet positions, not CBM.

BEGIN;

CREATE TEMP TABLE _pdf_ae_refs ON COMMIT DROP AS
  SELECT location_id AS id FROM public.lot_location_balances
  UNION SELECT location_id FROM public.inventory_units WHERE location_id IS NOT NULL
  UNION SELECT location_id FROM public.carton_status_history WHERE location_id IS NOT NULL
  UNION SELECT location_id FROM public.pick_list_items
  UNION SELECT from_location_id FROM public.inventory_transactions WHERE from_location_id IS NOT NULL
  UNION SELECT to_location_id FROM public.inventory_transactions WHERE to_location_id IS NOT NULL
  UNION SELECT from_location_id FROM public.transfer_requests
  UNION SELECT to_location_id FROM public.transfer_requests
  UNION SELECT location_id FROM public.wrr_item_putaway_allocations
  UNION SELECT putaway_location_id FROM public.wrr_items WHERE putaway_location_id IS NOT NULL;

CREATE TEMP TABLE _pdf_ae_capacity ON COMMIT DROP AS
  SELECT coalesce(max(max_cbm_capacity), 9999.9999::numeric) AS max_cbm_capacity
  FROM public.locations
  WHERE rack IN ('A', 'B', 'C', 'D', 'E');

CREATE TEMP TABLE _pdf_ae_map ON COMMIT DROP AS
  WITH base AS (
    SELECT
      l.id,
      l.rack,
      CASE WHEN l.level ~ '^[0-9]+$' THEN l.level::int END AS level_num,
      CASE WHEN l.position ~ '^[0-9]+$' THEN l.position::int END AS position_num,
      l.label,
      EXISTS (SELECT 1 FROM _pdf_ae_refs r WHERE r.id = l.id) AS has_refs,
      EXISTS (
        SELECT 1
        FROM public.lot_location_balances b
        WHERE b.location_id = l.id AND b.qty_remaining > 0
      ) AS has_positive_balance
    FROM public.locations l
    WHERE l.rack IN ('A', 'B', 'C', 'D', 'E')
  ), scoped AS (
    SELECT
      b.*,
      b.rack || b.level_num::text || '-' || lpad(b.position_num::text, 2, '0') AS target_label,
      b.level_num::text AS target_level,
      lpad(b.position_num::text, 2, '0') AS target_position,
      b.label = b.rack || b.level_num::text || '-' || lpad(b.position_num::text, 2, '0') AS is_canonical
    FROM base b
    WHERE b.level_num IS NOT NULL
      AND b.position_num IS NOT NULL
      AND (
        (b.rack = 'A' AND b.level_num BETWEEN 1 AND 30 AND b.position_num BETWEEN 1 AND 4)
        OR
        (b.rack IN ('B', 'C', 'D', 'E') AND b.level_num BETWEEN 1 AND 12 AND b.position_num BETWEEN 1 AND 4)
      )
  )
  SELECT
    s.*,
    row_number() OVER (
      PARTITION BY s.target_label
      ORDER BY s.has_refs DESC, s.has_positive_balance DESC, s.is_canonical DESC, s.id
    ) AS keeper_rank
  FROM scoped s;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM _pdf_ae_map WHERE keeper_rank > 1 AND has_refs)
    OR EXISTS (
      SELECT 1
      FROM public.locations l
      WHERE l.rack IN ('A', 'B', 'C', 'D', 'E')
        AND NOT EXISTS (SELECT 1 FROM _pdf_ae_map m WHERE m.id = l.id)
        AND EXISTS (SELECT 1 FROM _pdf_ae_refs r WHERE r.id = l.id)
    ) THEN
    RAISE EXCEPTION 'PDF rack normalization refused: a duplicate or out-of-grid location has operational references';
  END IF;
END $$;

UPDATE public.locations
SET label = '__pdf_ae_' || id::text
WHERE rack IN ('A', 'B', 'C', 'D', 'E');

DELETE FROM public.locations l
WHERE l.rack IN ('A', 'B', 'C', 'D', 'E')
  AND NOT EXISTS (SELECT 1 FROM _pdf_ae_map m WHERE m.id = l.id);

DELETE FROM public.locations l
USING _pdf_ae_map m
WHERE l.id = m.id
  AND m.keeper_rank > 1;

UPDATE public.locations l
SET
  zone = m.rack,
  rack = m.rack,
  level = m.target_level,
  position = m.target_position,
  label = m.target_label
FROM _pdf_ae_map m
WHERE l.id = m.id
  AND m.keeper_rank = 1;

UPDATE public.pick_list_items p
SET location_label = m.target_label
FROM _pdf_ae_map m
WHERE p.location_id = m.id
  AND m.keeper_rank = 1;

WITH rack_specs(rack, level_end) AS (
  VALUES ('A', 30), ('B', 12), ('C', 12), ('D', 12), ('E', 12)
), targets AS (
  SELECT
    s.rack,
    levels.level_num,
    positions.position_num,
    s.rack || levels.level_num::text || '-' || lpad(positions.position_num::text, 2, '0') AS label
  FROM rack_specs s
  CROSS JOIN LATERAL generate_series(1, s.level_end) AS levels(level_num)
  CROSS JOIN LATERAL generate_series(1, 4) AS positions(position_num)
)
INSERT INTO public.locations (
  zone, rack, level, position, label, location_type, max_cbm_capacity, is_active
)
SELECT
  t.rack,
  t.rack,
  t.level_num::text,
  lpad(t.position_num::text, 2, '0'),
  t.label,
  'storage'::public.location_type,
  c.max_cbm_capacity,
  true
FROM targets t
CROSS JOIN _pdf_ae_capacity c
WHERE NOT EXISTS (SELECT 1 FROM public.locations l WHERE l.label = t.label);

DO $$
DECLARE
  total_count integer;
BEGIN
  SELECT count(*) INTO total_count
  FROM public.locations
  WHERE rack IN ('A', 'B', 'C', 'D', 'E');

  IF total_count <> 312 THEN
    RAISE EXCEPTION 'PDF rack normalization failed: expected 312 A-E locations, found %', total_count;
  END IF;
END $$;

COMMIT;


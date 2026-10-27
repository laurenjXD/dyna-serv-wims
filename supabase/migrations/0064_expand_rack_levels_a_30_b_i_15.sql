-- Expand the approved operating range after the Product Owner's clarification:
--   Rack A: levels 1-30
--   Racks B-I: levels 1-15
-- Existing A-I IDs, balances, and history remain unchanged.

BEGIN;

CREATE TEMP TABLE _rack_level_capacity ON COMMIT DROP AS
  SELECT coalesce(max(max_cbm_capacity), 9999.9999::numeric) AS max_cbm_capacity
  FROM public.locations
  WHERE rack IN ('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I');

WITH rack_specs(rack, level_end, position_end) AS (
  VALUES
    ('A', 30, 4),
    ('B', 15, 4),
    ('C', 15, 4),
    ('D', 15, 4),
    ('E', 15, 4),
    ('F', 15, 4),
    ('G', 15, 4),
    ('H', 15, 2),
    ('I', 15, 2)
), targets AS (
  SELECT
    s.rack,
    levels.level_num,
    positions.position_num,
    s.rack || levels.level_num::text || '-' || lpad(positions.position_num::text, 2, '0') AS label
  FROM rack_specs s
  CROSS JOIN LATERAL generate_series(1, s.level_end) AS levels(level_num)
  CROSS JOIN LATERAL generate_series(1, s.position_end) AS positions(position_num)
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
CROSS JOIN _rack_level_capacity c
WHERE NOT EXISTS (SELECT 1 FROM public.locations l WHERE l.label = t.label);

DO $$
DECLARE
  total_count integer;
BEGIN
  SELECT count(*) INTO total_count
  FROM public.locations
  WHERE rack IN ('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I');

  IF total_count <> 540 THEN
    RAISE EXCEPTION 'Rack level expansion failed: expected 540 locations, found %', total_count;
  END IF;
END $$;

COMMIT;

-- Align the live rack registry with the supplied A-I pallet-position drawing.
--
-- Canonical footprint:
--   Rack A: 30 levels x 4 positions = 120
--   Racks B-E: 12 levels x 4 positions = 48 each
--   Racks F-G: 14 levels x 4 positions = 56 each
--   Racks H-I: 12 levels x 2 positions = 24 each
--   Total: 472 locations
--
-- Migrations 0057-0059 left A-G in the transposed RACKING-tab orientation
-- and 0058 left H-I in the older 28-level x 4-position interpretation.
-- Referenced location IDs and stock are preserved in place. Duplicate and
-- out-of-grid rows are removed only when they have no operational references.

BEGIN;

CREATE TEMP TABLE _pdf_ai_refs ON COMMIT DROP AS
  SELECT location_id AS id FROM public.lot_location_balances
  UNION SELECT location_id FROM public.inventory_units WHERE location_id IS NOT NULL
  UNION SELECT location_id FROM public.carton_status_history WHERE location_id IS NOT NULL
  UNION SELECT location_id FROM public.pick_list_items
  UNION SELECT from_location_id FROM public.inventory_transactions WHERE from_location_id IS NOT NULL
  UNION SELECT to_location_id FROM public.inventory_transactions WHERE to_location_id IS NOT NULL
  UNION SELECT from_location_id FROM public.transfer_requests WHERE from_location_id IS NOT NULL
  UNION SELECT to_location_id FROM public.transfer_requests WHERE to_location_id IS NOT NULL
  UNION SELECT location_id FROM public.wrr_item_putaway_allocations
  UNION SELECT putaway_location_id FROM public.wrr_items WHERE putaway_location_id IS NOT NULL;

CREATE TEMP TABLE _pdf_ai_capacity ON COMMIT DROP AS
  SELECT coalesce(max(max_cbm_capacity), 9999.9999::numeric) AS max_cbm_capacity
  FROM public.locations
  WHERE rack IN ('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I');

-- A-G were stored as four levels by many positions by migration 0059. Detect
-- that shape so this migration is safe for the deployed registry and for a
-- replay against an already-correct A-G subset.
CREATE TEMP TABLE _pdf_ai_orientation ON COMMIT DROP AS
  SELECT
    rack,
    coalesce(max(CASE WHEN level ~ '^[0-9]+$' THEN level::int ELSE 0 END), 0) <= 4
      AND coalesce(max(CASE WHEN position ~ '^[0-9]+$' THEN position::int ELSE 0 END), 0) > 4
      AS needs_rotation
  FROM public.locations
  WHERE rack IN ('A', 'B', 'C', 'D', 'E', 'F', 'G')
  GROUP BY rack;

CREATE TEMP TABLE _pdf_ai_base ON COMMIT DROP AS
  SELECT
    l.id,
    l.rack,
    l.label,
    l.level,
    l.position,
    EXISTS (SELECT 1 FROM _pdf_ai_refs r WHERE r.id = l.id) AS has_refs,
    EXISTS (
      SELECT 1
      FROM public.lot_location_balances b
      WHERE b.location_id = l.id AND b.qty_remaining > 0
    ) AS has_positive_balance,
    CASE
      WHEN l.rack IN ('A', 'B', 'C', 'D', 'E', 'F', 'G')
        AND coalesce(o.needs_rotation, false)
        AND l.position ~ '^[0-9]+$' THEN l.position::int
      WHEN l.level ~ '^[0-9]+$' THEN l.level::int
    END AS target_level_num,
    CASE
      WHEN l.rack IN ('A', 'B', 'C', 'D', 'E', 'F', 'G')
        AND coalesce(o.needs_rotation, false)
        AND l.level ~ '^[0-9]+$' THEN l.level::int
      WHEN l.position ~ '^[0-9]+$' THEN l.position::int
    END AS target_position_num
  FROM public.locations l
  LEFT JOIN _pdf_ai_orientation o ON o.rack = l.rack
  WHERE l.rack IN ('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I');

CREATE TEMP TABLE _pdf_ai_map ON COMMIT DROP AS
  WITH mapped AS (
    SELECT
      b.*,
      b.rack || b.target_level_num::text || '-' || lpad(b.target_position_num::text, 2, '0') AS target_label,
      CASE
        WHEN b.rack = 'A' THEN b.target_level_num BETWEEN 1 AND 30 AND b.target_position_num BETWEEN 1 AND 4
        WHEN b.rack IN ('B', 'C', 'D', 'E') THEN b.target_level_num BETWEEN 1 AND 12 AND b.target_position_num BETWEEN 1 AND 4
        WHEN b.rack IN ('F', 'G') THEN b.target_level_num BETWEEN 1 AND 14 AND b.target_position_num BETWEEN 1 AND 4
        WHEN b.rack IN ('H', 'I') THEN b.target_level_num BETWEEN 1 AND 12 AND b.target_position_num BETWEEN 1 AND 2
        ELSE false
      END AS is_valid
    FROM _pdf_ai_base b
  )
  SELECT
    m.*,
    row_number() OVER (
      PARTITION BY m.target_label
      ORDER BY m.has_refs DESC, m.has_positive_balance DESC,
        (m.label = m.target_label) DESC, m.id
    ) AS keeper_rank
  FROM mapped m
  WHERE m.target_level_num IS NOT NULL
    AND m.target_position_num IS NOT NULL
    AND m.is_valid;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM _pdf_ai_map WHERE keeper_rank > 1 AND has_refs)
    OR EXISTS (
      SELECT 1
      FROM _pdf_ai_base b
      WHERE NOT EXISTS (SELECT 1 FROM _pdf_ai_map m WHERE m.id = b.id)
        AND b.has_refs
    ) THEN
    RAISE EXCEPTION 'PDF A-I rack alignment refused: a duplicate or out-of-grid location has operational references';
  END IF;
END $$;

-- Make every source label temporarily unique before rewriting the keeper rows.
UPDATE public.locations
SET label = '__pdf_ai_' || id::text
WHERE rack IN ('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I');

-- Only unreferenced duplicate/out-of-grid rows may be removed.
DELETE FROM public.locations l
WHERE l.rack IN ('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I')
  AND NOT EXISTS (SELECT 1 FROM _pdf_ai_map m WHERE m.id = l.id);

DELETE FROM public.locations l
USING _pdf_ai_map m
WHERE l.id = m.id
  AND m.keeper_rank > 1;

UPDATE public.locations l
SET
  zone = m.rack,
  rack = m.rack,
  level = m.target_level_num::text,
  position = lpad(m.target_position_num::text, 2, '0'),
  label = m.target_label
FROM _pdf_ai_map m
WHERE l.id = m.id
  AND m.keeper_rank = 1;

UPDATE public.pick_list_items p
SET location_label = m.target_label
FROM _pdf_ai_map m
WHERE p.location_id = m.id
  AND m.keeper_rank = 1;

WITH rack_specs(rack, level_end, position_end) AS (
  VALUES
    ('A', 30, 4),
    ('B', 12, 4),
    ('C', 12, 4),
    ('D', 12, 4),
    ('E', 12, 4),
    ('F', 14, 4),
    ('G', 14, 4),
    ('H', 12, 2),
    ('I', 12, 2)
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
CROSS JOIN _pdf_ai_capacity c
WHERE NOT EXISTS (SELECT 1 FROM public.locations l WHERE l.label = t.label);

DO $$
DECLARE
  total_count integer;
BEGIN
  SELECT count(*) INTO total_count
  FROM public.locations
  WHERE rack IN ('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I');

  IF total_count <> 472 THEN
    RAISE EXCEPTION 'PDF A-I rack alignment failed: expected 472 locations, found %', total_count;
  END IF;
END $$;

COMMIT;

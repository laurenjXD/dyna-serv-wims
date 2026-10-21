-- Align the live rack registry with the visible RACKING tab in the supplied
-- workbook. The tab defines Rack A as four levels x thirty positions and
-- Racks B-G as four levels x fifteen positions.
--
-- Migrations 0057/0058 stored the earlier interpretation with levels and
-- positions transposed. Referenced location IDs are retained and renamed in
-- place so inventory, transactions, putaway, pick lists, and history remain
-- attached to the same physical records.

BEGIN;

CREATE TEMP TABLE _racking_ag_refs ON COMMIT DROP AS
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

CREATE TEMP TABLE _racking_ag_capacity ON COMMIT DROP AS
  SELECT coalesce(max(max_cbm_capacity), 9999.9999::numeric) AS max_cbm_capacity
  FROM public.locations
  WHERE rack IN ('A', 'B', 'C', 'D', 'E', 'F', 'G');

-- The preceding migrations produced the transposed shape. The orientation
-- flag makes this migration safe if a partially populated target-shaped set
-- is encountered during a replay or recovery.
CREATE TEMP TABLE _racking_ag_orientation ON COMMIT DROP AS
  SELECT
    rack,
    coalesce(bool_or(level ~ '^[0-9]+$' AND level::int > 4), false)
      AND NOT coalesce(bool_or(position ~ '^[0-9]+$' AND position::int > 4), false)
      AS needs_rotation
  FROM public.locations
  WHERE rack IN ('A', 'B', 'C', 'D', 'E', 'F', 'G')
  GROUP BY rack;

CREATE TEMP TABLE _racking_ag_map ON COMMIT DROP AS
  WITH base AS (
    SELECT
      l.id,
      l.rack,
      l.label,
      EXISTS (SELECT 1 FROM _racking_ag_refs r WHERE r.id = l.id) AS has_refs,
      EXISTS (
        SELECT 1
        FROM public.lot_location_balances b
        WHERE b.location_id = l.id AND b.qty_remaining > 0
      ) AS has_positive_balance,
      CASE
        WHEN o.needs_rotation AND l.position ~ '^[0-9]+$' THEN l.position::int
        WHEN l.level ~ '^[0-9]+$' THEN l.level::int
      END AS target_level_num,
      CASE
        WHEN o.needs_rotation AND l.level ~ '^[0-9]+$' THEN l.level::int
        WHEN l.position ~ '^[0-9]+$' THEN l.position::int
      END AS target_position_num
    FROM public.locations l
    LEFT JOIN _racking_ag_orientation o ON o.rack = l.rack
    WHERE l.rack IN ('A', 'B', 'C', 'D', 'E', 'F', 'G')
  ), mapped AS (
    SELECT
      b.*,
      b.rack || b.target_level_num::text || '-' || lpad(b.target_position_num::text, 2, '0') AS target_label,
      b.target_level_num BETWEEN 1 AND 4
        AND b.target_position_num BETWEEN 1 AND CASE WHEN b.rack = 'A' THEN 30 ELSE 15 END AS is_valid
    FROM base b
  )
  SELECT
    m.*,
    row_number() OVER (
      PARTITION BY m.target_label
      ORDER BY m.has_refs DESC, m.has_positive_balance DESC,
        (m.label = m.target_label) DESC, m.id
    ) AS keeper_rank
  FROM mapped m
  WHERE m.is_valid;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM _racking_ag_map WHERE keeper_rank > 1 AND has_refs)
    OR EXISTS (
      SELECT 1
      FROM public.locations l
      WHERE l.rack IN ('A', 'B', 'C', 'D', 'E', 'F', 'G')
        AND NOT EXISTS (SELECT 1 FROM _racking_ag_map m WHERE m.id = l.id)
        AND EXISTS (SELECT 1 FROM _racking_ag_refs r WHERE r.id = l.id)
    ) THEN
    RAISE EXCEPTION 'RACKING tab remap refused: a duplicate or out-of-grid location has operational references';
  END IF;
END $$;

-- Avoid the unique label constraint while the keeper rows are rewritten.
UPDATE public.locations
SET label = '__racking_ag_' || id::text
WHERE rack IN ('A', 'B', 'C', 'D', 'E', 'F', 'G');

-- Unreferenced duplicates and out-of-grid rows are safe to remove. Referenced
-- rows were rejected above rather than silently losing operational history.
DELETE FROM public.locations l
WHERE l.rack IN ('A', 'B', 'C', 'D', 'E', 'F', 'G')
  AND NOT EXISTS (SELECT 1 FROM _racking_ag_map m WHERE m.id = l.id);

DELETE FROM public.locations l
USING _racking_ag_map m
WHERE l.id = m.id
  AND m.keeper_rank > 1;

UPDATE public.locations l
SET
  zone = m.rack,
  rack = m.rack,
  level = m.target_level_num::text,
  position = lpad(m.target_position_num::text, 2, '0'),
  label = m.target_label
FROM _racking_ag_map m
WHERE l.id = m.id
  AND m.keeper_rank = 1;

UPDATE public.pick_list_items p
SET location_label = m.target_label
FROM _racking_ag_map m
WHERE p.location_id = m.id
  AND m.keeper_rank = 1;

WITH rack_specs(rack, position_end) AS (
  VALUES ('A', 30), ('B', 15), ('C', 15), ('D', 15), ('E', 15), ('F', 15), ('G', 15)
), targets AS (
  SELECT
    s.rack,
    levels.level_num,
    positions.position_num,
    s.rack || levels.level_num::text || '-' || lpad(positions.position_num::text, 2, '0') AS label
  FROM rack_specs s
  CROSS JOIN LATERAL generate_series(1, 4) AS levels(level_num)
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
CROSS JOIN _racking_ag_capacity c
WHERE NOT EXISTS (SELECT 1 FROM public.locations l WHERE l.label = t.label);

DO $$
DECLARE
  total_count integer;
BEGIN
  SELECT count(*) INTO total_count
  FROM public.locations
  WHERE rack IN ('A', 'B', 'C', 'D', 'E', 'F', 'G')
    AND is_active = true;

  IF total_count <> 480 THEN
    RAISE EXCEPTION 'RACKING tab alignment failed: expected 480 active A-G locations, found %', total_count;
  END IF;
END $$;

COMMIT;

-- Remap legacy F-I rows using the Excel Racking ID sheet as the current
-- geometry source. The workbook lists position-level labels (for example
-- F1-05 = position 1, level 5), while WIMS stores canonical level-position
-- labels (F5-01). Existing IDs and inventory references are preserved.
--
-- Excel geometry:
--   F/G: 30 levels x 4 positions = 120 each
--   H/I: 28 levels x 4 positions = 112 each

BEGIN;

CREATE TEMP TABLE _excel_fi_refs ON COMMIT DROP AS
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

CREATE TEMP TABLE _excel_fi_capacity ON COMMIT DROP AS
  SELECT coalesce(max(max_cbm_capacity), 9999.9999::numeric) AS max_cbm_capacity
  FROM public.locations
  WHERE rack IN ('F', 'G', 'H', 'I');

CREATE TEMP TABLE _excel_fi_base ON COMMIT DROP AS
  WITH rack_specs(rack, level_end) AS (
    VALUES ('F', 30), ('G', 30), ('H', 28), ('I', 28)
  ), excel_labels AS (
    SELECT
      s.rack || positions.position_num::text || '-' || lpad(levels.level_num::text, 2, '0') AS label
    FROM rack_specs s
    CROSS JOIN LATERAL generate_series(1, s.level_end) AS levels(level_num)
    CROSS JOIN LATERAL generate_series(1, 4) AS positions(position_num)
  )
  SELECT
    l.id,
    l.rack,
    l.label,
    l.level,
    l.position,
    EXISTS (SELECT 1 FROM excel_labels e WHERE e.label = l.label) AS is_excel_label,
    CASE
      WHEN EXISTS (SELECT 1 FROM excel_labels e WHERE e.label = l.label)
        THEN CASE WHEN split_part(l.label, '-', 2) ~ '^[0-9]+$' THEN split_part(l.label, '-', 2)::int END
      WHEN l.level ~ '^[0-9]+$' THEN l.level::int
    END AS target_level_num,
    CASE
      WHEN EXISTS (SELECT 1 FROM excel_labels e WHERE e.label = l.label)
        THEN CASE WHEN regexp_replace(split_part(l.label, '-', 1), '^[FGHI]', '') ~ '^[0-9]+$' THEN regexp_replace(split_part(l.label, '-', 1), '^[FGHI]', '')::int END
      WHEN l.position ~ '^[0-9]+$' THEN l.position::int
    END AS target_position_num,
    EXISTS (SELECT 1 FROM _excel_fi_refs r WHERE r.id = l.id) AS has_refs,
    EXISTS (
      SELECT 1
      FROM public.lot_location_balances b
      WHERE b.location_id = l.id AND b.qty_remaining > 0
    ) AS has_positive_balance
  FROM public.locations l
  WHERE l.rack IN ('F', 'G', 'H', 'I');

CREATE TEMP TABLE _excel_fi_map ON COMMIT DROP AS
  WITH mapped AS (
    SELECT
      b.*,
      b.rack || b.target_level_num::text || '-' || lpad(b.target_position_num::text, 2, '0') AS target_label,
      b.target_level_num BETWEEN 1 AND CASE WHEN b.rack IN ('F', 'G') THEN 30 ELSE 28 END
        AND b.target_position_num BETWEEN 1 AND 4 AS is_valid
    FROM _excel_fi_base b
  )
  SELECT
    m.*,
    row_number() OVER (
      PARTITION BY m.target_label
      ORDER BY m.has_refs DESC, m.has_positive_balance DESC, m.is_excel_label DESC, m.id
    ) AS keeper_rank
  FROM mapped m
  WHERE m.is_valid;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM _excel_fi_map WHERE keeper_rank > 1 AND has_refs
  ) OR EXISTS (
    SELECT 1 FROM _excel_fi_base WHERE NOT (
      target_level_num BETWEEN 1 AND CASE WHEN rack IN ('F', 'G') THEN 30 ELSE 28 END
        AND target_position_num BETWEEN 1 AND 4
    ) AND has_refs
  ) THEN
    RAISE EXCEPTION 'Excel F-I remap refused: a duplicate or invalid location has operational references';
  END IF;
END $$;

-- Make every source row temporarily unique before changing labels.
UPDATE public.locations
SET label = '__excel_fi_' || id::text
WHERE rack IN ('F', 'G', 'H', 'I');

-- Remove only invalid or duplicate rows that have no operational references.
DELETE FROM public.locations l
WHERE l.rack IN ('F', 'G', 'H', 'I')
  AND NOT EXISTS (SELECT 1 FROM _excel_fi_map m WHERE m.id = l.id);

DELETE FROM public.locations l
USING _excel_fi_map m
WHERE l.id = m.id
  AND m.keeper_rank > 1;

-- Preserve the keeper IDs and rewrite them to WIMS's canonical fields.
UPDATE public.locations l
SET
  zone = m.rack,
  rack = m.rack,
  level = m.target_level_num::text,
  position = lpad(m.target_position_num::text, 2, '0'),
  label = m.target_label
FROM _excel_fi_map m
WHERE l.id = m.id
  AND m.keeper_rank = 1;

UPDATE public.pick_list_items p
SET location_label = m.target_label
FROM _excel_fi_map m
WHERE p.location_id = m.id
  AND m.keeper_rank = 1;

-- Complete any empty Excel-defined F-I cells.
WITH rack_specs(rack, level_end) AS (
  VALUES ('F', 30), ('G', 30), ('H', 28), ('I', 28)
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
CROSS JOIN _excel_fi_capacity c
WHERE NOT EXISTS (SELECT 1 FROM public.locations l WHERE l.label = t.label);

DO $$
DECLARE
  total_count integer;
BEGIN
  SELECT count(*) INTO total_count
  FROM public.locations
  WHERE rack IN ('F', 'G', 'H', 'I');

  IF total_count <> 464 THEN
    RAISE EXCEPTION 'Excel F-I remap failed: expected 464 locations, found %', total_count;
  END IF;
END $$;

COMMIT;

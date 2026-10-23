-- Location zone contract:
--   storage -> rack A-I, level 1-4, position A 1-30 / B-I 1-15,
--               positive CBM and a generated Rack+Level-Position label
--   rcv/hold -> tracking-only row with NULL rack-specific fields
--
-- Existing A-I rows from 0064 used the old transposed level/position shape.
-- This migration preserves referenced IDs while normalizing those rows to the
-- final form contract before adding the conditional database checks.

BEGIN;

ALTER TABLE public.locations
  ALTER COLUMN rack DROP NOT NULL,
  ALTER COLUMN level DROP NOT NULL,
  ALTER COLUMN position DROP NOT NULL,
  ALTER COLUMN label DROP NOT NULL,
  ALTER COLUMN max_cbm_capacity DROP NOT NULL;

CREATE TEMP TABLE _location_zone_refs ON COMMIT DROP AS
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

-- Normalize legacy non-rack tracking rows first. The application contract uses
-- only lower-case canonical zone values, while old imports used labels/racks.
UPDATE public.locations
SET zone = 'rcv', rack = NULL, level = NULL, position = NULL, label = NULL,
    max_cbm_capacity = NULL
WHERE upper(coalesce(zone, '')) = 'RCV'
   OR upper(coalesce(rack, '')) = 'RCV'
   OR upper(coalesce(label, '')) = 'RCV';

UPDATE public.locations
SET zone = 'hold', rack = NULL, level = NULL, position = NULL, label = NULL,
    max_cbm_capacity = NULL
WHERE upper(coalesce(zone, '')) = 'HOLD'
   OR upper(coalesce(rack, '')) = 'HOLD'
   OR upper(coalesce(label, '')) = 'HOLD';

CREATE TEMP TABLE _location_targets ON COMMIT DROP AS
WITH source AS (
  SELECT
    l.*,
    EXISTS (SELECT 1 FROM _location_zone_refs r WHERE r.id = l.id) AS has_refs,
    EXISTS (
      SELECT 1 FROM public.lot_location_balances b
      WHERE b.location_id = l.id AND b.qty_remaining > 0
    ) AS has_positive_balance,
    CASE
      WHEN l.level ~ '^[0-9]+$' AND l.position ~ '^[0-9]+$'
           AND l.level::integer > 4 AND l.position::integer BETWEEN 1 AND 4
        THEN l.position::integer
      WHEN l.level ~ '^[0-9]+$' THEN l.level::integer
    END AS target_level_num,
    CASE
      WHEN l.level ~ '^[0-9]+$' AND l.position ~ '^[0-9]+$'
           AND l.level::integer > 4 AND l.position::integer BETWEEN 1 AND 4
        THEN l.level::integer
      WHEN l.position ~ '^[0-9]+$' THEN l.position::integer
    END AS target_position_num
  FROM public.locations l
  WHERE upper(trim(l.rack)) IN ('A','B','C','D','E','F','G','H','I')
), mapped AS (
  SELECT
    s.*,
    s.rack || s.target_level_num::text || '-' || lpad(s.target_position_num::text, 2, '0') AS target_label,
    s.target_level_num BETWEEN 1 AND 4
      AND s.target_position_num BETWEEN 1 AND CASE WHEN s.rack = 'A' THEN 30 ELSE 15 END AS is_valid
  FROM source s
)
SELECT
  m.id,
  upper(trim(m.rack)) AS target_rack,
  m.target_level_num,
  m.target_position_num,
  m.target_label,
  m.has_refs,
  m.has_positive_balance,
  row_number() OVER (
    PARTITION BY m.target_label
    ORDER BY m.has_refs DESC, m.has_positive_balance DESC,
      (m.label = m.target_label) DESC, m.id
  ) AS keeper_rank
FROM mapped m
WHERE m.is_valid;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM _location_targets WHERE keeper_rank > 1 AND has_refs)
     OR EXISTS (
       SELECT 1
       FROM public.locations l
       WHERE upper(trim(l.rack)) IN ('A','B','C','D','E','F','G','H','I')
         AND NOT EXISTS (SELECT 1 FROM _location_targets t WHERE t.id = l.id)
         AND EXISTS (SELECT 1 FROM _location_zone_refs r WHERE r.id = l.id)
     ) THEN
    RAISE EXCEPTION 'Location zone migration refused: referenced rack rows would be duplicated or outside the final range';
  END IF;
END $$;

-- Avoid the existing unique label index while rewriting keeper rows.
UPDATE public.locations
SET label = '__location_zone_' || id::text
WHERE upper(trim(rack)) IN ('A','B','C','D','E','F','G','H','I');

DELETE FROM public.locations l
WHERE upper(trim(l.rack)) IN ('A','B','C','D','E','F','G','H','I')
  AND NOT EXISTS (SELECT 1 FROM _location_targets t WHERE t.id = l.id);

DELETE FROM public.locations l
USING _location_targets t
WHERE l.id = t.id AND t.keeper_rank > 1;

UPDATE public.locations l
SET zone = 'storage',
    rack = t.target_rack,
    level = t.target_level_num::text,
    position = lpad(t.target_position_num::text, 2, '0'),
    label = t.target_label
FROM _location_targets t
WHERE l.id = t.id AND t.keeper_rank = 1;

-- Any remaining legacy zone must be a rack row; fail rather than silently
-- guessing the meaning of an unknown non-rack location.
UPDATE public.locations
SET zone = 'storage'
WHERE upper(trim(rack)) IN ('A','B','C','D','E','F','G','H','I');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.locations
    WHERE zone NOT IN ('storage', 'rcv', 'hold')
  ) THEN
    RAISE EXCEPTION 'Location zone migration refused: unknown zone remains';
  END IF;
END $$;

ALTER TABLE public.locations
  ADD CONSTRAINT locations_zone_allowed
    CHECK (zone IN ('storage', 'rcv', 'hold')),
  ADD CONSTRAINT locations_zone_fields_valid
    CHECK (
      (
        zone = 'storage'
        AND rack ~ '^[A-I]$'
        AND level ~ '^[1-4]$'
        AND position ~ '^[0-9]{2}$'
        AND position::integer BETWEEN 1 AND CASE WHEN rack = 'A' THEN 30 ELSE 15 END
        AND label = rack || level || '-' || position
        AND max_cbm_capacity IS NOT NULL
        AND max_cbm_capacity > 0
      )
      OR
      (
        zone IN ('rcv', 'hold')
        AND rack IS NULL
        AND level IS NULL
        AND position IS NULL
        AND label IS NULL
        AND max_cbm_capacity IS NULL
      )
    );

COMMIT;

-- specs/01-core-data-model/design.md §1.2 (item_categories table)
--
-- Seeds real category/subcategory data (PO-supplied, 2026-08-17) to unblock
-- the Items form's Inventory Model -> Category -> Subcategory cascading
-- select (built same day — see specs/00-steering/revision-log.md's "Items
-- form Classification section" entry) — item_categories had zero rows
-- before this migration, so the cascade had nothing to select from. Spec
-- 17 (Product Categorization CRUD, an admin management UI for these rows)
-- remains blocked/deferred; this is a one-time data seed, not that UI.
--
-- "Packaging Material" and "Raw Material" both exist under VMI and Trading
-- as SEPARATE category rows (not shared) — each model's subcategories under
-- those names differ, per the PO-supplied list. Supplies has no categories
-- yet (list not provided) — no rows seeded for it in this migration; a
-- follow-up migration adds them once supplied.
--
-- No unique constraint exists on (name, flow_type) or (name, parent_id) in
-- the approved 01 schema, so idempotency here is via NOT EXISTS guards
-- rather than ON CONFLICT (matching the constraint the table actually has,
-- not inventing one).

-- ---------------------------------------------------------------------------
-- Parent categories
-- ---------------------------------------------------------------------------

INSERT INTO "item_categories" ("name", "flow_type")
SELECT v.name, v.flow_type::"flow_type"
FROM (VALUES
  ('Packaging Material', 'vmi'),
  ('Raw Material', 'vmi'),
  ('Packaging Material', 'trading'),
  ('Raw Material', 'trading'),
  ('Fabrication', 'trading'),
  ('Spare Parts', 'trading'),
  ('Tester Boards', 'trading'),
  ('Machines', 'trading')
) AS v(name, flow_type)
WHERE NOT EXISTS (
  SELECT 1 FROM "item_categories" ic
  WHERE ic.name = v.name AND ic.flow_type = v.flow_type::"flow_type" AND ic.parent_id IS NULL
);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Subcategories — looked up against their parent by (name, flow_type),
-- matching the migration's own just-inserted parent rows above.
-- ---------------------------------------------------------------------------

INSERT INTO "item_categories" ("name", "flow_type", "parent_id")
SELECT v.name, v.flow_type::"flow_type", parent.id
FROM (VALUES
  -- VMI > Packaging Material
  ('Plastic Tray', 'vmi', 'Packaging Material'),
  ('U-Clip', 'vmi', 'Packaging Material'),
  ('Carrier Tape', 'vmi', 'Packaging Material'),
  ('End-Plug', 'vmi', 'Packaging Material'),
  ('Cover Tape', 'vmi', 'Packaging Material'),
  -- VMI > Raw Material
  ('Polysheet', 'vmi', 'Raw Material'),
  ('Resin', 'vmi', 'Raw Material'),
  -- Trading > Packaging Material
  ('ESD', 'trading', 'Packaging Material'),
  ('Chemicals', 'trading', 'Packaging Material'),
  -- Trading > Fabrication
  ('Plastic', 'trading', 'Fabrication'),
  ('Metal', 'trading', 'Fabrication')
) AS v(name, flow_type, parent_name)
JOIN "item_categories" parent
  ON parent.name = v.parent_name
  AND parent.flow_type = v.flow_type::"flow_type"
  AND parent.parent_id IS NULL
WHERE NOT EXISTS (
  SELECT 1 FROM "item_categories" ic
  WHERE ic.name = v.name AND ic.parent_id = parent.id
);

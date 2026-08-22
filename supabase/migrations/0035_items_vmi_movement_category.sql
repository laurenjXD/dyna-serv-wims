-- `01-core-data-model` amendment: items.vmi_movement_category
--
-- Surfaced during specs/12-vmi-billing Task C.1: design.md §2.1 assumed a
-- per-movement FG/RAW_MATERIAL/FOR_PROCESS/REJECT/RE_INSPECT classification
-- that had no backing column anywhere in the already-implemented `01`
-- schema. Product Owner decision 2026-08-19: add it as a fixed, nullable
-- property of `items` (new `vmi_movement_category` enum column, not a
-- repurposing of the existing free-text `item_type`), per
-- specs/01-core-data-model/design.md §1.1/§1.2's amendment and
-- specs/00-steering/revision-log.md's "`01-core-data-model` amendment:
-- items.vmi_movement_category added (2026-08-19)" entry. See also
-- specs/12-vmi-billing/tasks.md B.11.
--
-- This is an ALTER TABLE against an already-migrated, already-Approved
-- `items` table — additive and nullable, so no backfill is required for
-- existing rows.

CREATE TYPE "public"."vmi_movement_category" AS ENUM('fg', 'raw_material', 'for_process', 'reject', 're_inspect');--> statement-breakpoint

ALTER TABLE public.items
  ADD COLUMN vmi_movement_category vmi_movement_category;

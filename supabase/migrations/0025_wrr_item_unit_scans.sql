-- specs/18-barcode-integration/design.md §2.2 (WRR-time per-unit label
-- generation) and specs/07-incoming-receiving/design.md §6 (barcode
-- reconciliation, duplicate-scan rejection).
--
-- Gap this closes: WRRUnitLabelGenerator (components/barcode/) prints one
-- physical label per expected unit, each carrying its own unique unit_id in
-- the scanned payload. Nothing previously recorded which unit_ids had
-- already been scanned for a given wrr_items line, so a duplicate physical
-- rescan of the exact same label was indistinguishable from a legitimate
-- second unit and silently counted toward scanned_qty. This table is the
-- persistence layer that makes real duplicate-unit detection possible.
--
-- Why a separate table rather than a column on wrr_items: a line has up to
-- expected_qty independently scannable units — inherently one-to-many, not
-- a single value. The UNIQUE (wrr_item_id, unit_id) constraint is the real
-- enforcement mechanism: a second INSERT of the same pair fails at the
-- database level, not just in application logic that a retry/race could
-- bypass.
--
-- Brand-new table (not covered by 0008_rls_policies.sql's blanket RLS
-- enable) — RLS is enabled/forced here, matching the pattern established in
-- 0013_transfer_and_inspection_tables.sql for its new tables.
--
-- RLS gates INSERT and SELECT on 'receiving','scan','global' — the exact
-- same capability recordScan (lib/actions/receiving.ts) already requires
-- for floor scanning, already seeded in 0005_rbac_constraints_and_seed.sql
-- and already granted to warehouse_staff/supervisor. No new capability
-- string is introduced.
--
-- The INSERT policy binds scanned_by_user_id = auth.uid() (when supplied,
-- matching wrr_documents_insert's staged_by_user_id = auth.uid() actor-
-- attribution precedent in 0012) and requires the target wrr_item's parent
-- WRR to be receiving_in_progress (matching wrr_inspection_logs_insert's
-- own EXISTS-based status gate in 0012) — a zero-row sibling UPDATE does
-- not itself block a separate INSERT under Postgres RLS, so this table's
-- own policy re-asserts the invariant rather than relying on
-- application-layer-only enforcement.

CREATE TABLE public.wrr_item_unit_scans (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wrr_item_id  uuid NOT NULL REFERENCES public.wrr_items(id),
  unit_id      uuid NOT NULL, -- the label's own unique per-unit identifier, from the wrr_item_unit payload's unit_id field
  scanned_at   timestamptz NOT NULL DEFAULT now(),
  scanned_by_user_id uuid REFERENCES auth.users(id),

  -- The whole point of this table: the same physical label can never be
  -- recorded as a fresh scan twice.
  CONSTRAINT wrr_item_unit_scans_unique_unit UNIQUE (wrr_item_id, unit_id)
);
--> statement-breakpoint

CREATE INDEX wrr_item_unit_scans_wrr_item_id_idx ON public.wrr_item_unit_scans (wrr_item_id);
--> statement-breakpoint

ALTER TABLE public.wrr_item_unit_scans ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.wrr_item_unit_scans FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY wrr_item_unit_scans_select ON public.wrr_item_unit_scans
  FOR SELECT TO authenticated
  USING (
    rbac_internal.has_permission('receiving', 'scan', 'global')
  );
--> statement-breakpoint

CREATE POLICY wrr_item_unit_scans_insert ON public.wrr_item_unit_scans
  FOR INSERT TO authenticated
  WITH CHECK (
    rbac_internal.has_permission('receiving', 'scan', 'global')
    AND (scanned_by_user_id IS NULL OR scanned_by_user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.wrr_items wi
      JOIN public.wrr_documents wd ON wd.id = wi.wrr_id
      WHERE wi.id = wrr_item_id
        AND wd.status = 'receiving_in_progress'
    )
  );
--> statement-breakpoint

GRANT SELECT, INSERT ON public.wrr_item_unit_scans TO authenticated;

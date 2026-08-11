-- docs/superpowers/plans/2026-08-11-barcode-scanner-and-unit-labels-completion.md
--   Phase 2, Task B — "wrr_item_unit_scans tracking table".
-- specs/18-barcode-integration/requirements.md FR-3a.3 (AC 6.5) and
-- specs/07-incoming-receiving/requirements.md R3.3 ("duplicate carton" scan
-- rejection). See also specs/01-core-data-model/design.md's new schema
-- amendment section for this table (added alongside this migration).
--
-- Gap this closes: WRRUnitLabelGenerator (components/barcode/) prints one
-- physical label per expected unit, each carrying its own unique unit_id in
-- the scanned payload. Nothing previously recorded which unit_ids had
-- already been scanned for a given wrr_items line, so a duplicate physical
-- rescan of the exact same label was indistinguishable from a legitimate
-- second unit and silently counted toward scanned_qty. This table is the
-- persistence layer that makes real duplicate-unit detection possible; the
-- matcher/action wiring that reads and writes it is separate follow-up work
-- (Tasks C/D of the plan above) and is out of scope for this migration.
--
-- Why a separate table rather than a column on wrr_items: a line has up to
-- expected_qty independently scannable units — inherently one-to-many, not
-- a single value. The UNIQUE (wrr_item_id, unit_id) constraint is the real
-- enforcement mechanism: a second INSERT of the same pair fails at the
-- database level, not just in application logic that a retry/race could
-- bypass.
--
-- This is a brand-new table (not covered by 0008_rls_policies.sql's
-- blanket RLS enable, which only applies to tables that already existed at
-- that point in the migration chain) — RLS is enabled/forced here, in the
-- same migration that creates the table, matching the pattern established
-- in 0013_transfer_and_inspection_tables.sql for its five new tables.
--
-- RLS gates INSERT and SELECT on 'receiving', 'scan', 'global' — the exact
-- same capability recordScan (lib/actions/receiving.ts) already requires
-- for floor scanning, already seeded in 0005_rbac_constraints_and_seed.sql
-- and already granted to warehouse_staff/supervisor. No new capability
-- string is introduced, per the completion plan's "Global constraints".
-- No UPDATE or DELETE policy: a recorded unit scan is an append-only fact
-- (mirrors 0012/0014's "no DELETE policy — denied by default" convention;
-- there is no legitimate app-layer path that edits or removes a scan row
-- once posted).
--
-- Follows the exact style established in
-- 0012_receiving_disposition_and_policies.sql and
-- 0022_receiving_inventory_insert_policies.sql: rbac_internal.has_permission
-- for capability checks, auth.uid() for actor identity where relevant,
-- explicit narrow GRANTs, --> statement-breakpoint between statements.

-- ===========================================================================
-- 1. wrr_item_unit_scans table.
-- ===========================================================================

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

-- ===========================================================================
-- 2. Row-Level Security.
--    New table — ENABLE/FORCE here rather than relying on 0008's blanket
--    enable, which predates this table's existence.
-- ===========================================================================

ALTER TABLE public.wrr_item_unit_scans ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.wrr_item_unit_scans FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- ===========================================================================
-- 3. SELECT policy.
--    Same capability recordScan already requires for floor scanning.
-- ===========================================================================

CREATE POLICY wrr_item_unit_scans_select ON public.wrr_item_unit_scans
  FOR SELECT TO authenticated
  USING (
    rbac_internal.has_permission('receiving', 'scan', 'global')
  );
--> statement-breakpoint

-- ===========================================================================
-- 4. INSERT policy.
--    rbac-rls-reviewer finding (2026-08-11): an earlier draft of this policy
--    omitted the parent-status gate on the theory that the wrr_items UPDATE
--    policy (0012, gated on wd.status = 'receiving_in_progress') already
--    enforces it "in the same transaction." That reasoning does not hold
--    under Postgres RLS: a zero-row UPDATE (e.g. because the WRR is not
--    receiving_in_progress) does not raise an error or abort the
--    transaction, so it cannot block a separate INSERT statement here. Fixed
--    by mirroring wrr_inspection_logs_insert's own EXISTS-based status gate
--    (0012) directly in this policy's WITH CHECK, joined through wrr_items
--    since this table has no wrr_id column of its own — the same
--    'no cross-statement enforcement, check it here' discipline used
--    throughout 0012/0022.
--    Also binds scanned_by_user_id = auth.uid() (when supplied), matching
--    wrr_documents_insert's staged_by_user_id = auth.uid() precedent (0012)
--    for actor-attribution fields — this table exists specifically to
--    attribute which user scanned which physical label, so the DB layer
--    should not allow that attribution to be spoofed to an arbitrary other
--    user's id.
-- ===========================================================================

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

-- ===========================================================================
-- 5. Explicit narrow grants.
--    No DELETE/UPDATE grant — denied by default, no policy exists for either.
-- ===========================================================================

GRANT SELECT, INSERT ON public.wrr_item_unit_scans TO authenticated;

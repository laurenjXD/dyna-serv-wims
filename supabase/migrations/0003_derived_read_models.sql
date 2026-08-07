-- specs/01-core-data-model/design.md §3 item 4
--
-- Four derived read-model contracts left open after 0001/0002:
--   1. master_inventory_tracking            (+ master_inventory_tracking_financial)
--   2. lot_history_export
--   3. location_transaction_ledger
--   4. party_transaction_ledger
--
-- All four are implemented as plain hand-written SQL VIEWs, matching the
-- pattern already established by `lot_inventory_totals` in
-- 0002_lot_inventory_totals_and_indexes.sql (Drizzle-kit does not generate
-- views, so these are never Drizzle-managed tables). #1 and #2 are broad
-- read models with no single-record key, so an unparameterized VIEW is the
-- obvious fit. #3 and #4 are described in design.md as being "parameterized"
-- by :location_id / :party_id, but design.md itself calls both "a
-- straightforward filter over existing ... columns, requiring no schema
-- change" and explicitly allows "unparameterized views filtered at the
-- query layer" as an equally valid implementation — the same shape as
-- `lot_inventory_totals` (an unparameterized aggregate view, filtered by
-- lot_id at the query layer downstream). Postgres SQL functions would add a
-- second, less-consistent read-model mechanism in this schema for no
-- behavioral gain here (no per-call business logic, no side effects, no
-- recursive/procedural need) — a plain VIEW exposing `location_id` /
-- `party_id` columns for the consumer to filter on is simpler, is queryable
-- with ordinary `WHERE`/pagination like every other read model in this
-- schema, and is what RLS policies (owned by 02) can be attached to
-- directly. Views were chosen for all four for this reason.

-- ---------------------------------------------------------------------------
-- 1a. master_inventory_tracking — non-financial projection.
--
-- Keyed by (lot_location_balance row) = (lot_number, location); exposes
-- item/category, flow_type, derived quantities (mirroring
-- lot_inventory_totals' qty_available formula at the per-location grain
-- instead of the lot-aggregate grain), FEFO/FIFO ordering metadata, and the
-- displayed_item_code / item_code_is_provisional resolution exactly as
-- specified in design.md §3 item 4.
--
-- `fefo_fifo_rank` is ordering METADATA only — it ranks all lots of a given
-- (item_id, flow_type) by expiry_date then created_at regardless of
-- `lots.status`. Per design.md §3 item 3, real FIFO/FEFO allocation
-- eligibility still requires filtering to `lots.status = 'available'`
-- first; this view does not encode that eligibility gate itself, it only
-- provides the tie-break ordering once the caller has already filtered.
-- ---------------------------------------------------------------------------

CREATE VIEW master_inventory_tracking AS
SELECT
  llb.id AS lot_location_balance_id,
  l.id AS lot_id,
  l.lot_number,
  l.flow_type,
  l.status AS lot_status,
  l.owner_party_id,
  l.expiry_date,
  l.manufacture_date,
  l.created_at AS lot_created_at,
  i.id AS item_id,
  i.code AS item_code,
  i.name AS item_name,
  i.supplier_item_code,
  i.dsgc_item_number,
  CASE l.flow_type
    WHEN 'vmi' THEN COALESCE(i.supplier_item_code, i.code)
    ELSE            COALESCE(i.dsgc_item_number, i.code)
  END AS displayed_item_code,
  CASE l.flow_type
    WHEN 'vmi' THEN i.supplier_item_code IS NULL
    ELSE            i.dsgc_item_number IS NULL
  END AS item_code_is_provisional,
  ic.id AS category_id,
  ic.name AS category_name,
  loc.id AS location_id,
  loc.label AS location_label,
  loc.location_type,
  llb.qty_received,
  llb.qty_remaining,
  llb.qty_committed,
  (llb.qty_remaining - llb.qty_committed) AS qty_available,
  ROW_NUMBER() OVER (
    PARTITION BY l.item_id, l.flow_type
    ORDER BY l.expiry_date ASC NULLS LAST, l.created_at ASC
  ) AS fefo_fifo_rank
FROM lot_location_balances llb
JOIN lots l ON l.id = llb.lot_id
JOIN items i ON i.id = l.item_id
LEFT JOIN item_categories ic ON ic.id = i.category_id
JOIN locations loc ON loc.id = llb.location_id;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 1b. master_inventory_tracking_financial — separate financial projection.
--
-- design.md §3 item 4 requires financial columns to be "a separate
-- projection" so that "a user without the approved financial grant receives
-- no financial columns, not merely null values" — RLS enforcement of that
-- grant belongs to 02-rbac-roles, applied to THIS view (never baked into
-- master_inventory_tracking itself, which stays financial-free).
--
-- This view intentionally exposes only the raw priced/cost fields already
-- on `lots`/`items` (unit_cost, buying_price, selling_price, currency) and
-- does NOT compute revenue/profit/margin. Per 00-steering/revision-log.md,
-- VMI's real bill is always the period average, never a single row/document
-- total, and Trading margin/VMI billing methodology is not something 01
-- owns or has a settled computation for — baking a per-row "profit"/"margin"
-- column here would silently invent a computation this spec does not own.
-- 02/16 join this view to lot_location_balance_id / lot_id / item_id and
-- apply their own gated computation.
-- ---------------------------------------------------------------------------

CREATE VIEW master_inventory_tracking_financial AS
SELECT
  llb.id AS lot_location_balance_id,
  l.id AS lot_id,
  i.id AS item_id,
  l.flow_type,
  i.currency,
  l.unit_cost,
  i.buying_price,
  i.selling_price
FROM lot_location_balances llb
JOIN lots l ON l.id = llb.lot_id
JOIN items i ON i.id = l.item_id;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2. lot_history_export — one detail row per connected inventory_transaction,
--    inspection/disposition record, and current-balance reference. Keyed by
--    the business `lot_number` (not `lots.id`), because a non-conformance
--    inspection observation may exist with NO corresponding `lots` row at
--    all (design.md §3 item 14: on non_conformance, inventory balance is
--    NOT incremented and no active lot is created) — the business
--    `wrr_items.lot_number` is the only identity such a row can be
--    connected to. `lots.created_at` is never used for aging (metadata
--    only, per design.md); `earliest_confirmed_receiving_at` is exposed on
--    every row instead, computed as the earliest `movement_type =
--    'receiving'` `inventory_transactions.created_at` connected to the same
--    `lot_number`, so the report layer computes aging as `as_of -
--    earliest_confirmed_receiving_at` without this view hardcoding a
--    specific `as_of` (16-reporting-and-analytics refreshes this daily).
--
-- Inspection rows are connected via `wrr_inspection_logs.wrr_item_id` ->
-- `wrr_items.lot_number`. `wrr_item_id` is nullable on
-- `wrr_inspection_logs`; a log row with no `wrr_item_id` cannot be tied to
-- any `lot_number` and is intentionally excluded from this export (there is
-- no lot-scoped identity to attach it to) — an INNER JOIN, not a LEFT JOIN,
-- expresses that exclusion.
--
-- A grouped summary projection is deliberately NOT implemented here — per
-- design.md, it is "an additional projection" only, never a substitute for
-- these detail rows, and is not one of the four read models this task asks
-- for.
-- ---------------------------------------------------------------------------

CREATE VIEW lot_history_export AS
SELECT
  l.lot_number,
  'transaction'::text AS source_type,
  it.id AS source_id,
  it.item_id,
  it.flow_type,
  it.created_at AS event_at,
  it.movement_type,
  it.qty,
  it.from_location_id,
  it.to_location_id,
  NULL::uuid AS location_id,
  NULL::conformance_status AS conformance_status,
  NULL::non_conformance_reason AS non_conformance_reason,
  NULL::varchar(50) AS action_taken,
  it.performed_by_user_id AS actor_user_id,
  COALESCE(it.commercial_invoice_no, it.ar_reference_no) AS reference,
  NULL::integer AS qty_received,
  NULL::integer AS qty_remaining,
  NULL::integer AS qty_committed,
  NULL::integer AS qty_available,
  (
    SELECT MIN(it2.created_at)
    FROM inventory_transactions it2
    JOIN lots l2 ON l2.id = it2.lot_id
    WHERE l2.lot_number = l.lot_number AND it2.movement_type = 'receiving'
  ) AS earliest_confirmed_receiving_at
FROM inventory_transactions it
JOIN lots l ON l.id = it.lot_id

UNION ALL

SELECT
  wi.lot_number,
  'inspection'::text AS source_type,
  wil.id AS source_id,
  wil.item_id,
  wd.flow_type,
  wil.created_at AS event_at,
  NULL::movement_type AS movement_type,
  NULL::integer AS qty,
  NULL::uuid AS from_location_id,
  NULL::uuid AS to_location_id,
  NULL::uuid AS location_id,
  wil.conformance_status,
  wil.non_conformance_reason,
  wil.action_taken,
  wil.inspector_user_id AS actor_user_id,
  wd.commercial_invoice_no AS reference,
  NULL::integer AS qty_received,
  NULL::integer AS qty_remaining,
  NULL::integer AS qty_committed,
  NULL::integer AS qty_available,
  (
    SELECT MIN(it2.created_at)
    FROM inventory_transactions it2
    JOIN lots l2 ON l2.id = it2.lot_id
    WHERE l2.lot_number = wi.lot_number AND it2.movement_type = 'receiving'
  ) AS earliest_confirmed_receiving_at
FROM wrr_inspection_logs wil
JOIN wrr_items wi ON wi.id = wil.wrr_item_id
JOIN wrr_documents wd ON wd.id = wil.wrr_id

UNION ALL

SELECT
  l.lot_number,
  'balance'::text AS source_type,
  llb.id AS source_id,
  l.item_id,
  l.flow_type,
  llb.updated_at AS event_at,
  NULL::movement_type AS movement_type,
  NULL::integer AS qty,
  NULL::uuid AS from_location_id,
  NULL::uuid AS to_location_id,
  llb.location_id,
  NULL::conformance_status AS conformance_status,
  NULL::non_conformance_reason AS non_conformance_reason,
  NULL::varchar(50) AS action_taken,
  NULL::uuid AS actor_user_id,
  NULL::varchar(100) AS reference,
  llb.qty_received,
  llb.qty_remaining,
  llb.qty_committed,
  (llb.qty_remaining - llb.qty_committed) AS qty_available,
  (
    SELECT MIN(it2.created_at)
    FROM inventory_transactions it2
    JOIN lots l2 ON l2.id = it2.lot_id
    WHERE l2.lot_number = l.lot_number AND it2.movement_type = 'receiving'
  ) AS earliest_confirmed_receiving_at
FROM lot_location_balances llb
JOIN lots l ON l.id = llb.lot_id;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 3. location_transaction_ledger (added 2026-08-07) — all
--    inventory_transactions rows where from_location_id = :location_id OR
--    to_location_id = :location_id, exposed as an unparameterized VIEW with
--    a `location_id` column for the consumer to filter on (see header note).
--
-- Implemented as UNION ALL of the "from" side (direction = 'out') and the
-- "to" side (direction = 'in') rather than a single OR-filtered SELECT,
-- because a single transaction row participates in the ledger of BOTH its
-- from- and to-location (a transfer between A and B belongs in A's ledger
-- as 'out' AND in B's ledger as 'in') — an OR filter without the UNION
-- would only ever be able to report one direction per queried location per
-- row, not two independent rows.
-- ---------------------------------------------------------------------------

CREATE VIEW location_transaction_ledger AS
SELECT
  it.id AS transaction_id,
  it.from_location_id AS location_id,
  'out'::text AS direction,
  it.movement_type,
  it.qty,
  it.item_id,
  i.code AS item_code,
  i.name AS item_name,
  it.lot_id,
  l.lot_number,
  it.performed_by_user_id,
  it.created_at,
  COALESCE(it.commercial_invoice_no, it.ar_reference_no) AS reference
FROM inventory_transactions it
JOIN items i ON i.id = it.item_id
JOIN lots l ON l.id = it.lot_id
WHERE it.from_location_id IS NOT NULL

UNION ALL

SELECT
  it.id AS transaction_id,
  it.to_location_id AS location_id,
  'in'::text AS direction,
  it.movement_type,
  it.qty,
  it.item_id,
  i.code AS item_code,
  i.name AS item_name,
  it.lot_id,
  l.lot_number,
  it.performed_by_user_id,
  it.created_at,
  COALESCE(it.commercial_invoice_no, it.ar_reference_no) AS reference
FROM inventory_transactions it
JOIN items i ON i.id = it.item_id
JOIN lots l ON l.id = it.lot_id
WHERE it.to_location_id IS NOT NULL;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 4. party_transaction_ledger (added 2026-08-07) — union of three sources,
--    exposed as an unparameterized VIEW with a `party_id` column for the
--    consumer to filter on (see header note):
--
--    (a) vendor   — inventory_transactions joined to wrr_documents via
--                    wrr_id, party_id = wrr_documents.vendor_party_id.
--    (b) customer — inventory_transactions joined to pick_lists via
--                    pick_list_id, party_id = pick_lists.customer_party_id.
--    (c) vmi_ownership — inventory_transactions joined to lots via lot_id,
--                    party_id = lots.owner_party_id, for VMI ownership
--                    movements NOT already tied to a specific WRR or pick
--                    list (e.g. internal transfers of VMI-owned lots).
--                    wrr_id IS NULL AND pick_list_id IS NULL is enforced
--                    here specifically to avoid double-reporting the same
--                    transaction under both its (a)/(b) source AND this
--                    source when a VMI lot's owner_party_id happens to
--                    equal the same party already covered by (a) or (b).
-- ---------------------------------------------------------------------------

CREATE VIEW party_transaction_ledger AS
SELECT
  it.id AS transaction_id,
  wd.vendor_party_id AS party_id,
  'vendor'::text AS source,
  it.movement_type,
  it.qty,
  it.item_id,
  i.code AS item_code,
  i.name AS item_name,
  it.lot_id,
  l.lot_number,
  it.performed_by_user_id,
  it.created_at,
  COALESCE(it.commercial_invoice_no, it.ar_reference_no) AS reference
FROM inventory_transactions it
JOIN wrr_documents wd ON wd.id = it.wrr_id
JOIN items i ON i.id = it.item_id
JOIN lots l ON l.id = it.lot_id

UNION ALL

SELECT
  it.id AS transaction_id,
  pl.customer_party_id AS party_id,
  'customer'::text AS source,
  it.movement_type,
  it.qty,
  it.item_id,
  i.code AS item_code,
  i.name AS item_name,
  it.lot_id,
  l.lot_number,
  it.performed_by_user_id,
  it.created_at,
  COALESCE(it.commercial_invoice_no, it.ar_reference_no) AS reference
FROM inventory_transactions it
JOIN pick_lists pl ON pl.id = it.pick_list_id
JOIN items i ON i.id = it.item_id
JOIN lots l ON l.id = it.lot_id

UNION ALL

SELECT
  it.id AS transaction_id,
  l.owner_party_id AS party_id,
  'vmi_ownership'::text AS source,
  it.movement_type,
  it.qty,
  it.item_id,
  i.code AS item_code,
  i.name AS item_name,
  it.lot_id,
  l.lot_number,
  it.performed_by_user_id,
  it.created_at,
  COALESCE(it.commercial_invoice_no, it.ar_reference_no) AS reference
FROM inventory_transactions it
JOIN lots l ON l.id = it.lot_id
JOIN items i ON i.id = it.item_id
WHERE l.owner_party_id IS NOT NULL
  AND it.wrr_id IS NULL
  AND it.pick_list_id IS NULL;

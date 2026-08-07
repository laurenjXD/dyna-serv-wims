-- specs/01-core-data-model/design.md §1.2 / §3
--
-- 1. `lot_inventory_totals` — derived aggregate read model over
--    `lot_location_balances`, grouped by `lot_id`. Drizzle-kit does not
--    generate views from table definitions (it only introspects/diffs
--    `pgTable` definitions), so this VIEW is hand-written here rather than
--    left as a stored column or a second inventory ledger. `qty_available`
--    is computed at read time and is never stored on any table.
--
-- 2. Performance indexes on foreign-key and frequently-filtered columns.
--    Postgres does NOT automatically index the referencing side of a
--    foreign key (only the referenced primary/unique key is indexed), so
--    every FK column that will be joined or filtered on in hot paths
--    (FIFO/FEFO allocation, Master Inventory drill-down, ledger lookups,
--    party/location transaction ledgers) gets an explicit btree index here.
--    Unique constraints already generated in 0001 (e.g. `items.code`,
--    `items.barcode`, `locations.label`, `lot_location_balances(lot_id,
--    location_id)`) already carry their own supporting index and are not
--    duplicated below.
--
-- Note on `lots.lot_number` / `wrr_items.lot_number` uniqueness: per
-- requirements.md §6 ("`lot_number` MUST NOT be globally unique... same
-- business lot number may recur across distinct WRR receipts or items")
-- and tasks.md's second db-migration-verifier pass (2026-08-05, "not a
-- gap" finding), no uniqueness constraint is added on either lot_number
-- column — the UUID primary key remains the sole identity. Plain
-- (non-unique) lookup indexes are still added below since lot_number is a
-- common search/filter key on the Master Inventory and receiving screens.

CREATE VIEW lot_inventory_totals AS
SELECT
  lot_id,
  SUM(qty_received)  AS qty_received,
  SUM(qty_remaining) AS qty_remaining,
  SUM(qty_committed) AS qty_committed,
  SUM(qty_remaining) - SUM(qty_committed) AS qty_available
FROM lot_location_balances
GROUP BY lot_id;
--> statement-breakpoint

-- parties / party_roles
CREATE INDEX "party_roles_party_id_idx" ON "party_roles" USING btree ("party_id");
--> statement-breakpoint
CREATE INDEX "party_roles_role_idx" ON "party_roles" USING btree ("role");
--> statement-breakpoint

-- items
CREATE INDEX "items_category_id_idx" ON "items" USING btree ("category_id");
--> statement-breakpoint
CREATE INDEX "items_default_supplier_party_id_idx" ON "items" USING btree ("default_supplier_party_id");
--> statement-breakpoint

-- item_categories
CREATE INDEX "item_categories_parent_id_idx" ON "item_categories" USING btree ("parent_id");
--> statement-breakpoint
CREATE INDEX "item_categories_flow_type_idx" ON "item_categories" USING btree ("flow_type");
--> statement-breakpoint

-- lots — flow_type is the partition-scoping column: every FIFO/FEFO and
-- Master Inventory query filters on it, so it is never a full scan.
CREATE INDEX "lots_flow_type_idx" ON "lots" USING btree ("flow_type");
--> statement-breakpoint
CREATE INDEX "lots_status_idx" ON "lots" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "lots_wrr_item_id_idx" ON "lots" USING btree ("wrr_item_id");
--> statement-breakpoint
CREATE INDEX "lots_item_id_idx" ON "lots" USING btree ("item_id");
--> statement-breakpoint
CREATE INDEX "lots_owner_party_id_idx" ON "lots" USING btree ("owner_party_id");
--> statement-breakpoint
CREATE INDEX "lots_lot_number_idx" ON "lots" USING btree ("lot_number");
--> statement-breakpoint
-- FEFO ordering: available lots sorted by expiry_date ascending, scoped by flow_type
CREATE INDEX "lots_flow_type_status_expiry_idx" ON "lots" USING btree ("flow_type", "status", "expiry_date");
--> statement-breakpoint

-- lot_location_balances — the unique(lot_id, location_id) constraint from
-- 0001 already supports lot_id-first lookups; location_id-first lookups
-- (e.g. "what's stored at A1-01") need their own index.
CREATE INDEX "lot_location_balances_location_id_idx" ON "lot_location_balances" USING btree ("location_id");
--> statement-breakpoint

-- inventory_commitments / inventory_commitment_lines
CREATE INDEX "inventory_commitments_status_idx" ON "inventory_commitments" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "inventory_commitment_lines_commitment_id_idx" ON "inventory_commitment_lines" USING btree ("commitment_id");
--> statement-breakpoint
CREATE INDEX "inventory_commitment_lines_pick_list_item_id_idx" ON "inventory_commitment_lines" USING btree ("pick_list_item_id");
--> statement-breakpoint
CREATE INDEX "inventory_commitment_lines_lot_location_balance_id_idx" ON "inventory_commitment_lines" USING btree ("lot_location_balance_id");
--> statement-breakpoint
CREATE INDEX "inventory_commitment_lines_status_idx" ON "inventory_commitment_lines" USING btree ("status");
--> statement-breakpoint

-- wrr_documents / wrr_items / wrr_inspection_logs
CREATE INDEX "wrr_documents_vendor_party_id_idx" ON "wrr_documents" USING btree ("vendor_party_id");
--> statement-breakpoint
CREATE INDEX "wrr_documents_flow_type_idx" ON "wrr_documents" USING btree ("flow_type");
--> statement-breakpoint
CREATE INDEX "wrr_documents_status_idx" ON "wrr_documents" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "wrr_items_wrr_id_idx" ON "wrr_items" USING btree ("wrr_id");
--> statement-breakpoint
CREATE INDEX "wrr_items_item_id_idx" ON "wrr_items" USING btree ("item_id");
--> statement-breakpoint
CREATE INDEX "wrr_items_lot_number_idx" ON "wrr_items" USING btree ("lot_number");
--> statement-breakpoint
CREATE INDEX "wrr_inspection_logs_wrr_id_idx" ON "wrr_inspection_logs" USING btree ("wrr_id");
--> statement-breakpoint
CREATE INDEX "wrr_inspection_logs_wrr_item_id_idx" ON "wrr_inspection_logs" USING btree ("wrr_item_id");
--> statement-breakpoint
CREATE INDEX "wrr_inspection_logs_item_id_idx" ON "wrr_inspection_logs" USING btree ("item_id");
--> statement-breakpoint
CREATE INDEX "wrr_inspection_logs_vendor_party_id_idx" ON "wrr_inspection_logs" USING btree ("vendor_party_id");
--> statement-breakpoint
CREATE INDEX "wrr_inspection_logs_conformance_status_idx" ON "wrr_inspection_logs" USING btree ("conformance_status");
--> statement-breakpoint

-- inventory_transactions — the single differentiated ledger; every hot
-- query (lot history, location movement ledger, party transaction ledger,
-- vendor/customer traceability) filters on one or more of these.
CREATE INDEX "inventory_transactions_lot_id_idx" ON "inventory_transactions" USING btree ("lot_id");
--> statement-breakpoint
CREATE INDEX "inventory_transactions_item_id_idx" ON "inventory_transactions" USING btree ("item_id");
--> statement-breakpoint
CREATE INDEX "inventory_transactions_from_location_id_idx" ON "inventory_transactions" USING btree ("from_location_id");
--> statement-breakpoint
CREATE INDEX "inventory_transactions_to_location_id_idx" ON "inventory_transactions" USING btree ("to_location_id");
--> statement-breakpoint
CREATE INDEX "inventory_transactions_wrr_id_idx" ON "inventory_transactions" USING btree ("wrr_id");
--> statement-breakpoint
CREATE INDEX "inventory_transactions_pick_list_id_idx" ON "inventory_transactions" USING btree ("pick_list_id");
--> statement-breakpoint
CREATE INDEX "inventory_transactions_movement_type_idx" ON "inventory_transactions" USING btree ("movement_type");
--> statement-breakpoint
CREATE INDEX "inventory_transactions_flow_type_idx" ON "inventory_transactions" USING btree ("flow_type");
--> statement-breakpoint
CREATE INDEX "inventory_transactions_created_at_idx" ON "inventory_transactions" USING btree ("created_at");
--> statement-breakpoint

-- pick_lists / pick_list_items
CREATE INDEX "pick_lists_customer_party_id_idx" ON "pick_lists" USING btree ("customer_party_id");
--> statement-breakpoint
CREATE INDEX "pick_lists_flow_type_idx" ON "pick_lists" USING btree ("flow_type");
--> statement-breakpoint
CREATE INDEX "pick_lists_status_idx" ON "pick_lists" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "pick_list_items_pick_list_id_idx" ON "pick_list_items" USING btree ("pick_list_id");
--> statement-breakpoint
CREATE INDEX "pick_list_items_item_id_idx" ON "pick_list_items" USING btree ("item_id");
--> statement-breakpoint
CREATE INDEX "pick_list_items_lot_id_idx" ON "pick_list_items" USING btree ("lot_id");
--> statement-breakpoint
CREATE INDEX "pick_list_items_location_id_idx" ON "pick_list_items" USING btree ("location_id");
--> statement-breakpoint

-- locations — zone/rack/level/position are not individually unique, but
-- are commonly filtered on the putaway recommendation screen.
CREATE INDEX "locations_location_type_idx" ON "locations" USING btree ("location_type");

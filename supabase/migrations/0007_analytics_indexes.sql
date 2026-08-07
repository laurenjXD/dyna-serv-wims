-- specs/16-reporting-and-analytics/design.md §7.1
--
-- Analytics-specific compound/partial indexes required by the reporting
-- dashboard's query targets. These are additive to the indexes already
-- created in 0002 (single-column FK/status indexes and the
-- `lots(flow_type, status, expiry_date)` FEFO-ordering index) -- none of
-- the indexes below duplicate an existing one; each is a distinct
-- column-order/filter combination that 0002 does not already provide.
--
-- Do not modify 0001-0005; this file only adds new indexes.

-- inventory_transactions — heatmap filter and movement-type breakdowns
CREATE INDEX "inventory_transactions_flow_type_created_at_idx"
  ON "inventory_transactions" USING btree ("flow_type", "created_at");
--> statement-breakpoint
CREATE INDEX "inventory_transactions_movement_type_created_at_idx"
  ON "inventory_transactions" USING btree ("movement_type", "created_at");
--> statement-breakpoint

-- lots — lot status distribution / flow partition view, and low stock
-- item rollup. Distinct column order/purpose from 0002's
-- `lots_flow_type_status_expiry_idx` (which is FEFO-ordering scoped by
-- flow_type first); these two are additive, not replacements.
CREATE INDEX "lots_status_flow_type_idx"
  ON "lots" USING btree ("status", "flow_type");
--> statement-breakpoint
CREATE INDEX "lots_item_id_status_idx"
  ON "lots" USING btree ("item_id", "status");
--> statement-breakpoint

-- lots — stock aging / FIFO-FEFO queue health. Partial index scoped to
-- available lots only, since expiry-based aging queries never care about
-- lots that are already committed, dispatched, or exhausted.
CREATE INDEX "lots_expiry_date_available_idx"
  ON "lots" USING btree ("expiry_date")
  WHERE "status" = 'available';
--> statement-breakpoint

-- wrr_documents — WRR volume trend, cycle time
CREATE INDEX "wrr_documents_created_at_status_idx"
  ON "wrr_documents" USING btree ("created_at", "status");
--> statement-breakpoint

-- wrr_inspection_logs — inspection outcome breakdown
CREATE INDEX "wrr_inspection_logs_conformance_status_created_at_idx"
  ON "wrr_inspection_logs" USING btree ("conformance_status", "created_at");
--> statement-breakpoint

-- pick_lists — pick list volume trend, dispatch rate
CREATE INDEX "pick_lists_status_created_at_flow_type_idx"
  ON "pick_lists" USING btree ("status", "created_at", "flow_type");

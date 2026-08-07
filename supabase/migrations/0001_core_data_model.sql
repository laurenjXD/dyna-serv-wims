CREATE TYPE "public"."commitment_status" AS ENUM('active', 'inspection_pending', 'executed', 'released', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."conformance_status" AS ENUM('pending', 'conformance', 'non_conformance');--> statement-breakpoint
CREATE TYPE "public"."flow_type" AS ENUM('vmi', 'trading', 'supplies');--> statement-breakpoint
CREATE TYPE "public"."location_type" AS ENUM('receiving_bay', 'inspection', 'storage', 'picking', 'dispatch');--> statement-breakpoint
CREATE TYPE "public"."lot_status" AS ENUM('staged', 'available', 'quarantined', 'depleted', 'expired');--> statement-breakpoint
CREATE TYPE "public"."movement_type" AS ENUM('receiving', 'putaway', 'pick', 'transfer', 'inventory_reconciliation');--> statement-breakpoint
CREATE TYPE "public"."non_conformance_reason" AS ENUM('tdc_defect', 'quantity_mismatch', 'damaged_carton', 'wrong_item_code', 'missing_paperwork', 'other');--> statement-breakpoint
CREATE TYPE "public"."party_role" AS ENUM('vendor', 'supplier', 'customer', 'end_customer', 'internal_warehouse');--> statement-breakpoint
CREATE TYPE "public"."pick_list_status" AS ENUM('allocated', 'picked', 'dispatched');--> statement-breakpoint
CREATE TYPE "public"."wrr_status" AS ENUM('staged_pending_arrival', 'receiving_in_progress', 'confirmed', 'cancelled');--> statement-breakpoint
CREATE TABLE "parties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"contact_person" varchar(255),
	"email" varchar(255),
	"phone" varchar(50),
	"tax_id" varchar(50),
	"address" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "parties_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "party_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"party_id" uuid NOT NULL,
	"role" "party_role" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"flow_type" "flow_type",
	"parent_id" uuid,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(100) NOT NULL,
	"supplier_item_code" varchar(100),
	"customer_item_code" varchar(100),
	"dsgc_item_number" varchar(100),
	"name" varchar(255) NOT NULL,
	"description" text,
	"barcode" varchar(100) NOT NULL,
	"item_type" varchar(50) DEFAULT 'standard' NOT NULL,
	"category_id" uuid,
	"default_supplier_party_id" uuid,
	"uom" varchar(50) DEFAULT 'piece' NOT NULL,
	"currency" varchar(10) DEFAULT 'USD' NOT NULL,
	"buying_price" numeric(12, 4),
	"selling_price" numeric(12, 4),
	"spq" integer DEFAULT 1 NOT NULL,
	"spq_meter" numeric(10, 2),
	"length_cm" numeric(10, 2),
	"width_cm" numeric(10, 2),
	"height_cm" numeric(10, 2),
	"volume_cm3" numeric(12, 2),
	"volume_cbm" numeric(10, 4) NOT NULL,
	"boxes_per_pallet" integer,
	"weight_kg" numeric(10, 3),
	"min_reorder_level" integer DEFAULT 0 NOT NULL,
	"is_perishable" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "items_code_unique" UNIQUE("code"),
	CONSTRAINT "items_barcode_unique" UNIQUE("barcode"),
	CONSTRAINT "items_spq_positive" CHECK ("items"."spq" > 0),
	CONSTRAINT "items_volume_cbm_positive" CHECK ("items"."volume_cbm" > 0)
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zone" varchar(50) NOT NULL,
	"rack" varchar(50) NOT NULL,
	"level" varchar(50) NOT NULL,
	"position" varchar(50) NOT NULL,
	"label" varchar(100) NOT NULL,
	"location_type" "location_type" DEFAULT 'storage' NOT NULL,
	"max_cbm_capacity" numeric(10, 4) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "locations_label_unique" UNIQUE("label")
);
--> statement-breakpoint
CREATE TABLE "lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lot_number" varchar(100) NOT NULL,
	"wrr_item_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"flow_type" "flow_type" NOT NULL,
	"owner_party_id" uuid,
	"status" "lot_status" DEFAULT 'staged' NOT NULL,
	"peza_number" varchar(100),
	"commercial_invoice_no" varchar(100),
	"ip_number" varchar(100),
	"manufacture_date" date,
	"expiry_date" date,
	"unit_cost" numeric(12, 4),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lot_location_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lot_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"qty_received" integer NOT NULL,
	"qty_remaining" integer NOT NULL,
	"qty_committed" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lot_location_balances_lot_id_location_id_unique" UNIQUE("lot_id","location_id"),
	CONSTRAINT "qty_received_non_negative" CHECK ("lot_location_balances"."qty_received" >= 0),
	CONSTRAINT "qty_remaining_non_negative" CHECK ("lot_location_balances"."qty_remaining" >= 0),
	CONSTRAINT "qty_committed_within_remaining" CHECK ("lot_location_balances"."qty_committed" >= 0 AND "lot_location_balances"."qty_committed" <= "lot_location_balances"."qty_remaining")
);
--> statement-breakpoint
CREATE TABLE "inventory_commitment_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"commitment_id" uuid NOT NULL,
	"pick_list_item_id" uuid NOT NULL,
	"lot_location_balance_id" uuid NOT NULL,
	"qty_committed" integer NOT NULL,
	"qty_executed" integer DEFAULT 0 NOT NULL,
	"status" "commitment_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "qty_committed_positive" CHECK ("inventory_commitment_lines"."qty_committed" > 0),
	CONSTRAINT "qty_executed_within_committed" CHECK ("inventory_commitment_lines"."qty_executed" >= 0 AND "inventory_commitment_lines"."qty_executed" <= "inventory_commitment_lines"."qty_committed")
);
--> statement-breakpoint
CREATE TABLE "inventory_commitments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"commitment_number" varchar(50) NOT NULL,
	"pick_list_id" uuid NOT NULL,
	"status" "commitment_status" DEFAULT 'active' NOT NULL,
	"expires_at" timestamp,
	"created_by_user_id" uuid NOT NULL,
	"released_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_commitments_commitment_number_unique" UNIQUE("commitment_number"),
	CONSTRAINT "inventory_commitments_pick_list_id_unique" UNIQUE("pick_list_id")
);
--> statement-breakpoint
CREATE TABLE "wrr_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wrr_number" varchar(50) NOT NULL,
	"commercial_invoice_no" varchar(100),
	"cipl_file_url" text,
	"peza_number" varchar(100),
	"ip_number" varchar(100),
	"mawb_mbl_number" varchar(100),
	"vendor_party_id" uuid NOT NULL,
	"flow_type" "flow_type" NOT NULL,
	"status" "wrr_status" DEFAULT 'staged_pending_arrival' NOT NULL,
	"staged_by_user_id" uuid NOT NULL,
	"confirmed_by_user_id" uuid,
	"confirmed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wrr_documents_wrr_number_unique" UNIQUE("wrr_number")
);
--> statement-breakpoint
CREATE TABLE "wrr_inspection_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wrr_id" uuid NOT NULL,
	"wrr_item_id" uuid,
	"item_id" uuid NOT NULL,
	"vendor_party_id" uuid NOT NULL,
	"inspector_user_id" uuid NOT NULL,
	"conformance_status" "conformance_status" NOT NULL,
	"non_conformance_reason" "non_conformance_reason",
	"remarks" text,
	"evidence_photo_url" text,
	"action_taken" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wrr_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wrr_id" uuid NOT NULL,
	"item_id" uuid,
	"item_code" varchar(100),
	"customer_item_code" varchar(100),
	"lot_number" varchar(100) NOT NULL,
	"expected_qty" integer NOT NULL,
	"scanned_qty" integer DEFAULT 0 NOT NULL,
	"unit_cbm" numeric(10, 4) NOT NULL,
	"uom" varchar(50) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forex_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"effective_date" date NOT NULL,
	"usd_to_php_rate" numeric(10, 4) NOT NULL,
	"source" varchar(100) DEFAULT 'manual' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "forex_rates_effective_date_unique" UNIQUE("effective_date")
);
--> statement-breakpoint
CREATE TABLE "inventory_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_number" varchar(50) NOT NULL,
	"lot_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"movement_type" "movement_type" NOT NULL,
	"from_location_id" uuid,
	"to_location_id" uuid,
	"qty" integer NOT NULL,
	"flow_type" "flow_type" NOT NULL,
	"commercial_invoice_no" varchar(100),
	"ar_reference_no" varchar(100),
	"wrr_id" uuid,
	"pick_list_id" uuid,
	"performed_by_user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_transactions_transaction_number_unique" UNIQUE("transaction_number")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"actor_role" varchar(50) NOT NULL,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(100) NOT NULL,
	"entity_id" uuid NOT NULL,
	"before_data" jsonb,
	"after_data" jsonb,
	"diff_data" jsonb,
	"correlation_id" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_log_payload_present" CHECK ("audit_log"."before_data" IS NOT NULL OR "audit_log"."after_data" IS NOT NULL OR "audit_log"."diff_data" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "pick_list_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pick_list_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"item_code" varchar(100) NOT NULL,
	"customer_item_code" varchar(100),
	"item_description" text,
	"lot_id" uuid NOT NULL,
	"lot_number" varchar(100) NOT NULL,
	"location_id" uuid NOT NULL,
	"location_label" varchar(100) NOT NULL,
	"qty" integer NOT NULL,
	"spq" integer NOT NULL,
	"number_of_boxes" integer NOT NULL,
	"unit_price" numeric(12, 4),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pick_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pick_list_number" varchar(50) NOT NULL,
	"customer_party_id" uuid NOT NULL,
	"flow_type" "flow_type" NOT NULL,
	"status" "pick_list_status" DEFAULT 'allocated' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pick_lists_pick_list_number_unique" UNIQUE("pick_list_number")
);
--> statement-breakpoint
ALTER TABLE "party_roles" ADD CONSTRAINT "party_roles_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_category_id_item_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."item_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_default_supplier_party_id_parties_id_fk" FOREIGN KEY ("default_supplier_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_wrr_item_id_wrr_items_id_fk" FOREIGN KEY ("wrr_item_id") REFERENCES "public"."wrr_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_owner_party_id_parties_id_fk" FOREIGN KEY ("owner_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_location_balances" ADD CONSTRAINT "lot_location_balances_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_location_balances" ADD CONSTRAINT "lot_location_balances_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_commitment_lines" ADD CONSTRAINT "inventory_commitment_lines_commitment_id_inventory_commitments_id_fk" FOREIGN KEY ("commitment_id") REFERENCES "public"."inventory_commitments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_commitment_lines" ADD CONSTRAINT "inventory_commitment_lines_pick_list_item_id_pick_list_items_id_fk" FOREIGN KEY ("pick_list_item_id") REFERENCES "public"."pick_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_commitment_lines" ADD CONSTRAINT "inventory_commitment_lines_lot_location_balance_id_lot_location_balances_id_fk" FOREIGN KEY ("lot_location_balance_id") REFERENCES "public"."lot_location_balances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_commitments" ADD CONSTRAINT "inventory_commitments_pick_list_id_pick_lists_id_fk" FOREIGN KEY ("pick_list_id") REFERENCES "public"."pick_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wrr_documents" ADD CONSTRAINT "wrr_documents_vendor_party_id_parties_id_fk" FOREIGN KEY ("vendor_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wrr_inspection_logs" ADD CONSTRAINT "wrr_inspection_logs_wrr_id_wrr_documents_id_fk" FOREIGN KEY ("wrr_id") REFERENCES "public"."wrr_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wrr_inspection_logs" ADD CONSTRAINT "wrr_inspection_logs_wrr_item_id_wrr_items_id_fk" FOREIGN KEY ("wrr_item_id") REFERENCES "public"."wrr_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wrr_inspection_logs" ADD CONSTRAINT "wrr_inspection_logs_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wrr_inspection_logs" ADD CONSTRAINT "wrr_inspection_logs_vendor_party_id_parties_id_fk" FOREIGN KEY ("vendor_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wrr_items" ADD CONSTRAINT "wrr_items_wrr_id_wrr_documents_id_fk" FOREIGN KEY ("wrr_id") REFERENCES "public"."wrr_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wrr_items" ADD CONSTRAINT "wrr_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_from_location_id_locations_id_fk" FOREIGN KEY ("from_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_to_location_id_locations_id_fk" FOREIGN KEY ("to_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_wrr_id_wrr_documents_id_fk" FOREIGN KEY ("wrr_id") REFERENCES "public"."wrr_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_pick_list_id_pick_lists_id_fk" FOREIGN KEY ("pick_list_id") REFERENCES "public"."pick_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pick_list_items" ADD CONSTRAINT "pick_list_items_pick_list_id_pick_lists_id_fk" FOREIGN KEY ("pick_list_id") REFERENCES "public"."pick_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pick_list_items" ADD CONSTRAINT "pick_list_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pick_list_items" ADD CONSTRAINT "pick_list_items_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pick_list_items" ADD CONSTRAINT "pick_list_items_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pick_lists" ADD CONSTRAINT "pick_lists_customer_party_id_parties_id_fk" FOREIGN KEY ("customer_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_log_correlation_idx" ON "audit_log" USING btree ("correlation_id");
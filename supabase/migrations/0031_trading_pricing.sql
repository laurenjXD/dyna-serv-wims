-- specs/13-trading-orders-and-pricing/design.md §2 (Task 2: data, snapshot,
-- and audit model). Hand-authored in Drizzle's own generated-SQL style
-- (matching lib/db/schema/trading_pricing.ts) because `npx drizzle-kit
-- generate` cannot run cleanly against this repo's already-stale
-- meta/_journal.json (last tracked entry is 0004; every migration since has
-- been hand-authored directly against supabase/migrations, per the same
-- precedent set by 0002 onward) -- running it here produced a colliding
-- "0003_trading_pricing.sql" against the already-existing
-- 0003_derived_read_models.sql and was discarded rather than applied.
--
-- Two tables:
--   1. trading_policies       -- the rate card (R1). No DB-level unique
--      constraint on (party_id, item_id): the "one active policy" invariant
--      is application-layer only, enforced by Task 4's price-resolution
--      engine on the isActive transition, per design.md §2's own comment.
--   2. trading_invoice_lines  -- the frozen transaction record (R2/R3),
--      covering both direction='purchase' and direction='sale' rows in one
--      table. Immutable after locked_at (no updated_at column).
--
-- Real-Postgres verification (constraints, precision, FK targets, RLS) is
-- db-migration-verifier's job next, not this file's.

CREATE TYPE "public"."trading_margin_type" AS ENUM('percentage', 'fixed_amount');--> statement-breakpoint
CREATE TYPE "public"."trading_invoice_direction" AS ENUM('purchase', 'sale');--> statement-breakpoint
CREATE TABLE "trading_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"party_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"buy_cost" numeric(12, 4) NOT NULL,
	"buy_currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"margin_type" "trading_margin_type" NOT NULL,
	"margin_value" numeric(10, 4) NOT NULL,
	"sell_price" numeric(12, 4) NOT NULL,
	"sell_price_is_override" boolean DEFAULT false NOT NULL,
	"sell_currency" varchar(3) DEFAULT 'PHP' NOT NULL,
	"fx_source" varchar(50),
	"is_active" boolean DEFAULT true NOT NULL,
	"effective_from" timestamp DEFAULT now() NOT NULL,
	"effective_to" timestamp,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trading_invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"direction" "trading_invoice_direction" NOT NULL,
	"pick_list_item_id" uuid,
	"supplier_invoice_ref" varchar(100),
	"party_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"qty" numeric(12, 4) NOT NULL,
	"buy_cost" numeric(12, 4) NOT NULL,
	"sell_price" numeric(12, 4),
	"margin_amount" numeric(14, 4),
	"currency" varchar(3) NOT NULL,
	"source_policy_id" uuid,
	"snapshot_hash" varchar(64) NOT NULL,
	"hs_code" varchar(20),
	"locked_at" timestamp NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trading_policies" ADD CONSTRAINT "trading_policies_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_policies" ADD CONSTRAINT "trading_policies_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_invoice_lines" ADD CONSTRAINT "trading_invoice_lines_pick_list_item_id_pick_list_items_id_fk" FOREIGN KEY ("pick_list_item_id") REFERENCES "public"."pick_list_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_invoice_lines" ADD CONSTRAINT "trading_invoice_lines_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_invoice_lines" ADD CONSTRAINT "trading_invoice_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_invoice_lines" ADD CONSTRAINT "trading_invoice_lines_source_policy_id_trading_policies_id_fk" FOREIGN KEY ("source_policy_id") REFERENCES "public"."trading_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trading_policies_party_id_idx" ON "trading_policies" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "trading_policies_item_id_idx" ON "trading_policies" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "trading_policies_party_item_idx" ON "trading_policies" USING btree ("party_id","item_id");--> statement-breakpoint
CREATE INDEX "trading_invoice_lines_party_id_idx" ON "trading_invoice_lines" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "trading_invoice_lines_item_id_idx" ON "trading_invoice_lines" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "trading_invoice_lines_direction_idx" ON "trading_invoice_lines" USING btree ("direction");--> statement-breakpoint
CREATE INDEX "trading_invoice_lines_locked_at_idx" ON "trading_invoice_lines" USING btree ("locked_at");--> statement-breakpoint
CREATE INDEX "trading_invoice_lines_source_policy_id_idx" ON "trading_invoice_lines" USING btree ("source_policy_id");--> statement-breakpoint
CREATE INDEX "trading_invoice_lines_pick_list_item_id_idx" ON "trading_invoice_lines" USING btree ("pick_list_item_id");

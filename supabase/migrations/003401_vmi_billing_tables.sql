CREATE TYPE "public"."vmi_billing_timing" AS ENUM('beginning_of_day', 'end_of_day');--> statement-breakpoint
CREATE TYPE "public"."vmi_cbm_threshold_type" AS ENUM('none', 'minimum_billable', 'included_allowance');--> statement-breakpoint
CREATE TYPE "public"."vmi_charge_source" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TYPE "public"."vmi_charge_type" AS ENUM('documentation', 'delivery', 'handling_and_stripping', 'cargo_transfer_fee', 'rtv', 'admin_fee', 'insurance', 'other');--> statement-breakpoint
CREATE TYPE "public"."vmi_payment_type" AS ENUM('payment', 'credit_memo', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."vmi_recurring_fee_type" AS ENUM('loa', 'surety_bond', 'trucking_admin_fee', 'manpower', 'other');--> statement-breakpoint
CREATE TABLE "vmi_billing_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_number" varchar(50) NOT NULL,
	"party_id" uuid NOT NULL,
	"period_start_date" date NOT NULL,
	"period_end_date" date NOT NULL,
	"storage_charge_usd" numeric(14, 4) NOT NULL,
	"handling_in_usd" numeric(14, 4) NOT NULL,
	"handling_out_usd" numeric(14, 4) NOT NULL,
	"documentation_usd" numeric(14, 4) NOT NULL,
	"delivery_usd" numeric(14, 4) NOT NULL,
	"recurring_fees_usd" numeric(14, 4) NOT NULL,
	"ad_hoc_charges_usd" numeric(14, 4) NOT NULL,
	"credits_applied_usd" numeric(14, 4) DEFAULT '0' NOT NULL,
	"billing_statement_total_usd" numeric(14, 4) NOT NULL,
	"soa_opening_balance_usd" numeric(14, 4) NOT NULL,
	"soa_payments_applied_usd" numeric(14, 4) DEFAULT '0' NOT NULL,
	"soa_closing_balance_usd" numeric(14, 4) NOT NULL,
	"locked_exchange_rate_php" numeric(10, 4) NOT NULL,
	"locked_exchange_rate_date" date NOT NULL,
	"billing_currency" varchar(3) NOT NULL,
	"billing_statement_artifact_id" uuid,
	"warehousing_charges_artifact_id" uuid,
	"soa_artifact_id" uuid,
	"loa_artifact_id" uuid,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"superseded_by_period_id" uuid,
	"closed_by_user_id" uuid,
	"closed_at" timestamp,
	"voided_at" timestamp,
	"voided_by_user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vmi_billing_periods_period_number_unique" UNIQUE("period_number"),
	CONSTRAINT "billing_statement_total_non_negative" CHECK ("vmi_billing_periods"."billing_statement_total_usd" >= 0),
	CONSTRAINT "vmi_billing_periods_status_check" CHECK ("vmi_billing_periods"."status" IN ('draft', 'issued', 'voided'))
);
--> statement-breakpoint
CREATE TABLE "vmi_charge_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"acknowledgement_receipt_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"charge_type" "vmi_charge_type" NOT NULL,
	"amount" numeric(14, 4) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"source" "vmi_charge_source" NOT NULL,
	"charge_date" date NOT NULL,
	"notes" text,
	"recorded_by_user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vmi_contract_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"party_id" uuid NOT NULL,
	"storage_rate_per_cbm_day" numeric(10, 6) NOT NULL,
	"billing_timing" "vmi_billing_timing" DEFAULT 'beginning_of_day' NOT NULL,
	"cbm_threshold_type" "vmi_cbm_threshold_type" DEFAULT 'none' NOT NULL,
	"cbm_threshold" numeric(12, 4),
	"over_threshold_rate" numeric(10, 6),
	"handling_in_rate_per_cbm" numeric(10, 4) NOT NULL,
	"handling_out_rate_per_cbm" numeric(10, 4) NOT NULL,
	"documentation_default_rate_usd" numeric(10, 4) NOT NULL,
	"billing_currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"effective_from" timestamp DEFAULT now() NOT NULL,
	"effective_to" timestamp,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vmi_daily_balance_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"party_id" uuid NOT NULL,
	"ledger_date" date NOT NULL,
	"beginning_cbm" numeric(12, 4) DEFAULT '0' NOT NULL,
	"inbound_cbm_fg" numeric(12, 4) DEFAULT '0' NOT NULL,
	"inbound_cbm_raw_material" numeric(12, 4) DEFAULT '0' NOT NULL,
	"outbound_cbm_fg" numeric(12, 4) DEFAULT '0' NOT NULL,
	"outbound_cbm_raw_material" numeric(12, 4) DEFAULT '0' NOT NULL,
	"ending_cbm" numeric(12, 4) DEFAULT '0' NOT NULL,
	"billed_balance_cbm" numeric(12, 4) NOT NULL,
	"applied_storage_rate_usd" numeric(10, 6) NOT NULL,
	"storage_amount_usd" numeric(14, 4) NOT NULL,
	"calculated_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vmi_daily_balance_ledger_party_date_unique" UNIQUE("party_id","ledger_date")
);
--> statement-breakpoint
CREATE TABLE "vmi_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"party_id" uuid NOT NULL,
	"applied_to_period_id" uuid NOT NULL,
	"payment_date" date NOT NULL,
	"amount_usd" numeric(14, 4) NOT NULL,
	"type" "vmi_payment_type" DEFAULT 'payment' NOT NULL,
	"notes" text,
	"recorded_by_user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vmi_permits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"party_id" uuid NOT NULL,
	"permit_number" varchar(100) NOT NULL,
	"item_scope" text NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date NOT NULL,
	"monthly_fee_usd" numeric(10, 2) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vmi_recurring_fee_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"party_id" uuid NOT NULL,
	"fee_type" "vmi_recurring_fee_type" NOT NULL,
	"label" varchar(200) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"flat_amount_usd" numeric(14, 4),
	"manpower_rate_per_hour" numeric(10, 2),
	"manpower_currency" varchar(3),
	"related_permit_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vmi_billing_periods" ADD CONSTRAINT "vmi_billing_periods_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vmi_charge_lines" ADD CONSTRAINT "vmi_charge_lines_acknowledgement_receipt_id_generated_documents_id_fk" FOREIGN KEY ("acknowledgement_receipt_id") REFERENCES "public"."generated_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vmi_charge_lines" ADD CONSTRAINT "vmi_charge_lines_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vmi_contract_terms" ADD CONSTRAINT "vmi_contract_terms_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vmi_daily_balance_ledger" ADD CONSTRAINT "vmi_daily_balance_ledger_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vmi_payments" ADD CONSTRAINT "vmi_payments_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vmi_payments" ADD CONSTRAINT "vmi_payments_applied_to_period_id_vmi_billing_periods_id_fk" FOREIGN KEY ("applied_to_period_id") REFERENCES "public"."vmi_billing_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vmi_permits" ADD CONSTRAINT "vmi_permits_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vmi_recurring_fee_lines" ADD CONSTRAINT "vmi_recurring_fee_lines_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vmi_recurring_fee_lines" ADD CONSTRAINT "vmi_recurring_fee_lines_related_permit_id_vmi_permits_id_fk" FOREIGN KEY ("related_permit_id") REFERENCES "public"."vmi_permits"("id") ON DELETE no action ON UPDATE no action;
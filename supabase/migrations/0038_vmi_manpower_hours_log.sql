CREATE TABLE "vmi_manpower_hours_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recurring_fee_line_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"period_start_date" date NOT NULL,
	"period_end_date" date NOT NULL,
	"hours" numeric(10, 2) NOT NULL,
	"notes" text,
	"recorded_by_user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vmi_manpower_hours_log_period_unique" UNIQUE("recurring_fee_line_id","period_start_date","period_end_date")
);
--> statement-breakpoint
ALTER TABLE "vmi_manpower_hours_log" ADD CONSTRAINT "vmi_manpower_hours_log_recurring_fee_line_id_vmi_recurring_fee_lines_id_fk" FOREIGN KEY ("recurring_fee_line_id") REFERENCES "public"."vmi_recurring_fee_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vmi_manpower_hours_log" ADD CONSTRAINT "vmi_manpower_hours_log_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;

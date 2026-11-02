CREATE TABLE "clock_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clock_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"days" integer,
	"new_due" date,
	"reason" text NOT NULL,
	"legal_authority" jsonb,
	"applicant_consent" boolean DEFAULT false NOT NULL,
	"superseded_by" uuid,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"rule_key" text NOT NULL,
	"rule_version" integer NOT NULL,
	"pack_version" text NOT NULL,
	"start_event" text NOT NULL,
	"start_date" date NOT NULL,
	"length_value" integer NOT NULL,
	"length_unit" text NOT NULL,
	"counting_method" text NOT NULL,
	"computed_due" date NOT NULL,
	"current_due" date NOT NULL,
	"rolled_from" date,
	"status" text DEFAULT 'running' NOT NULL,
	"met_on" date,
	"source" text NOT NULL,
	"replaced_due" date,
	"superseded_by" uuid,
	"superseded_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clock_adjustments" ADD CONSTRAINT "clock_adjustments_clock_id_clocks_id_fk" FOREIGN KEY ("clock_id") REFERENCES "public"."clocks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clocks" ADD CONSTRAINT "clocks_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clock_adjustments_clock_idx" ON "clock_adjustments" USING btree ("clock_id");--> statement-breakpoint
CREATE INDEX "clocks_application_idx" ON "clocks" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "clocks_status_idx" ON "clocks" USING btree ("status");
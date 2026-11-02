CREATE TABLE "fee_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"sequence" integer NOT NULL,
	"schedule_version_id" uuid NOT NULL,
	"computation" jsonb NOT NULL,
	"total_cents" integer NOT NULL,
	"assessed_by" text NOT NULL,
	"assessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_assessments_seq_uq" UNIQUE("application_id","stage","sequence")
);
--> statement-breakpoint
CREATE TABLE "fee_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"fee_code" text NOT NULL,
	"kind" text NOT NULL,
	"amount_cents" integer,
	"reason" text NOT NULL,
	"superseded_by" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fee_assessments" ADD CONSTRAINT "fee_assessments_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_overrides" ADD CONSTRAINT "fee_overrides_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fee_overrides_application_idx" ON "fee_overrides" USING btree ("application_id");
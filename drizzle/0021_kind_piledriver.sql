CREATE TABLE "regional_impact_determinations" (
	"application_id" uuid PRIMARY KEY NOT NULL,
	"determination" text NOT NULL,
	"previous_board_ref" text,
	"determined_on" date NOT NULL,
	"determined_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regional_impact_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"recipient_kind" text NOT NULL,
	"recipient_name" text NOT NULL,
	"method" text NOT NULL,
	"mailed_on" date NOT NULL,
	"reference" text,
	"recorded_by" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "regional_impact_determinations" ADD CONSTRAINT "regional_impact_determinations_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regional_impact_notices" ADD CONSTRAINT "regional_impact_notices_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "regional_impact_notices_application_idx" ON "regional_impact_notices" USING btree ("application_id");
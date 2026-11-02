CREATE TABLE "appeals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"filed_on" date NOT NULL,
	"appellant_name" text NOT NULL,
	"resolved_on" date,
	"outcome" text,
	"recorded_by" uuid NOT NULL,
	"resolved_by" uuid
);
--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appeals_application_idx" ON "appeals" USING btree ("application_id");
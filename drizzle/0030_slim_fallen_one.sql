CREATE TABLE "license_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"license_number" text NOT NULL,
	"license_type" text NOT NULL,
	"result" text NOT NULL,
	"note" text,
	"lookup_url" text NOT NULL,
	"checked_by" uuid NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "license_checks" ADD CONSTRAINT "license_checks_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "license_checks_application_idx" ON "license_checks" USING btree ("application_id");
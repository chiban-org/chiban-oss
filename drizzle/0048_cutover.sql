CREATE TABLE "cutover_reconciliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_sha256" text NOT NULL,
	"report" jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"signed_off_by" uuid,
	"signed_off_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cutover_rows" (
	"legacy_number" text PRIMARY KEY NOT NULL,
	"application_id" uuid NOT NULL,
	"imported_by" uuid NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_sha256" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cutover_rows" ADD CONSTRAINT "cutover_rows_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;
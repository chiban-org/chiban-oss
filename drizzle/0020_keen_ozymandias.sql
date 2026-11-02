CREATE TABLE "code_edition_records" (
	"application_id" uuid PRIMARY KEY NOT NULL,
	"receipt_date" date NOT NULL,
	"completed_date" date,
	"classification" text,
	"dwelling_units" integer,
	"edition_key" text NOT NULL,
	"edition_label" text NOT NULL,
	"edition_status" text NOT NULL,
	"applicant_election" text,
	"local_amendments_in_force" jsonb NOT NULL,
	"recorded_by" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "code_edition_records" ADD CONSTRAINT "code_edition_records_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;
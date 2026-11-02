CREATE TABLE "census_classifications" (
	"application_id" uuid PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"excluded_reason" text,
	"phase" text DEFAULT 'whole_building' NOT NULL,
	"buildings" integer NOT NULL,
	"housing_units" integer NOT NULL,
	"valuation_dollars" integer NOT NULL,
	"classified_by" uuid NOT NULL,
	"classified_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "census_classifications" ADD CONSTRAINT "census_classifications_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;
CREATE TABLE "regional_impact_parties" (
	"application_id" uuid NOT NULL,
	"municipality_key" text NOT NULL,
	CONSTRAINT "regional_impact_parties_application_id_municipality_key_pk" PRIMARY KEY("application_id","municipality_key")
);
--> statement-breakpoint
ALTER TABLE "regional_impact_parties" ADD CONSTRAINT "regional_impact_parties_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;
CREATE TABLE "application_municipalities" (
	"application_id" uuid NOT NULL,
	"municipality_key" text NOT NULL,
	"relation" text NOT NULL,
	CONSTRAINT "application_municipalities_application_id_municipality_key_pk" PRIMARY KEY("application_id","municipality_key")
);
--> statement-breakpoint
CREATE TABLE "source_water_determinations" (
	"application_id" uuid PRIMARY KEY NOT NULL,
	"determination" text NOT NULL,
	"supplier_key" text,
	"determined_by" uuid NOT NULL,
	"determined_on" date NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application_municipalities" ADD CONSTRAINT "application_municipalities_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_water_determinations" ADD CONSTRAINT "source_water_determinations_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;
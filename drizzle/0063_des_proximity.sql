CREATE TABLE "des_proximity_determinations" (
	"application_id" uuid PRIMARY KEY NOT NULL,
	"suggested" jsonb NOT NULL,
	"determination" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"determined_by" uuid NOT NULL,
	"determined_on" date NOT NULL
);
--> statement-breakpoint
ALTER TABLE "des_proximity_determinations" ADD CONSTRAINT "des_proximity_determinations_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;
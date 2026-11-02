CREATE TABLE "reliance_links" (
	"variance_application_id" uuid NOT NULL,
	"planning_application_id" uuid NOT NULL,
	"resolved_on" date,
	CONSTRAINT "reliance_links_variance_application_id_planning_application_id_pk" PRIMARY KEY("variance_application_id","planning_application_id")
);
--> statement-breakpoint
ALTER TABLE "reliance_links" ADD CONSTRAINT "reliance_links_variance_application_id_applications_id_fk" FOREIGN KEY ("variance_application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reliance_links" ADD CONSTRAINT "reliance_links_planning_application_id_applications_id_fk" FOREIGN KEY ("planning_application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;
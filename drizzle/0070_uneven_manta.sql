CREATE TABLE "trc_routings" (
	"application_id" uuid NOT NULL,
	"department_key" text NOT NULL,
	"assignment_id" uuid NOT NULL,
	"comment_due" date,
	CONSTRAINT "trc_routings_application_id_department_key_pk" PRIMARY KEY("application_id","department_key")
);
--> statement-breakpoint
ALTER TABLE "trc_routings" ADD CONSTRAINT "trc_routings_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trc_routings" ADD CONSTRAINT "trc_routings_assignment_id_review_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."review_assignments"("id") ON DELETE no action ON UPDATE no action;
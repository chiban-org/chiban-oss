CREATE TABLE "counter_intakes" (
	"application_id" uuid PRIMARY KEY NOT NULL,
	"applicant_party_id" uuid NOT NULL,
	"taken_by" uuid NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paper_attestation_recorded_by" uuid,
	"paper_attestation_recorded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "counter_intakes" ADD CONSTRAINT "counter_intakes_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counter_intakes" ADD CONSTRAINT "counter_intakes_applicant_party_id_project_parties_id_fk" FOREIGN KEY ("applicant_party_id") REFERENCES "public"."project_parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "counter_intakes_taken_at_idx" ON "counter_intakes" USING btree ("taken_at");
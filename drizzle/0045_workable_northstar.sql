CREATE TABLE "certificates_of_occupancy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"number" text NOT NULL,
	"issued_on" date NOT NULL,
	"final_inspection_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"issued_by" uuid NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "certificates_of_occupancy_application_id_unique" UNIQUE("application_id"),
	CONSTRAINT "certificates_of_occupancy_number_unique" UNIQUE("number")
);
--> statement-breakpoint
ALTER TABLE "certificates_of_occupancy" ADD CONSTRAINT "certificates_of_occupancy_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates_of_occupancy" ADD CONSTRAINT "certificates_of_occupancy_final_inspection_id_inspections_id_fk" FOREIGN KEY ("final_inspection_id") REFERENCES "public"."inspections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates_of_occupancy" ADD CONSTRAINT "certificates_of_occupancy_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;
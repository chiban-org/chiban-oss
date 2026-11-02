CREATE TABLE "redaction_boxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"page" integer,
	"pdf_box" jsonb,
	"image_box" jsonb,
	"exemption_key" text NOT NULL,
	"other_citation" text,
	"explanation" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redaction_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"source_version_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"rtk_request_id" uuid,
	"status" text DEFAULT 'queued' NOT NULL,
	"failure_reason" text,
	"result_version_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "derived_from_version_id" uuid;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "redaction_job_id" uuid;--> statement-breakpoint
ALTER TABLE "redaction_boxes" ADD CONSTRAINT "redaction_boxes_job_id_redaction_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."redaction_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redaction_jobs" ADD CONSTRAINT "redaction_jobs_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redaction_jobs" ADD CONSTRAINT "redaction_jobs_source_version_id_document_versions_id_fk" FOREIGN KEY ("source_version_id") REFERENCES "public"."document_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redaction_jobs" ADD CONSTRAINT "redaction_jobs_rtk_request_id_rtk_requests_id_fk" FOREIGN KEY ("rtk_request_id") REFERENCES "public"."rtk_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redaction_jobs" ADD CONSTRAINT "redaction_jobs_result_version_id_document_versions_id_fk" FOREIGN KEY ("result_version_id") REFERENCES "public"."document_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "redaction_boxes_job_idx" ON "redaction_boxes" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "redaction_jobs_document_idx" ON "redaction_jobs" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "redaction_jobs_status_idx" ON "redaction_jobs" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_derived_from_version_id_document_versions_id_fk" FOREIGN KEY ("derived_from_version_id") REFERENCES "public"."document_versions"("id") ON DELETE no action ON UPDATE no action;
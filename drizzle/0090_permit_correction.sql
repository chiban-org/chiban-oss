ALTER TABLE "documents" ADD COLUMN "superseded_by" uuid;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "permit_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "permit_corrected_on" date;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_superseded_by_documents_id_fk" FOREIGN KEY ("superseded_by") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_snapshots" ADD CONSTRAINT "application_snapshots_reason_check" CHECK ("application_snapshots"."reason" in ('submission', 'amendment', 'correction'));
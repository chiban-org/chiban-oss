CREATE TABLE "document_text" (
	"version_id" uuid PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	"has_text_layer" boolean NOT NULL,
	"tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', "text")) STORED
);
--> statement-breakpoint
CREATE TABLE "preservation_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"original_version_id" uuid NOT NULL,
	"required" boolean NOT NULL,
	"status" text NOT NULL,
	"reason" text,
	"detail" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"pdfa_version_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preservation_records_original_version_id_unique" UNIQUE("original_version_id")
);
--> statement-breakpoint
ALTER TABLE "document_text" ADD CONSTRAINT "document_text_version_id_document_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."document_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preservation_records" ADD CONSTRAINT "preservation_records_original_version_id_document_versions_id_fk" FOREIGN KEY ("original_version_id") REFERENCES "public"."document_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preservation_records" ADD CONSTRAINT "preservation_records_pdfa_version_id_document_versions_id_fk" FOREIGN KEY ("pdfa_version_id") REFERENCES "public"."document_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_text_tsv_idx" ON "document_text" USING gin ("tsv");--> statement-breakpoint
CREATE INDEX "preservation_records_status_idx" ON "preservation_records" USING btree ("status");
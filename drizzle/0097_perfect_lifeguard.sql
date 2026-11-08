CREATE TABLE "application_document_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"item_key" text NOT NULL,
	"waiver_reason" text,
	"waiver_requested_by" uuid,
	"waiver_requested_at" timestamp with time zone,
	"accepted_reason" text,
	"accepted_by" uuid,
	"accepted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "application_document_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"item_key" text NOT NULL,
	"document_id" uuid NOT NULL,
	"linked_by" uuid NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "upload_intents" ADD COLUMN "item_key" text;--> statement-breakpoint
ALTER TABLE "application_document_items" ADD CONSTRAINT "application_document_items_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_document_links" ADD CONSTRAINT "application_document_links_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_document_links" ADD CONSTRAINT "application_document_links_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "application_document_items_unique_idx" ON "application_document_items" USING btree ("application_id","item_key");--> statement-breakpoint
CREATE UNIQUE INDEX "application_document_links_unique_idx" ON "application_document_links" USING btree ("application_id","item_key","document_id");--> statement-breakpoint
CREATE INDEX "application_document_links_document_idx" ON "application_document_links" USING btree ("document_id");
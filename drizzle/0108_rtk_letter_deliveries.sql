CREATE TABLE "rtk_letter_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"outcome" text NOT NULL,
	"sent_to" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rtk_letter_deliveries" ADD CONSTRAINT "rtk_letter_deliveries_request_id_rtk_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."rtk_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rtk_letter_deliveries" ADD CONSTRAINT "rtk_letter_deliveries_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rtk_letter_deliveries_request_idx" ON "rtk_letter_deliveries" USING btree ("request_id");
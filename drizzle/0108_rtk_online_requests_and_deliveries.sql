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
CREATE TABLE "rtk_release_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"sent_to" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rtk_release_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "rtk_requests" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "rtk_letter_deliveries" ADD CONSTRAINT "rtk_letter_deliveries_request_id_rtk_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."rtk_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rtk_letter_deliveries" ADD CONSTRAINT "rtk_letter_deliveries_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rtk_release_links" ADD CONSTRAINT "rtk_release_links_release_id_rtk_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."rtk_releases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rtk_letter_deliveries_request_idx" ON "rtk_letter_deliveries" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "rtk_release_links_release_idx" ON "rtk_release_links" USING btree ("release_id");
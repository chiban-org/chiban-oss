CREATE TABLE "document_renditions" (
	"version_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"page" integer NOT NULL,
	"storage_key" text NOT NULL,
	"width" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_renditions_version_id_kind_page_pk" PRIMARY KEY("version_id","kind","page")
);
--> statement-breakpoint
ALTER TABLE "board_packet_items" ADD COLUMN "approval_id" uuid;--> statement-breakpoint
ALTER TABLE "board_packet_items" ADD COLUMN "withdrawn_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "board_packet_items" ADD COLUMN "withdrawn_reason" text;--> statement-breakpoint
ALTER TABLE "document_renditions" ADD CONSTRAINT "document_renditions_version_id_document_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."document_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_packet_items" ADD CONSTRAINT "board_packet_items_approval_id_rendition_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."rendition_approvals"("id") ON DELETE no action ON UPDATE no action;
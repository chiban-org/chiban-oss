CREATE TABLE "board_packet_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"link_id" uuid NOT NULL,
	"version_id" uuid,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "board_packet_items" (
	"packet_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "board_packet_items_packet_id_document_id_pk" PRIMARY KEY("packet_id","document_id")
);
--> statement-breakpoint
CREATE TABLE "board_packet_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"packet_id" uuid NOT NULL,
	"recipient_name" text NOT NULL,
	"recipient_email" "citext" NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "board_packet_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "board_packets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"board" text NOT NULL,
	"meeting_date" date NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "board_packet_access" ADD CONSTRAINT "board_packet_access_link_id_board_packet_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."board_packet_links"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_packet_access" ADD CONSTRAINT "board_packet_access_version_id_document_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."document_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_packet_items" ADD CONSTRAINT "board_packet_items_packet_id_board_packets_id_fk" FOREIGN KEY ("packet_id") REFERENCES "public"."board_packets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_packet_items" ADD CONSTRAINT "board_packet_items_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_packet_items" ADD CONSTRAINT "board_packet_items_version_id_document_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."document_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_packet_links" ADD CONSTRAINT "board_packet_links_packet_id_board_packets_id_fk" FOREIGN KEY ("packet_id") REFERENCES "public"."board_packets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "board_packet_access_link_idx" ON "board_packet_access" USING btree ("link_id");--> statement-breakpoint
CREATE INDEX "board_packet_links_packet_idx" ON "board_packet_links" USING btree ("packet_id");
--> statement-breakpoint
CREATE TRIGGER board_packet_access_immutable BEFORE UPDATE OR DELETE ON board_packet_access FOR EACH ROW EXECUTE FUNCTION reject_immutable_record_change();

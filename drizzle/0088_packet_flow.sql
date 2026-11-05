CREATE TABLE "board_packet_members" (
	"packet_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"last_sent_at" timestamp with time zone NOT NULL,
	CONSTRAINT "board_packet_members_packet_id_user_id_pk" PRIMARY KEY("packet_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "board_packet_access" ADD COLUMN "packet_id" uuid;--> statement-breakpoint
ALTER TABLE "board_packet_items" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "board_packet_items" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "board_packet_items" ADD COLUMN "removal_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "board_packet_items" ADD COLUMN "replaces_document_id" uuid;--> statement-breakpoint
ALTER TABLE "board_packets" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "board_packets" ADD COLUMN "last_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "board_packet_members" ADD CONSTRAINT "board_packet_members_packet_id_board_packets_id_fk" FOREIGN KEY ("packet_id") REFERENCES "public"."board_packets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_packet_members" ADD CONSTRAINT "board_packet_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_packet_access" ADD CONSTRAINT "board_packet_access_packet_id_board_packets_id_fk" FOREIGN KEY ("packet_id") REFERENCES "public"."board_packets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "board_packet_access_packet_idx" ON "board_packet_access" USING btree ("packet_id","user_id");--> statement-breakpoint
UPDATE "board_packets" SET "sent_at" = "created_at", "last_sent_at" = "created_at";--> statement-breakpoint
UPDATE "board_packet_items" SET "sent_at" = "board_packets"."created_at"
FROM "board_packets" WHERE "board_packets"."id" = "board_packet_items"."packet_id";--> statement-breakpoint
ALTER TABLE "board_packet_access" DISABLE TRIGGER board_packet_access_immutable;--> statement-breakpoint
UPDATE "board_packet_access" SET "packet_id" = "board_packet_links"."packet_id"
FROM "board_packet_links" WHERE "board_packet_links"."id" = "board_packet_access"."link_id";--> statement-breakpoint
UPDATE "board_packet_access" SET "packet_id" = (
  SELECT "i"."packet_id" FROM "board_packet_items" "i"
  WHERE "i"."version_id" = "board_packet_access"."version_id"
     OR "i"."former_version_id" = "board_packet_access"."version_id"
  ORDER BY "i"."packet_id" LIMIT 1
)
WHERE "board_packet_access"."packet_id" IS NULL AND "board_packet_access"."version_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "board_packet_access" ENABLE TRIGGER board_packet_access_immutable;--> statement-breakpoint
INSERT INTO "board_packet_members" ("packet_id", "user_id", "sent_at", "last_sent_at")
SELECT "bp"."id", "u"."id", min("a"."at"), max("a"."at")
FROM "audit_log" "a"
JOIN "board_packets" "bp" ON "bp"."id"::text = "a"."entity_id"
JOIN "users" "u" ON "u"."email" = ("a"."after" ->> 'recipientEmail')::citext
WHERE "a"."action" = 'packet.member.notify'
GROUP BY "bp"."id", "u"."id"
ON CONFLICT DO NOTHING;

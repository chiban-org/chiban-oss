CREATE TABLE "board_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"board" text NOT NULL,
	"title" text NOT NULL,
	"term_start" date NOT NULL,
	"term_end" date,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "board_packet_access" ALTER COLUMN "link_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "board_packet_access" ADD COLUMN "user_id" uuid;--> statement-breakpoint
CREATE INDEX "board_memberships_user_idx" ON "board_memberships" USING btree ("user_id");

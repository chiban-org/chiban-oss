CREATE TABLE "board_meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board" text NOT NULL,
	"meeting_date" date NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"starts_at_minute" integer DEFAULT 1140 NOT NULL,
	"cancel_reason" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "board_meetings_scheduled_idx" ON "board_meetings" USING btree ("board","meeting_date","kind") WHERE "board_meetings"."status" = 'scheduled';
CREATE TABLE "hearings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"meeting_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"continued_from" uuid,
	"continuation_announced" boolean,
	"announced_details" text,
	"notice_set_id" uuid NOT NULL,
	"properly_noticed_at" timestamp with time zone,
	"properly_noticed_by" uuid,
	"held_on" date,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hearings" ADD CONSTRAINT "hearings_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hearings" ADD CONSTRAINT "hearings_meeting_id_board_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."board_meetings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hearings" ADD CONSTRAINT "hearings_notice_set_id_notice_sets_id_fk" FOREIGN KEY ("notice_set_id") REFERENCES "public"."notice_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hearings_application_idx" ON "hearings" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "hearings_meeting_idx" ON "hearings" USING btree ("meeting_id");
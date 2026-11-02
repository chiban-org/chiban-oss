CREATE TABLE "agenda_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"kind" text NOT NULL,
	"hearing_id" uuid,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agendas" (
	"meeting_id" uuid PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"document_id" uuid
);
--> statement-breakpoint
ALTER TABLE "agenda_items" ADD CONSTRAINT "agenda_items_meeting_id_agendas_meeting_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."agendas"("meeting_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_items" ADD CONSTRAINT "agenda_items_hearing_id_hearings_id_fk" FOREIGN KEY ("hearing_id") REFERENCES "public"."hearings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agendas" ADD CONSTRAINT "agendas_meeting_id_board_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."board_meetings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agenda_items_meeting_idx" ON "agenda_items" USING btree ("meeting_id","position");
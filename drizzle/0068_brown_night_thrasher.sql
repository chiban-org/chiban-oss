CREATE TABLE "board_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"hearing_id" uuid NOT NULL,
	"meeting_id" uuid NOT NULL,
	"voted_on" date NOT NULL,
	"outcome" text NOT NULL,
	"motion" text NOT NULL,
	"votes" jsonb NOT NULL,
	"findings" text NOT NULL,
	"conditions" jsonb NOT NULL,
	"reasons_for_disapproval" text,
	"filed_on" date,
	"minutes_document_id" uuid,
	"written_decision_document_id" uuid,
	"letter_document_id" uuid,
	"recorded_by" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "board_decisions" ADD CONSTRAINT "board_decisions_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_decisions" ADD CONSTRAINT "board_decisions_hearing_id_hearings_id_fk" FOREIGN KEY ("hearing_id") REFERENCES "public"."hearings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_decisions" ADD CONSTRAINT "board_decisions_meeting_id_board_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."board_meetings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "board_decisions_application_idx" ON "board_decisions" USING btree ("application_id");
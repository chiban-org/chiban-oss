CREATE TABLE "decision_recordings" (
	"decision_id" uuid PRIMARY KEY NOT NULL,
	"registry" text NOT NULL,
	"book" text NOT NULL,
	"page" text NOT NULL,
	"recorded_on" date NOT NULL,
	"certificate_document_id" uuid NOT NULL,
	"recorded_by" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "board_decisions" ADD COLUMN "final_written_approval_on" date;--> statement-breakpoint
ALTER TABLE "decision_recordings" ADD CONSTRAINT "decision_recordings_decision_id_board_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."board_decisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_recordings" ADD CONSTRAINT "decision_recordings_certificate_document_id_documents_id_fk" FOREIGN KEY ("certificate_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;
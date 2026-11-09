CREATE TABLE "letter_mailings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"decision_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"mailed_on" date,
	"mailed_by" uuid,
	"mailed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "letter_mailings" ADD CONSTRAINT "letter_mailings_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_mailings" ADD CONSTRAINT "letter_mailings_decision_id_board_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."board_decisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_mailings" ADD CONSTRAINT "letter_mailings_party_id_project_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."project_parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_mailings" ADD CONSTRAINT "letter_mailings_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "letter_mailings_decision_party_uq" ON "letter_mailings" USING btree ("decision_id","party_id");--> statement-breakpoint
CREATE INDEX "letter_mailings_application_idx" ON "letter_mailings" USING btree ("application_id");
CREATE TABLE "cure_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"finding_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"recipient_role" text NOT NULL,
	"recipient_name" text NOT NULL,
	"mailing_address" text NOT NULL,
	"sent_on" date NOT NULL,
	"return_receipt_on" date,
	"document_id" uuid,
	"cure_due" jsonb NOT NULL,
	"sent_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "enforcement_cases" ADD COLUMN "cure_rule_key" text;--> statement-breakpoint
ALTER TABLE "cure_notices" ADD CONSTRAINT "cure_notices_case_id_enforcement_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."enforcement_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cure_notices" ADD CONSTRAINT "cure_notices_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cure_notices_case_idx" ON "cure_notices" USING btree ("case_id");
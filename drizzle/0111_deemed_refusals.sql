CREATE TABLE "decision_notices" (
	"application_id" uuid PRIMARY KEY NOT NULL,
	"document_id" uuid NOT NULL,
	"mailed_on" date NOT NULL,
	"recorded_by" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deemed_refusals" (
	"application_id" uuid PRIMARY KEY NOT NULL,
	"rule_key" text NOT NULL,
	"rule_version" integer NOT NULL,
	"due_on" date NOT NULL,
	"fired_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appeal_nodes" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "decision_notices" ADD CONSTRAINT "decision_notices_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_notices" ADD CONSTRAINT "decision_notices_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deemed_refusals" ADD CONSTRAINT "deemed_refusals_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;
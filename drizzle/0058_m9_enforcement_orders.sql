CREATE TABLE "enforcement_designations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"adopting_authority" text NOT NULL,
	"adopted_on" date NOT NULL,
	"ended_on" date
);
--> statement-breakpoint
CREATE TABLE "enforcement_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"number" text NOT NULL,
	"rule_key" text NOT NULL,
	"rule_version" integer NOT NULL,
	"finding_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"corrective_action" text NOT NULL,
	"corrective_deadline" date,
	"cease_immediately" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"drafted_by" uuid NOT NULL,
	"issued_on" date,
	"issued_by" uuid,
	"document_id" uuid,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enforcement_orders_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "violation_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"provision_kind" text NOT NULL,
	"provision_ref" text NOT NULL,
	"facts" text NOT NULL,
	"inspection_date" date NOT NULL,
	"found_on" date NOT NULL,
	"found_by" uuid NOT NULL,
	"status" text DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "violation_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"finding_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"sent_on" date NOT NULL,
	"method" text NOT NULL,
	"sent_by" uuid NOT NULL,
	"received_on" date,
	"receipt_basis" text,
	"document_id" uuid
);
--> statement-breakpoint
ALTER TABLE "enforcement_orders" ADD CONSTRAINT "enforcement_orders_case_id_enforcement_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."enforcement_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enforcement_orders" ADD CONSTRAINT "enforcement_orders_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "violation_findings" ADD CONSTRAINT "violation_findings_case_id_enforcement_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."enforcement_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "violation_notices" ADD CONSTRAINT "violation_notices_case_id_enforcement_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."enforcement_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "violation_notices" ADD CONSTRAINT "violation_notices_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "enforcement_orders_case_idx" ON "enforcement_orders" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "violation_findings_case_idx" ON "violation_findings" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "violation_notices_case_idx" ON "violation_notices" USING btree ("case_id");
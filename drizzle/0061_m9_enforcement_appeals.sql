CREATE TABLE "enforcement_appeals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" uuid NOT NULL,
	"filed_on" date NOT NULL,
	"appellant_name" text NOT NULL,
	"board" text DEFAULT 'zba' NOT NULL,
	"resolved_on" date,
	"outcome" text,
	"recorded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "peril_certifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appeal_id" uuid NOT NULL,
	"certified_on" date NOT NULL,
	"certified_by" uuid NOT NULL,
	"categories" text[] NOT NULL,
	"statement" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restraining_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appeal_id" uuid NOT NULL,
	"issued_by" text NOT NULL,
	"issued_on" date NOT NULL,
	"document_id" uuid NOT NULL,
	"dissolved_on" date
);
--> statement-breakpoint
ALTER TABLE "enforcement_appeals" ADD CONSTRAINT "enforcement_appeals_case_id_enforcement_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."enforcement_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peril_certifications" ADD CONSTRAINT "peril_certifications_appeal_id_enforcement_appeals_id_fk" FOREIGN KEY ("appeal_id") REFERENCES "public"."enforcement_appeals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restraining_orders" ADD CONSTRAINT "restraining_orders_appeal_id_enforcement_appeals_id_fk" FOREIGN KEY ("appeal_id") REFERENCES "public"."enforcement_appeals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restraining_orders" ADD CONSTRAINT "restraining_orders_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "enforcement_appeals_case_idx" ON "enforcement_appeals" USING btree ("case_id");
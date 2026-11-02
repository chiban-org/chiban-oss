CREATE TABLE "order_court_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"occurred_on" date NOT NULL,
	"court" text NOT NULL,
	"docket" text,
	"document_id" uuid NOT NULL,
	"judgment_outcome" text,
	"appeal_due" jsonb,
	"recorded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_court_steps" ADD CONSTRAINT "order_court_steps_order_id_enforcement_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."enforcement_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_court_steps" ADD CONSTRAINT "order_court_steps_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_court_steps_order_idx" ON "order_court_steps" USING btree ("order_id");
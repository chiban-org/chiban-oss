CREATE TABLE "order_service_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"recipient_id" uuid,
	"method" text NOT NULL,
	"served_on" date NOT NULL,
	"server_name" text,
	"server_role" text,
	"newspaper" text,
	"proof_document_id" uuid NOT NULL,
	"recorded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_service_events_recipient_rule" CHECK (("order_service_events"."method" in ('posting_on_property', 'newspaper_publication')) = ("order_service_events"."recipient_id" is null)),
	CONSTRAINT "order_service_events_server_rule" CHECK ("order_service_events"."method" not in ('in_hand', 'abode') or ("order_service_events"."server_name" is not null and "order_service_events"."server_role" is not null))
);
--> statement-breakpoint
CREATE TABLE "order_service_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"role" text NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"source" text NOT NULL,
	"answer_due" jsonb,
	"answered_on" date,
	"answer_document_id" uuid
);
--> statement-breakpoint
CREATE TABLE "order_service_role_checks" (
	"order_id" uuid NOT NULL,
	"role" text NOT NULL,
	"outcome" text NOT NULL,
	"basis" text NOT NULL,
	"checked_by" uuid NOT NULL,
	"checked_on" date NOT NULL,
	CONSTRAINT "order_service_role_checks_order_id_role_pk" PRIMARY KEY("order_id","role"),
	CONSTRAINT "order_service_role_checks_same_as_owner" CHECK ("order_service_role_checks"."outcome" <> 'same_as_owner' or "order_service_role_checks"."role" = 'taxpayer'),
	CONSTRAINT "order_service_role_checks_owner_not_found" CHECK ("order_service_role_checks"."outcome" <> 'owner_not_found' or "order_service_role_checks"."role" = 'record_owner')
);
--> statement-breakpoint
ALTER TABLE "order_service_events" ADD CONSTRAINT "order_service_events_order_id_enforcement_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."enforcement_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_service_events" ADD CONSTRAINT "order_service_events_recipient_id_order_service_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."order_service_recipients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_service_events" ADD CONSTRAINT "order_service_events_proof_document_id_documents_id_fk" FOREIGN KEY ("proof_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_service_recipients" ADD CONSTRAINT "order_service_recipients_order_id_enforcement_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."enforcement_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_service_recipients" ADD CONSTRAINT "order_service_recipients_answer_document_id_documents_id_fk" FOREIGN KEY ("answer_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_service_role_checks" ADD CONSTRAINT "order_service_role_checks_order_id_enforcement_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."enforcement_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_service_events_order_idx" ON "order_service_events" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_service_recipients_order_idx" ON "order_service_recipients" USING btree ("order_id");
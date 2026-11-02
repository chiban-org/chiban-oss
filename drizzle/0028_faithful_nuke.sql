CREATE TABLE "processor_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"processor_account_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"type" text NOT NULL,
	"object_id" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"outcome" text,
	"raw" jsonb NOT NULL,
	CONSTRAINT "processor_events_account_event_uq" UNIQUE("processor_account_id","event_id")
);
--> statement-breakpoint
ALTER TABLE "processor_events" ADD CONSTRAINT "processor_events_processor_account_id_processor_accounts_id_fk" FOREIGN KEY ("processor_account_id") REFERENCES "public"."processor_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "processor_events_unprocessed_idx" ON "processor_events" USING btree ("processed_at");
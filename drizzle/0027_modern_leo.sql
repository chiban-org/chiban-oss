CREATE TABLE "payment_attempt_transitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"from_state" text NOT NULL,
	"to_state" text NOT NULL,
	"source" text NOT NULL,
	"event_id" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"processor_account_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"outcome_unknown" boolean DEFAULT false NOT NULL,
	"base_cents" integer NOT NULL,
	"convenience_fee_cents" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"planned_allocations" jsonb NOT NULL,
	"payer_name" text NOT NULL,
	"payer_email" text,
	"payer_user_id" uuid,
	"checkout_ref" text,
	"processor_object_id" text,
	"idempotency_key" text NOT NULL,
	"anomaly" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "payment_attempts_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "refund_requests" (
	"refund_object_id" text PRIMARY KEY NOT NULL,
	"entry_id" uuid NOT NULL,
	"allocations" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_attempt_transitions" ADD CONSTRAINT "payment_attempt_transitions_attempt_id_payment_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_processor_account_id_processor_accounts_id_fk" FOREIGN KEY ("processor_account_id") REFERENCES "public"."processor_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_entry_id_ledger_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_attempt_transitions_attempt_idx" ON "payment_attempt_transitions" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "payment_attempts_state_idx" ON "payment_attempts" USING btree ("state");--> statement-breakpoint
CREATE INDEX "payment_attempts_object_idx" ON "payment_attempts" USING btree ("processor_account_id","processor_object_id");--> statement-breakpoint
CREATE INDEX "payment_attempts_checkout_idx" ON "payment_attempts" USING btree ("processor_account_id","checkout_ref");--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payment_attempt_id_payment_attempts_id_fk" FOREIGN KEY ("payment_attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE TRIGGER payment_attempt_transitions_immutable BEFORE UPDATE OR DELETE ON payment_attempt_transitions FOR EACH ROW EXECUTE FUNCTION reject_ledger_change();
--> statement-breakpoint
CREATE TRIGGER payment_attempt_transitions_no_truncate BEFORE TRUNCATE ON payment_attempt_transitions FOR EACH STATEMENT EXECUTE FUNCTION reject_ledger_change();

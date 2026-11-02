CREATE TABLE "receipt_number_counters" (
	"year" integer PRIMARY KEY NOT NULL,
	"last" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"kind" text NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"business_date" date NOT NULL,
	"payer_name" text NOT NULL,
	"payer_email" "citext",
	"total_cents" integer NOT NULL,
	"tendered_cents" integer,
	"change_cents" integer,
	"simulated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "receipts_number_unique" UNIQUE("number")
);
--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE TRIGGER receipts_immutable BEFORE UPDATE OR DELETE ON receipts FOR EACH ROW EXECUTE FUNCTION reject_ledger_change();
--> statement-breakpoint
CREATE TRIGGER receipts_no_truncate BEFORE TRUNCATE ON receipts FOR EACH STATEMENT EXECUTE FUNCTION reject_ledger_change();

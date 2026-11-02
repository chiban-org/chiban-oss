CREATE TABLE "ledger_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"target_kind" text NOT NULL,
	"application_id" uuid,
	"fee_assessment_id" uuid,
	"stage" text,
	"fee_code" text,
	"amount_cents" integer NOT NULL,
	CONSTRAINT "ledger_allocations_line_fields" CHECK ("ledger_allocations"."target_kind" <> 'fee_assessment_line'
        or ("ledger_allocations"."application_id" is not null and "ledger_allocations"."fee_assessment_id" is not null
          and "ledger_allocations"."stage" is not null and "ledger_allocations"."fee_code" is not null)),
	CONSTRAINT "ledger_allocations_nonzero" CHECK ("ledger_allocations"."amount_cents" <> 0)
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_type" text NOT NULL,
	"method" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"posted_at" timestamp with time zone NOT NULL,
	"business_date" date NOT NULL,
	"receipt_id" uuid,
	"reverses_entry_id" uuid,
	"payment_attempt_id" uuid,
	"processor" text,
	"processor_account_id" uuid,
	"processor_object_id" text,
	"check_number" text,
	"payer_name" text NOT NULL,
	"payer_user_id" uuid,
	"reason" text,
	"actor_kind" text NOT NULL,
	"actor_user_id" uuid,
	"actor_job" text,
	CONSTRAINT "ledger_entries_sign" CHECK (("ledger_entries"."entry_type" = 'payment' and "ledger_entries"."amount_cents" > 0)
        or ("ledger_entries"."entry_type" in ('refund', 'returned_check', 'chargeback') and "ledger_entries"."amount_cents" < 0)
        or "ledger_entries"."entry_type" = 'correction'),
	CONSTRAINT "ledger_entries_reverses" CHECK (("ledger_entries"."entry_type" = 'payment' and "ledger_entries"."reverses_entry_id" is null)
        or ("ledger_entries"."entry_type" <> 'payment' and "ledger_entries"."reverses_entry_id" is not null)),
	CONSTRAINT "ledger_entries_reason" CHECK ("ledger_entries"."entry_type" not in ('refund', 'returned_check', 'correction') or "ledger_entries"."reason" is not null),
	CONSTRAINT "ledger_entries_processor_triple" CHECK (("ledger_entries"."processor" is null) = ("ledger_entries"."processor_account_id" is null)
        and ("ledger_entries"."processor" is null) = ("ledger_entries"."processor_object_id" is null))
);
--> statement-breakpoint
ALTER TABLE "ledger_allocations" ADD CONSTRAINT "ledger_allocations_entry_id_ledger_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_allocations" ADD CONSTRAINT "ledger_allocations_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_allocations" ADD CONSTRAINT "ledger_allocations_fee_assessment_id_fee_assessments_id_fk" FOREIGN KEY ("fee_assessment_id") REFERENCES "public"."fee_assessments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_reverses_entry_id_ledger_entries_id_fk" FOREIGN KEY ("reverses_entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_allocations_entry_idx" ON "ledger_allocations" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "ledger_allocations_line_idx" ON "ledger_allocations" USING btree ("application_id","stage","fee_code");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_processor_object_uq" ON "ledger_entries" USING btree ("processor_account_id","processor_object_id","entry_type") WHERE "ledger_entries"."processor_object_id" is not null;--> statement-breakpoint
CREATE INDEX "ledger_entries_business_date_idx" ON "ledger_entries" USING btree ("business_date");--> statement-breakpoint
CREATE INDEX "ledger_entries_reverses_idx" ON "ledger_entries" USING btree ("reverses_entry_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_payer_idx" ON "ledger_entries" USING btree ("payer_user_id");--> statement-breakpoint
CREATE FUNCTION reject_ledger_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'E_PAY_001 % on % is not allowed: the ledger is append-only', TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER ledger_entries_immutable BEFORE UPDATE OR DELETE ON ledger_entries FOR EACH ROW EXECUTE FUNCTION reject_ledger_change();
--> statement-breakpoint
CREATE TRIGGER ledger_allocations_immutable BEFORE UPDATE OR DELETE ON ledger_allocations FOR EACH ROW EXECUTE FUNCTION reject_ledger_change();
--> statement-breakpoint
CREATE TRIGGER ledger_entries_no_truncate BEFORE TRUNCATE ON ledger_entries FOR EACH STATEMENT EXECUTE FUNCTION reject_ledger_change();
--> statement-breakpoint
CREATE TRIGGER ledger_allocations_no_truncate BEFORE TRUNCATE ON ledger_allocations FOR EACH STATEMENT EXECUTE FUNCTION reject_ledger_change();
--> statement-breakpoint
CREATE FUNCTION check_ledger_allocations() RETURNS trigger AS $$
DECLARE
  entry_id_checked uuid;
  entry_row ledger_entries%ROWTYPE;
  allocated bigint;
  allocation_count integer;
  wrong_sign integer;
BEGIN
  IF TG_TABLE_NAME = 'ledger_entries' THEN
    entry_id_checked := NEW.id;
  ELSE
    entry_id_checked := NEW.entry_id;
  END IF;
  SELECT * INTO entry_row FROM ledger_entries WHERE id = entry_id_checked;
  SELECT coalesce(sum(amount_cents), 0), count(*) INTO allocated, allocation_count
    FROM ledger_allocations WHERE entry_id = entry_id_checked;
  IF allocation_count = 0 OR allocated <> entry_row.amount_cents THEN
    RAISE EXCEPTION 'E_PAY_002 ledger entry % allocates % of % cents', entry_id_checked, allocated, entry_row.amount_cents;
  END IF;
  IF entry_row.entry_type <> 'correction' THEN
    SELECT count(*) INTO wrong_sign FROM ledger_allocations
      WHERE entry_id = entry_id_checked AND sign(amount_cents) <> sign(entry_row.amount_cents);
    IF wrong_sign > 0 THEN
      RAISE EXCEPTION 'E_PAY_002 ledger entry % has an allocation with the wrong sign', entry_id_checked;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ledger_entries_allocated AFTER INSERT ON ledger_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_ledger_allocations();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ledger_allocations_allocated AFTER INSERT ON ledger_allocations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_ledger_allocations();

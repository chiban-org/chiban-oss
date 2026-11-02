CREATE TABLE "counsel_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referral_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"occurred_on" date NOT NULL,
	"court" text,
	"docket" text,
	"document_id" uuid,
	"note" text,
	"recorded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "counsel_referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"referred_on" date NOT NULL,
	"counsel_name" text NOT NULL,
	"purpose" text NOT NULL,
	"packet_document_id" uuid NOT NULL,
	"referred_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enforcement_fines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"order_id" uuid,
	"kind" text NOT NULL,
	"rule_key" text,
	"amount_cents" integer NOT NULL,
	"imposed_on" date NOT NULL,
	"court" text NOT NULL,
	"docket" text NOT NULL,
	"judgment_step_id" uuid,
	"counsel_outcome_id" uuid,
	"recorded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enforcement_fines_amount_positive" CHECK ("enforcement_fines"."amount_cents" > 0),
	CONSTRAINT "enforcement_fines_one_basis" CHECK (("enforcement_fines"."judgment_step_id" is not null) <> ("enforcement_fines"."counsel_outcome_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "ledger_allocations" ADD COLUMN "fine_id" uuid;--> statement-breakpoint
ALTER TABLE "counsel_outcomes" ADD CONSTRAINT "counsel_outcomes_referral_id_counsel_referrals_id_fk" FOREIGN KEY ("referral_id") REFERENCES "public"."counsel_referrals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counsel_outcomes" ADD CONSTRAINT "counsel_outcomes_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counsel_referrals" ADD CONSTRAINT "counsel_referrals_case_id_enforcement_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."enforcement_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counsel_referrals" ADD CONSTRAINT "counsel_referrals_packet_document_id_documents_id_fk" FOREIGN KEY ("packet_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enforcement_fines" ADD CONSTRAINT "enforcement_fines_case_id_enforcement_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."enforcement_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enforcement_fines" ADD CONSTRAINT "enforcement_fines_order_id_enforcement_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."enforcement_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enforcement_fines" ADD CONSTRAINT "enforcement_fines_judgment_step_id_order_court_steps_id_fk" FOREIGN KEY ("judgment_step_id") REFERENCES "public"."order_court_steps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enforcement_fines" ADD CONSTRAINT "enforcement_fines_counsel_outcome_id_counsel_outcomes_id_fk" FOREIGN KEY ("counsel_outcome_id") REFERENCES "public"."counsel_outcomes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "counsel_outcomes_referral_idx" ON "counsel_outcomes" USING btree ("referral_id");--> statement-breakpoint
CREATE INDEX "counsel_referrals_case_idx" ON "counsel_referrals" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "enforcement_fines_case_idx" ON "enforcement_fines" USING btree ("case_id");--> statement-breakpoint
ALTER TABLE "ledger_allocations" ADD CONSTRAINT "ledger_allocations_fine_id_enforcement_fines_id_fk" FOREIGN KEY ("fine_id") REFERENCES "public"."enforcement_fines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_allocations" ADD CONSTRAINT "ledger_allocations_fine_fields" CHECK ("ledger_allocations"."target_kind" <> 'fine' or ("ledger_allocations"."fine_id" is not null and "ledger_allocations"."application_id" is null));
--> statement-breakpoint
CREATE TRIGGER counsel_outcomes_immutable BEFORE UPDATE OR DELETE ON counsel_outcomes FOR EACH ROW EXECUTE FUNCTION reject_immutable_record_change();

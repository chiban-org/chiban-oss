CREATE TABLE "notice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"set_id" uuid NOT NULL,
	"requirement_key" text NOT NULL,
	"requirement_version" integer NOT NULL,
	"source" text NOT NULL,
	"channel" text NOT NULL,
	"recipient_key" text,
	"recipient_name" text,
	"recipient_address" text,
	"roles" text[] DEFAULT '{}'::text[] NOT NULL,
	"due_on" date NOT NULL,
	"counting_method" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notice_proof_supersessions" (
	"proof_id" uuid PRIMARY KEY NOT NULL,
	"superseded_by_proof_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notice_proofs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"method" text NOT NULL,
	"reference" text,
	"effective_on" date NOT NULL,
	"document_id" uuid NOT NULL,
	"recorded_by" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notice_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_kind" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"application_id" uuid,
	"anchor_date" date NOT NULL,
	"inherited_from" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notice_items" ADD CONSTRAINT "notice_items_set_id_notice_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."notice_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice_proof_supersessions" ADD CONSTRAINT "notice_proof_supersessions_proof_id_notice_proofs_id_fk" FOREIGN KEY ("proof_id") REFERENCES "public"."notice_proofs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice_proof_supersessions" ADD CONSTRAINT "notice_proof_supersessions_superseded_by_proof_id_notice_proofs_id_fk" FOREIGN KEY ("superseded_by_proof_id") REFERENCES "public"."notice_proofs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice_proofs" ADD CONSTRAINT "notice_proofs_item_id_notice_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."notice_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notice_items_set_idx" ON "notice_items" USING btree ("set_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notice_proof_supersessions_by_idx" ON "notice_proof_supersessions" USING btree ("superseded_by_proof_id","proof_id");--> statement-breakpoint
CREATE INDEX "notice_proofs_item_idx" ON "notice_proofs" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "notice_sets_subject_idx" ON "notice_sets" USING btree ("subject_kind","subject_id");--> statement-breakpoint
CREATE FUNCTION reject_notice_proof_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'notice proofs are insert-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER notice_proofs_immutable BEFORE UPDATE OR DELETE ON notice_proofs FOR EACH ROW EXECUTE FUNCTION reject_notice_proof_change();
--> statement-breakpoint
CREATE TRIGGER notice_proofs_no_truncate BEFORE TRUNCATE ON notice_proofs FOR EACH STATEMENT EXECUTE FUNCTION reject_notice_proof_change();
--> statement-breakpoint
CREATE TRIGGER notice_proof_supersessions_immutable BEFORE UPDATE OR DELETE ON notice_proof_supersessions FOR EACH ROW EXECUTE FUNCTION reject_notice_proof_change();
--> statement-breakpoint
CREATE TRIGGER notice_proof_supersessions_no_truncate BEFORE TRUNCATE ON notice_proof_supersessions FOR EACH STATEMENT EXECUTE FUNCTION reject_notice_proof_change();

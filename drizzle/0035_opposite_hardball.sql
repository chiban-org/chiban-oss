CREATE TABLE "application_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"reason" text NOT NULL,
	"body" jsonb NOT NULL,
	"body_sha256" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_snapshots_sequence_uq" UNIQUE("application_id","sequence")
);
--> statement-breakpoint
ALTER TABLE "application_snapshots" ADD CONSTRAINT "application_snapshots_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "application_snapshots_application_idx" ON "application_snapshots" USING btree ("application_id");
--> statement-breakpoint
CREATE TRIGGER application_snapshots_immutable BEFORE UPDATE OR DELETE ON application_snapshots FOR EACH ROW EXECUTE FUNCTION reject_immutable_record_change();

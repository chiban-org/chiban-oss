CREATE TABLE "complaints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"case_id" uuid,
	"channel" text NOT NULL,
	"received_on" date NOT NULL,
	"location_text" text NOT NULL,
	"parcel_id" uuid,
	"description_original" text NOT NULL,
	"description_public" text,
	"public_text_approved_by" uuid,
	"public_text_approved_at" timestamp with time zone,
	"complainant_name" text,
	"complainant_email" "citext",
	"complainant_phone" text,
	"created_by" uuid,
	"is_probe" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "complaints_number_unique" UNIQUE("number"),
	CONSTRAINT "complaints_anonymous_has_no_identity" CHECK ("complaints"."channel" <> 'anonymous_web' or ("complaints"."complainant_name" is null and "complaints"."complainant_email" is null and "complaints"."complainant_phone" is null and "complaints"."created_by" is null))
);
--> statement-breakpoint
CREATE TABLE "enforcement_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"parcel_id" uuid,
	"location_text" text NOT NULL,
	"status" text DEFAULT 'intake' NOT NULL,
	"opened_on" date NOT NULL,
	"closed_on" date,
	"closure_reason" text,
	"assigned_to" uuid,
	"is_public" boolean DEFAULT false NOT NULL,
	"public_summary" text,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enforcement_cases_number_unique" UNIQUE("number"),
	CONSTRAINT "enforcement_cases_public_summary_check" CHECK ("enforcement_cases"."is_public" = false or "enforcement_cases"."public_summary" is not null)
);
--> statement-breakpoint
CREATE TABLE "enforcement_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"observed_on" date NOT NULL,
	"body" text NOT NULL,
	"author_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "upload_intents" ADD COLUMN "doc_kind" text;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_case_id_enforcement_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."enforcement_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_parcel_id_parcels_id_fk" FOREIGN KEY ("parcel_id") REFERENCES "public"."parcels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enforcement_cases" ADD CONSTRAINT "enforcement_cases_parcel_id_parcels_id_fk" FOREIGN KEY ("parcel_id") REFERENCES "public"."parcels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enforcement_notes" ADD CONSTRAINT "enforcement_notes_case_id_enforcement_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."enforcement_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "complaints_case_idx" ON "complaints" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "enforcement_cases_status_idx" ON "enforcement_cases" USING btree ("status");--> statement-breakpoint
CREATE INDEX "enforcement_cases_parcel_idx" ON "enforcement_cases" USING btree ("parcel_id");--> statement-breakpoint
CREATE INDEX "enforcement_notes_case_idx" ON "enforcement_notes" USING btree ("case_id");
--> statement-breakpoint
CREATE TRIGGER enforcement_notes_immutable BEFORE UPDATE OR DELETE ON enforcement_notes FOR EACH ROW EXECUTE FUNCTION reject_immutable_record_change();

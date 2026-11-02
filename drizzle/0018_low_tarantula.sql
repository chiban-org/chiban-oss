CREATE TABLE "application_conditions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"code" text NOT NULL,
	"text_snapshot" text NOT NULL,
	"blocks_issuance" boolean NOT NULL,
	"status" text DEFAULT 'unmet' NOT NULL,
	"status_reason" text,
	"changed_by" uuid NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gate_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"gate_key" text NOT NULL,
	"kind" text NOT NULL,
	"reason" text,
	"legal_authority" jsonb,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid
);
--> statement-breakpoint
ALTER TABLE "application_conditions" ADD CONSTRAINT "application_conditions_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_overrides" ADD CONSTRAINT "gate_overrides_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "application_conditions_application_idx" ON "application_conditions" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "gate_overrides_application_idx" ON "gate_overrides" USING btree ("application_id");
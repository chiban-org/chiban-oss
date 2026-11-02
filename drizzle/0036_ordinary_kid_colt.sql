CREATE TABLE "legal_holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"placed_by" uuid NOT NULL,
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_by" uuid,
	"released_at" timestamp with time zone,
	"release_reason" text
);
--> statement-breakpoint
CREATE TABLE "record_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"application_id" uuid,
	"kind" text NOT NULL,
	"occurred_on" date NOT NULL,
	"recorded_by_kind" text NOT NULL,
	"recorded_by" uuid,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "retention_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_kind" text NOT NULL,
	"record_id" uuid NOT NULL,
	"series_key" text NOT NULL,
	"series_version" integer NOT NULL,
	"reason" text NOT NULL,
	"assigned_by_kind" text NOT NULL,
	"assigned_by" uuid,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "upload_intents" ADD COLUMN "series_key" text;--> statement-breakpoint
ALTER TABLE "record_events" ADD CONSTRAINT "record_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_events" ADD CONSTRAINT "record_events_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "legal_holds_target_idx" ON "legal_holds" USING btree ("target_kind","target_id");--> statement-breakpoint
CREATE INDEX "record_events_project_idx" ON "record_events" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "retention_assignments_current_idx" ON "retention_assignments" USING btree ("record_kind","record_id") WHERE "retention_assignments"."superseded_at" is null;--> statement-breakpoint
CREATE INDEX "retention_assignments_series_idx" ON "retention_assignments" USING btree ("series_key");
CREATE TABLE "inspection_item_results" (
	"inspection_id" uuid NOT NULL,
	"item_key" text NOT NULL,
	"label_snapshot" text NOT NULL,
	"required" boolean NOT NULL,
	"outcome" text NOT NULL,
	"note" text,
	CONSTRAINT "inspection_item_results_inspection_id_item_key_pk" PRIMARY KEY("inspection_id","item_key")
);
--> statement-breakpoint
CREATE TABLE "inspections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"checklist_version_id" uuid NOT NULL,
	"inspection_type" text NOT NULL,
	"is_final" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"channel" text NOT NULL,
	"requested_by_user_id" uuid,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"preferred_date" date,
	"contact_name" text NOT NULL,
	"contact_phone" text,
	"access_notes" text,
	"reinspection_of" uuid,
	"inspector_user_id" uuid,
	"scheduled_date" date,
	"start_minute" integer,
	"duration_minutes" integer,
	"calendar_sequence" integer DEFAULT 0 NOT NULL,
	"result_notes" text,
	"result_recorded_by" uuid,
	"result_recorded_at" timestamp with time zone,
	"cancel_reason" text,
	"off_grid_reason" text,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inspection_item_results" ADD CONSTRAINT "inspection_item_results_inspection_id_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_checklist_version_id_config_versions_id_fk" FOREIGN KEY ("checklist_version_id") REFERENCES "public"."config_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inspections_application_idx" ON "inspections" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "inspections_day_idx" ON "inspections" USING btree ("inspector_user_id","scheduled_date");--> statement-breakpoint
CREATE UNIQUE INDEX "inspections_slot_idx" ON "inspections" USING btree ("inspector_user_id","scheduled_date","start_minute") WHERE "inspections"."status" = 'scheduled';--> statement-breakpoint
CREATE UNIQUE INDEX "inspections_one_open_reinspection_idx" ON "inspections" USING btree ("reinspection_of") WHERE "inspections"."status" in ('requested', 'scheduled');
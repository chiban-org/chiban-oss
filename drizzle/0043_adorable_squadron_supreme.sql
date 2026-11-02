CREATE TABLE "calendar_pushes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inspection_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"op" text NOT NULL,
	"inspector_user_id" uuid NOT NULL,
	"target_kind" text NOT NULL,
	"scheduled_date" date NOT NULL,
	"start_minute" integer NOT NULL,
	"duration_minutes" integer NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"external_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "inspector_calendars" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"email" "citext" NOT NULL,
	"graph_user_id" text,
	"updated_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_pushes" ADD CONSTRAINT "calendar_pushes_inspection_id_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_pushes_dedup_idx" ON "calendar_pushes" USING btree ("inspection_id","sequence","op","inspector_user_id");--> statement-breakpoint
CREATE INDEX "calendar_pushes_status_idx" ON "calendar_pushes" USING btree ("status","created_at");
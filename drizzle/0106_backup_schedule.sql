CREATE TABLE "backup_schedule" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"target_id" uuid,
	"frequency" text DEFAULT 'daily' NOT NULL,
	"start_hour" integer DEFAULT 1 NOT NULL,
	"keep_count" integer DEFAULT 14 NOT NULL,
	"scheduled_since" timestamp with time zone,
	"next_due_at" timestamp with time zone,
	"run_requested_at" timestamp with time zone,
	"last_started_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_success_path" text,
	"last_success_bytes" bigint,
	"last_failure_at" timestamp with time zone,
	"last_failure_kind" text,
	"last_error" text,
	"last_prune_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "backup_schedule_single_row" CHECK ("backup_schedule"."id" = 1),
	CONSTRAINT "backup_schedule_start_hour" CHECK ("backup_schedule"."start_hour" between 0 and 23),
	CONSTRAINT "backup_schedule_keep_count" CHECK ("backup_schedule"."keep_count" between 1 and 365)
);
--> statement-breakpoint
ALTER TABLE "backup_schedule" ADD CONSTRAINT "backup_schedule_target_id_export_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."export_targets"("id") ON DELETE set null ON UPDATE no action;
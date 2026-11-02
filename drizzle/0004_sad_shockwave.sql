CREATE TABLE "job_runs" (
	"job_name" text PRIMARY KEY NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"last_error" text
);

CREATE TABLE "alert_tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" text NOT NULL,
	"token_hash" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"created_by_kind" text NOT NULL,
	CONSTRAINT "alert_tests_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "health_alerts" (
	"key" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"severity" text NOT NULL,
	"state" text NOT NULL,
	"summary" text NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"last_notified_at" timestamp with time zone,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "worker_state" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"started_at" timestamp with time zone NOT NULL
);

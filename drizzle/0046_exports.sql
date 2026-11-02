CREATE TABLE "exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"target_id" uuid,
	"base_export_id" uuid,
	"storage_key" text,
	"size_bytes" bigint,
	"manifest" jsonb,
	"manifest_sha256" text,
	"requested_by" uuid,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"error" text,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "exports_status_idx" ON "exports" USING btree ("status");
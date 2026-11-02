CREATE TABLE "historical_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_type" text NOT NULL,
	"number" text,
	"recorded_on" date,
	"description" text,
	"values" jsonb NOT NULL,
	"source_file" text NOT NULL,
	"source_sha256" text NOT NULL,
	"source_sheet" text NOT NULL,
	"source_row" integer NOT NULL,
	"imported_by" uuid NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "historical_records_source_unique" UNIQUE("source_sha256","source_sheet","source_row")
);
--> statement-breakpoint
CREATE INDEX "historical_records_recorded_on_idx" ON "historical_records" USING btree ("recorded_on");
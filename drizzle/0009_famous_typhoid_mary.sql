CREATE TABLE "gis_features" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"layer_key" text NOT NULL,
	"source_key" text NOT NULL,
	"name" text,
	"geom" geometry(Geometry, 4326) NOT NULL,
	CONSTRAINT "gis_features_source_unique" UNIQUE("layer_key","source_key")
);
--> statement-breakpoint
CREATE TABLE "gis_layers" (
	"key" text PRIMARY KEY NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"adapter" text,
	"source_url" text,
	"mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"stale_after_days" integer DEFAULT 90 NOT NULL,
	"refresh_interval_hours" integer DEFAULT 24 NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "import_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"layer_key" text NOT NULL,
	"first_run_id" uuid NOT NULL,
	"last_seen_run_id" uuid NOT NULL,
	"row_key" text NOT NULL,
	"kind" text NOT NULL,
	"content_hash" text NOT NULL,
	"payload" jsonb NOT NULL,
	"detail" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"disposition_by" uuid,
	"disposition_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"layer_key" text NOT NULL,
	"adapter" text NOT NULL,
	"actor_user_id" uuid,
	"actor_job" text,
	"input_hash" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"report" jsonb,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "import_exceptions" ADD CONSTRAINT "import_exceptions_first_run_id_import_runs_id_fk" FOREIGN KEY ("first_run_id") REFERENCES "public"."import_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_exceptions" ADD CONSTRAINT "import_exceptions_last_seen_run_id_import_runs_id_fk" FOREIGN KEY ("last_seen_run_id") REFERENCES "public"."import_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gis_features_geom_gist" ON "gis_features" USING gist ("geom");--> statement-breakpoint
CREATE UNIQUE INDEX "import_exceptions_open_unique" ON "import_exceptions" USING btree ("layer_key","row_key","kind","content_hash") WHERE "import_exceptions"."status" = 'open';--> statement-breakpoint
CREATE INDEX "import_exceptions_status_idx" ON "import_exceptions" USING btree ("layer_key","status");--> statement-breakpoint
CREATE INDEX "import_runs_layer_idx" ON "import_runs" USING btree ("layer_key","started_at");--> statement-breakpoint
INSERT INTO "gis_layers" ("key", "required") VALUES ('parcels', true), ('roads', false), ('water', false);

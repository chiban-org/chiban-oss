CREATE TABLE "config_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"body" jsonb NOT NULL,
	"upstream_template_id" text,
	"upstream_template_version" integer,
	"rolled_back_from" integer,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_by" uuid,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "config_versions_kind_key_version_uq" ON "config_versions" USING btree ("kind","key","version");--> statement-breakpoint
CREATE UNIQUE INDEX "config_versions_one_published_uq" ON "config_versions" USING btree ("kind","key") WHERE "config_versions"."status" = 'published';
CREATE TABLE "town_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provision_kind" text NOT NULL,
	"reference" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "violation_findings" ADD COLUMN "withdrawn_reason" text;--> statement-breakpoint
ALTER TABLE "violation_findings" ADD COLUMN "withdrawn_by" uuid;--> statement-breakpoint
ALTER TABLE "violation_findings" ADD COLUMN "withdrawn_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "violation_findings" ADD COLUMN "corrected_on" date;--> statement-breakpoint
ALTER TABLE "violation_findings" ADD COLUMN "corrected_note" text;--> statement-breakpoint
ALTER TABLE "violation_findings" ADD COLUMN "corrected_by" uuid;--> statement-breakpoint
CREATE INDEX "town_sections_kind_idx" ON "town_sections" USING btree ("provision_kind");--> statement-breakpoint
CREATE UNIQUE INDEX "town_sections_active_reference_uq" ON "town_sections" USING btree ("provision_kind",lower("reference")) WHERE "town_sections"."active";
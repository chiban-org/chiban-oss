CREATE TABLE "parcel_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parcel_id" uuid NOT NULL,
	"format" text NOT NULL,
	"value" text NOT NULL,
	"value_normalized" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"source" text NOT NULL,
	"retired_on" date,
	"retired_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parcel_id_formats" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"kind" text NOT NULL,
	"width" integer,
	"is_display" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parcels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"geom" geometry(MultiPolygon, 4326),
	"site_address" text,
	"owner_name" text,
	"mailing_address" text,
	"status" text DEFAULT 'active' NOT NULL,
	"retired_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "parcel_aliases" ADD CONSTRAINT "parcel_aliases_parcel_id_parcels_id_fk" FOREIGN KEY ("parcel_id") REFERENCES "public"."parcels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcel_aliases" ADD CONSTRAINT "parcel_aliases_format_parcel_id_formats_key_fk" FOREIGN KEY ("format") REFERENCES "public"."parcel_id_formats"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "parcel_aliases_active_unique" ON "parcel_aliases" USING btree ("format","value") WHERE "parcel_aliases"."status" = 'active';--> statement-breakpoint
CREATE INDEX "parcel_aliases_normalized_idx" ON "parcel_aliases" USING btree ("value_normalized" text_pattern_ops);--> statement-breakpoint
CREATE INDEX "parcel_aliases_parcel_idx" ON "parcel_aliases" USING btree ("parcel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "parcel_id_formats_one_display" ON "parcel_id_formats" USING btree ("is_display") WHERE "parcel_id_formats"."is_display";--> statement-breakpoint
CREATE INDEX "parcels_geom_gist" ON "parcels" USING gist ("geom");--> statement-breakpoint
CREATE INDEX "parcels_site_address_trgm" ON "parcels" USING gin ("site_address" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "parcels_owner_name_trgm" ON "parcels" USING gin ("owner_name" gin_trgm_ops);
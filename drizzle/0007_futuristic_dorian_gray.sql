CREATE TABLE "parcel_lineage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"effective_date" date NOT NULL,
	"effective_basis" text NOT NULL,
	"reference" text,
	"note" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parcel_lineage_links" (
	"event_id" uuid NOT NULL,
	"parcel_id" uuid NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "parcel_lineage_links_event_id_parcel_id_role_pk" PRIMARY KEY("event_id","parcel_id","role")
);
--> statement-breakpoint
ALTER TABLE "parcel_lineage_links" ADD CONSTRAINT "parcel_lineage_links_event_id_parcel_lineage_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."parcel_lineage_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcel_lineage_links" ADD CONSTRAINT "parcel_lineage_links_parcel_id_parcels_id_fk" FOREIGN KEY ("parcel_id") REFERENCES "public"."parcels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "parcel_lineage_links_parcel_idx" ON "parcel_lineage_links" USING btree ("parcel_id");
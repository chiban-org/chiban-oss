CREATE TABLE "parcel_record_carry_forwards" (
	"link_id" uuid NOT NULL,
	"to_parcel_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parcel_record_carry_forwards_link_id_to_parcel_id_pk" PRIMARY KEY("link_id","to_parcel_id")
);
--> statement-breakpoint
CREATE TABLE "parcel_record_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_kind" text NOT NULL,
	"record_id" uuid NOT NULL,
	"parcel_id" uuid,
	"raw_ref_format" text,
	"raw_ref_value" text,
	"status" text NOT NULL,
	"linked_via" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parcel_record_links_unique" UNIQUE("record_kind","record_id","parcel_id")
);
--> statement-breakpoint
ALTER TABLE "parcel_record_carry_forwards" ADD CONSTRAINT "parcel_record_carry_forwards_link_id_parcel_record_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."parcel_record_links"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcel_record_carry_forwards" ADD CONSTRAINT "parcel_record_carry_forwards_to_parcel_id_parcels_id_fk" FOREIGN KEY ("to_parcel_id") REFERENCES "public"."parcels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcel_record_links" ADD CONSTRAINT "parcel_record_links_parcel_id_parcels_id_fk" FOREIGN KEY ("parcel_id") REFERENCES "public"."parcels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "parcel_record_links_parcel_idx" ON "parcel_record_links" USING btree ("parcel_id");--> statement-breakpoint
CREATE INDEX "parcel_record_links_status_idx" ON "parcel_record_links" USING btree ("status");
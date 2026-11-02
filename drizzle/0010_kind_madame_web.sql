CREATE TABLE "alias_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"format" text NOT NULL,
	"value" text NOT NULL,
	"parcel_id" uuid NOT NULL,
	"replaced_parcel_id" uuid,
	"reason" text NOT NULL,
	"expires_on" date,
	"superseded_by" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alias_overrides" ADD CONSTRAINT "alias_overrides_parcel_id_parcels_id_fk" FOREIGN KEY ("parcel_id") REFERENCES "public"."parcels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alias_overrides" ADD CONSTRAINT "alias_overrides_replaced_parcel_id_parcels_id_fk" FOREIGN KEY ("replaced_parcel_id") REFERENCES "public"."parcels"("id") ON DELETE no action ON UPDATE no action;
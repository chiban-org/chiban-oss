CREATE TABLE "application_parcels" (
	"application_id" uuid NOT NULL,
	"parcel_id" uuid NOT NULL,
	"added_by" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_parcels_application_id_parcel_id_pk" PRIMARY KEY("application_id","parcel_id")
);
--> statement-breakpoint
ALTER TABLE "application_parcels" ADD CONSTRAINT "application_parcels_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_parcels" ADD CONSTRAINT "application_parcels_parcel_id_parcels_id_fk" FOREIGN KEY ("parcel_id") REFERENCES "public"."parcels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "application_parcels_parcel_idx" ON "application_parcels" USING btree ("parcel_id");
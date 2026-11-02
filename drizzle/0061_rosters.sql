CREATE TABLE "application_professionals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"name" text NOT NULL,
	"profession" text NOT NULL,
	"business_address" text NOT NULL,
	"seal_on_plat" boolean NOT NULL,
	"added_by" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "association_rosters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parcel_id" uuid NOT NULL,
	"association_name" text NOT NULL,
	"officers" jsonb NOT NULL,
	"as_of" date NOT NULL,
	"updated_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "park_rosters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parcel_id" uuid NOT NULL,
	"park_name" text NOT NULL,
	"owner_name" text NOT NULL,
	"owner_mailing_address" text NOT NULL,
	"tenants" jsonb NOT NULL,
	"as_of" date NOT NULL,
	"updated_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restriction_holdings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parcel_id" uuid NOT NULL,
	"holder_name" text NOT NULL,
	"holder_mailing_address" text NOT NULL,
	"restriction_kind" text NOT NULL,
	"recorded_reference" text NOT NULL,
	"ended_on" date,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roster_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"reviewed_on" date NOT NULL,
	"reviewed_by" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application_professionals" ADD CONSTRAINT "application_professionals_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "association_rosters" ADD CONSTRAINT "association_rosters_parcel_id_parcels_id_fk" FOREIGN KEY ("parcel_id") REFERENCES "public"."parcels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "park_rosters" ADD CONSTRAINT "park_rosters_parcel_id_parcels_id_fk" FOREIGN KEY ("parcel_id") REFERENCES "public"."parcels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restriction_holdings" ADD CONSTRAINT "restriction_holdings_parcel_id_parcels_id_fk" FOREIGN KEY ("parcel_id") REFERENCES "public"."parcels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "application_professionals_application_idx" ON "application_professionals" USING btree ("application_id");--> statement-breakpoint
CREATE UNIQUE INDEX "association_rosters_parcel_idx" ON "association_rosters" USING btree ("parcel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "park_rosters_parcel_idx" ON "park_rosters" USING btree ("parcel_id");--> statement-breakpoint
CREATE INDEX "restriction_holdings_parcel_idx" ON "restriction_holdings" USING btree ("parcel_id");--> statement-breakpoint
CREATE INDEX "roster_reviews_kind_idx" ON "roster_reviews" USING btree ("kind","reviewed_on");
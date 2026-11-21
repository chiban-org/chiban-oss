CREATE TABLE "development_holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parcel_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"placed_on" date NOT NULL,
	"placed_by" uuid NOT NULL,
	"released_on" date,
	"released_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enforcement_civil_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"filed_on" date NOT NULL,
	"court" text NOT NULL,
	"docket" text,
	"recorded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hold_permit_actions" (
	"hold_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"action" text NOT NULL,
	"acted_on" date NOT NULL,
	"acted_by" uuid NOT NULL,
	"reinstated_on" date,
	CONSTRAINT "hold_permit_actions_hold_id_application_id_pk" PRIMARY KEY("hold_id","application_id")
);
--> statement-breakpoint
ALTER TABLE "development_holds" ADD CONSTRAINT "development_holds_parcel_id_parcels_id_fk" FOREIGN KEY ("parcel_id") REFERENCES "public"."parcels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "development_holds" ADD CONSTRAINT "development_holds_case_id_enforcement_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."enforcement_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enforcement_civil_actions" ADD CONSTRAINT "enforcement_civil_actions_case_id_enforcement_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."enforcement_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hold_permit_actions" ADD CONSTRAINT "hold_permit_actions_hold_id_development_holds_id_fk" FOREIGN KEY ("hold_id") REFERENCES "public"."development_holds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hold_permit_actions" ADD CONSTRAINT "hold_permit_actions_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "development_holds_case_idx" ON "development_holds" USING btree ("case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "development_holds_active_parcel_idx" ON "development_holds" USING btree ("parcel_id") WHERE "development_holds"."released_on" is null;--> statement-breakpoint
CREATE INDEX "enforcement_civil_actions_case_idx" ON "enforcement_civil_actions" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "hold_permit_actions_application_idx" ON "hold_permit_actions" USING btree ("application_id");
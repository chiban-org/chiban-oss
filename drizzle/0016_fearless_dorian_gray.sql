CREATE TABLE "application_number_counters" (
	"prefix" text NOT NULL,
	"year" integer NOT NULL,
	"last" integer NOT NULL,
	CONSTRAINT "application_number_counters_prefix_year_pk" PRIMARY KEY("prefix","year")
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigserial NOT NULL,
	"project_id" uuid NOT NULL,
	"number" text NOT NULL,
	"application_type_key" text NOT NULL,
	"config_pins" jsonb NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"substep" text,
	"row_version" integer DEFAULT 1 NOT NULL,
	"values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"facts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"received_date" date,
	"completed_date" date,
	"decided_on" date,
	"issued_on" date,
	"closure_reason" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applications_seq_unique" UNIQUE("seq"),
	CONSTRAINT "applications_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "attestations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"statement_text" text NOT NULL,
	"statement_sha256" text NOT NULL,
	"attested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_parties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid,
	"email" "citext",
	"name" text NOT NULL,
	"role" text NOT NULL,
	"owner_authorization_on_file" boolean DEFAULT false NOT NULL,
	"added_by" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parcel_id" uuid NOT NULL,
	"title" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attestations" ADD CONSTRAINT "attestations_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_parties" ADD CONSTRAINT "project_parties_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_parcel_id_parcels_id_fk" FOREIGN KEY ("parcel_id") REFERENCES "public"."parcels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "applications_project_idx" ON "applications" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "applications_state_idx" ON "applications" USING btree ("state");--> statement-breakpoint
CREATE INDEX "project_parties_project_idx" ON "project_parties" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_parties_user_idx" ON "project_parties" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "projects_parcel_idx" ON "projects" USING btree ("parcel_id");
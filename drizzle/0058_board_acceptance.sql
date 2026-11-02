CREATE TABLE "acceptance_schedules" (
	"application_id" uuid PRIMARY KEY NOT NULL,
	"meeting_id" uuid NOT NULL,
	"set_by" uuid NOT NULL,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "completeness_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"meeting_id" uuid NOT NULL,
	"voted_on" date NOT NULL,
	"outcome" text NOT NULL,
	"reason" text,
	"recorded_by" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "selectmen_certifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"requested_on" date NOT NULL,
	"outcome" text NOT NULL,
	"decided_on" date,
	"recorded_by" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "acceptance_schedules" ADD CONSTRAINT "acceptance_schedules_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acceptance_schedules" ADD CONSTRAINT "acceptance_schedules_meeting_id_board_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."board_meetings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "completeness_votes" ADD CONSTRAINT "completeness_votes_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "completeness_votes" ADD CONSTRAINT "completeness_votes_meeting_id_board_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."board_meetings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selectmen_certifications" ADD CONSTRAINT "selectmen_certifications_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "completeness_votes_application_idx" ON "completeness_votes" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "selectmen_certifications_application_idx" ON "selectmen_certifications" USING btree ("application_id");
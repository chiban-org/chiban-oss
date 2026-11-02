ALTER TABLE "record_events" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "record_events" ADD COLUMN "case_id" uuid;--> statement-breakpoint
ALTER TABLE "record_events" ADD CONSTRAINT "record_events_case_id_enforcement_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."enforcement_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "record_events_case_idx" ON "record_events" USING btree ("case_id");--> statement-breakpoint
ALTER TABLE "record_events" ADD CONSTRAINT "record_events_one_target_check" CHECK (("record_events"."project_id" is null) <> ("record_events"."case_id" is null));
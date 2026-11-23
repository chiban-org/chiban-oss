ALTER TABLE "record_events" DROP CONSTRAINT "record_events_one_target_check";--> statement-breakpoint
ALTER TABLE "record_events" ADD COLUMN "rtk_request_id" uuid;--> statement-breakpoint
ALTER TABLE "record_events" ADD CONSTRAINT "record_events_rtk_request_id_rtk_requests_id_fk" FOREIGN KEY ("rtk_request_id") REFERENCES "public"."rtk_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "record_events_rtk_request_idx" ON "record_events" USING btree ("rtk_request_id");--> statement-breakpoint
ALTER TABLE "record_events" ADD CONSTRAINT "record_events_one_target_check" CHECK (num_nonnulls("record_events"."project_id", "record_events"."case_id", "record_events"."rtk_request_id") = 1);
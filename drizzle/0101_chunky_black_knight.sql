DROP INDEX "report_schedule_deliveries_once_idx";--> statement-breakpoint
ALTER TABLE "report_schedule_deliveries" ADD COLUMN "report" text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "report_schedule_deliveries_once_idx" ON "report_schedule_deliveries" USING btree ("schedule_id","user_id","report","period_from","period_to");
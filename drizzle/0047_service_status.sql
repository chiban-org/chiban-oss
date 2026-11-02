ALTER TABLE "town_settings" ADD COLUMN "service_status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "town_settings" ADD COLUMN "service_status_since" date;--> statement-breakpoint
ALTER TABLE "town_settings" ADD COLUMN "export_window_days" integer DEFAULT 90 NOT NULL;
ALTER TABLE "payment_attempts" ADD COLUMN "last_check_error" text;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "last_checked_at" timestamp with time zone;
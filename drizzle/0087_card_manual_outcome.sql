ALTER TABLE "payment_attempts" ADD COLUMN "manual_outcome" text;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "manual_note" text;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "manual_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "manual_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "processor_mismatch" text;
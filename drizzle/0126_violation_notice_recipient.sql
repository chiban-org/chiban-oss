ALTER TABLE "violation_notices" ADD COLUMN "recipient_name" text;--> statement-breakpoint
ALTER TABLE "violation_notices" ADD COLUMN "recipient_address" text;--> statement-breakpoint
ALTER TABLE "violation_notices" ADD COLUMN "correct_by" date;
ALTER TABLE "association_rosters" ADD COLUMN "checked_on" date;--> statement-breakpoint
ALTER TABLE "park_rosters" ADD COLUMN "checked_on" date;--> statement-breakpoint
ALTER TABLE "restriction_holdings" ADD COLUMN "ended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "restriction_holdings" ADD COLUMN "checked_on" date;--> statement-breakpoint
UPDATE "restriction_holdings" SET "checked_on" = ("created_at" AT TIME ZONE 'UTC')::date WHERE "checked_on" IS NULL;--> statement-breakpoint
UPDATE "restriction_holdings" SET "ended_at" = "created_at" WHERE "ended_on" IS NOT NULL AND "ended_at" IS NULL;

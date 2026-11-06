DROP INDEX "association_rosters_parcel_idx";--> statement-breakpoint
DROP INDEX "park_rosters_parcel_idx";--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "responsible_user_id" uuid;--> statement-breakpoint
ALTER TABLE "association_rosters" ADD COLUMN "ended_on" date;--> statement-breakpoint
ALTER TABLE "association_rosters" ADD COLUMN "ended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "park_rosters" ADD COLUMN "ended_on" date;--> statement-breakpoint
ALTER TABLE "park_rosters" ADD COLUMN "ended_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "applications_responsible_idx" ON "applications" USING btree ("responsible_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "association_rosters_parcel_idx" ON "association_rosters" USING btree ("parcel_id") WHERE "association_rosters"."ended_on" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "park_rosters_parcel_idx" ON "park_rosters" USING btree ("parcel_id") WHERE "park_rosters"."ended_on" is null;
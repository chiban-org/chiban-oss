ALTER TABLE "magic_links" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "magic_links" ADD COLUMN "email" text;--> statement-breakpoint
UPDATE "magic_links" SET "email" = (SELECT "users"."email" FROM "users" WHERE "users"."id" = "magic_links"."user_id");--> statement-breakpoint
ALTER TABLE "magic_links" ALTER COLUMN "email" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "magic_links_email_idx" ON "magic_links" USING btree ("email");

ALTER TABLE "review_assignments" ALTER COLUMN "reviewer_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "review_assignments" ADD COLUMN "board_id" uuid;--> statement-breakpoint
ALTER TABLE "review_assignments" ADD COLUMN "comment_by" date;--> statement-breakpoint
ALTER TABLE "review_comments" ADD COLUMN "author_user_id" uuid;--> statement-breakpoint
UPDATE "review_comments" rc SET "author_user_id" = ra."reviewer_user_id" FROM "review_assignments" ra WHERE ra."id" = rc."assignment_id";--> statement-breakpoint
ALTER TABLE "review_assignments" ADD CONSTRAINT "review_assignments_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "review_assignments_active_board_idx" ON "review_assignments" USING btree ("application_id","board_id") WHERE "review_assignments"."removed_at" is null and "review_assignments"."board_id" is not null;--> statement-breakpoint
CREATE INDEX "review_assignments_board_idx" ON "review_assignments" USING btree ("board_id");--> statement-breakpoint
ALTER TABLE "review_assignments" ADD CONSTRAINT "review_assignments_one_assignee" CHECK (num_nonnulls("review_assignments"."reviewer_user_id", "review_assignments"."board_id") = 1);--> statement-breakpoint
ALTER TABLE "review_assignments" ADD CONSTRAINT "review_assignments_board_comment_by" CHECK ("review_assignments"."comment_by" is null or "review_assignments"."board_id" is not null);--> statement-breakpoint
ALTER TABLE "review_assignments" ADD CONSTRAINT "review_assignments_board_no_sign_off" CHECK ("review_assignments"."board_id" is null or "review_assignments"."status" <> 'signed_off');
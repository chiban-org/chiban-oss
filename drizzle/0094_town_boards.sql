CREATE TABLE "boards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "boards_one_active_unique_kind_idx" ON "boards" USING btree ("kind") WHERE "boards"."archived_at" is null and "boards"."kind" in ('planning_board', 'zba');--> statement-breakpoint
INSERT INTO "boards" ("kind", "name", "short_name")
SELECT k.kind,
	COALESCE(
		(SELECT e.value->>'label'
			FROM "config_versions" cv, jsonb_array_elements(cv.body->'boards') AS e
			WHERE cv.kind = 'board_settings' AND cv.key = 'default' AND cv.status = 'published'
				AND e.value->>'board' = k.kind
			LIMIT 1),
		k.fallback_name),
	k.short_name
FROM (VALUES
	('planning_board', 'Alder Pond Planning Board', 'Planning Board'),
	('zba', 'Alder Pond Zoning Board of Adjustment', 'Zoning Board of Adjustment')
) AS k(kind, fallback_name, short_name);--> statement-breakpoint
DROP INDEX "board_meetings_scheduled_idx";--> statement-breakpoint
ALTER TABLE "board_memberships" ADD COLUMN "board_id" uuid;--> statement-breakpoint
ALTER TABLE "board_packets" ADD COLUMN "board_id" uuid;--> statement-breakpoint
ALTER TABLE "board_meetings" ADD COLUMN "board_id" uuid;--> statement-breakpoint
UPDATE "board_memberships" t SET "board_id" = b.id FROM "boards" b WHERE b.kind = t.board;--> statement-breakpoint
UPDATE "board_packets" t SET "board_id" = b.id FROM "boards" b WHERE b.kind = t.board;--> statement-breakpoint
UPDATE "board_meetings" t SET "board_id" = b.id FROM "boards" b WHERE b.kind = t.board;--> statement-breakpoint
ALTER TABLE "board_memberships" ALTER COLUMN "board_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "board_packets" ALTER COLUMN "board_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "board_meetings" ALTER COLUMN "board_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "board_memberships" ADD CONSTRAINT "board_memberships_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_packets" ADD CONSTRAINT "board_packets_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_meetings" ADD CONSTRAINT "board_meetings_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_memberships" DROP COLUMN "board";--> statement-breakpoint
ALTER TABLE "board_packets" DROP COLUMN "board";--> statement-breakpoint
ALTER TABLE "board_meetings" DROP COLUMN "board";--> statement-breakpoint
CREATE UNIQUE INDEX "board_meetings_scheduled_idx" ON "board_meetings" USING btree ("board_id","meeting_date","kind") WHERE "board_meetings"."status" = 'scheduled';--> statement-breakpoint
UPDATE "config_versions" cv SET "body" = jsonb_set(cv.body, '{boards}', COALESCE((
	SELECT jsonb_agg((e.value - 'board' - 'label') || jsonb_build_object('boardId', b.id) ORDER BY e.ord)
	FROM jsonb_array_elements(cv.body->'boards') WITH ORDINALITY AS e(value, ord)
	JOIN "boards" b ON b.kind = e.value->>'board'
), '[]'::jsonb))
WHERE cv.kind = 'board_settings' AND jsonb_typeof(cv.body->'boards') = 'array';--> statement-breakpoint
UPDATE "config_versions" cv SET "body" = jsonb_set(cv.body, '{boardOverrides}', COALESCE((
	SELECT jsonb_object_agg(b.id::text, o.value)
	FROM jsonb_each(cv.body->'boardOverrides') AS o
	JOIN "boards" b ON b.kind = o.key
), '{}'::jsonb))
WHERE cv.kind = 'town_profile' AND jsonb_typeof(cv.body->'boardOverrides') = 'object';

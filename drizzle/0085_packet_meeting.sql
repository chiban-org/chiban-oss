ALTER TABLE "board_packets" ADD COLUMN "meeting_id" uuid;--> statement-breakpoint
ALTER TABLE "board_packets" ADD CONSTRAINT "board_packets_meeting_id_board_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."board_meetings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "board_packets_meeting_idx" ON "board_packets" USING btree ("meeting_id");--> statement-breakpoint
WITH "candidates" AS (
  SELECT "bp"."id" AS "packet_id", "m"."id" AS "meeting_id", "bp"."created_at"
  FROM "board_packets" "bp"
  JOIN "board_meetings" "m"
    ON "m"."board" = "bp"."board" AND "m"."meeting_date" = "bp"."meeting_date" AND "m"."status" = 'scheduled'
),
"single_meeting" AS (
  SELECT "packet_id", min("meeting_id"::text)::uuid AS "meeting_id", min("created_at") AS "created_at"
  FROM "candidates"
  GROUP BY "packet_id"
  HAVING count(*) = 1
),
"latest_per_meeting" AS (
  SELECT DISTINCT ON ("meeting_id") "packet_id", "meeting_id"
  FROM "single_meeting"
  ORDER BY "meeting_id", "created_at" DESC, "packet_id" DESC
)
UPDATE "board_packets" SET "meeting_id" = "latest_per_meeting"."meeting_id"
FROM "latest_per_meeting"
WHERE "board_packets"."id" = "latest_per_meeting"."packet_id";

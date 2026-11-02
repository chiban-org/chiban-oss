CREATE TABLE "file_deletions" (
	"sha256" text PRIMARY KEY NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"batch_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_tombstones" (
	"sha256" text PRIMARY KEY NOT NULL,
	"size_bytes" bigint NOT NULL,
	"content_type" text NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"batch_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "file_deletions" ADD CONSTRAINT "file_deletions_batch_id_disposition_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."disposition_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_tombstones" ADD CONSTRAINT "file_tombstones_batch_id_disposition_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."disposition_batches"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE TRIGGER file_tombstones_immutable BEFORE UPDATE OR DELETE ON file_tombstones FOR EACH ROW EXECUTE FUNCTION reject_immutable_record_change();

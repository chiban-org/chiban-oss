CREATE TABLE "disposition_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"as_of" date NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"proposed_by" uuid NOT NULL,
	"proposed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"executed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "disposition_items" (
	"batch_id" uuid NOT NULL,
	"record_kind" text NOT NULL,
	"record_id" uuid NOT NULL,
	"series_key" text NOT NULL,
	"series_version" text NOT NULL,
	"eligible_on" date NOT NULL,
	"outcome" text,
	CONSTRAINT "disposition_items_batch_id_record_kind_record_id_pk" PRIMARY KEY("batch_id","record_kind","record_id")
);
--> statement-breakpoint
CREATE TABLE "disposition_tombstones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"record_kind" text NOT NULL,
	"record_id" uuid NOT NULL,
	"title" text NOT NULL,
	"series_key" text NOT NULL,
	"series_version" text NOT NULL,
	"series_citation" jsonb NOT NULL,
	"retention_basis" jsonb NOT NULL,
	"version_ids" uuid[] NOT NULL,
	"file_sha256s" text[] NOT NULL,
	"proposed_by" uuid NOT NULL,
	"approved_by" uuid NOT NULL,
	"executed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "disposition_tombstones_record_uq" UNIQUE("record_kind","record_id")
);
--> statement-breakpoint
ALTER TABLE "board_packet_access" DROP CONSTRAINT "board_packet_access_version_id_document_versions_id_fk";
--> statement-breakpoint
ALTER TABLE "board_packet_items" ALTER COLUMN "version_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "rtk_release_items" ALTER COLUMN "approval_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "board_packet_items" ADD COLUMN "former_version_id" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "disposed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "disposed_tombstone_id" uuid;--> statement-breakpoint
ALTER TABLE "rtk_release_items" ADD COLUMN "former_version_id" uuid;--> statement-breakpoint
ALTER TABLE "disposition_items" ADD CONSTRAINT "disposition_items_batch_id_disposition_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."disposition_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disposition_tombstones" ADD CONSTRAINT "disposition_tombstones_batch_id_disposition_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."disposition_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "disposition_batches_status_idx" ON "disposition_batches" USING btree ("status","proposed_at");--> statement-breakpoint
CREATE INDEX "disposition_items_record_idx" ON "disposition_items" USING btree ("record_kind","record_id");
--> statement-breakpoint
CREATE FUNCTION disposition_may_delete(target_kind text, target_id uuid) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM disposition_batches b
    JOIN disposition_items i ON i.batch_id = b.id
    JOIN disposition_tombstones t
      ON t.batch_id = b.id AND t.record_kind = i.record_kind AND t.record_id = i.record_id
    WHERE b.status = 'executing'
      AND b.id::text = current_setting('chiban.disposition', true)
      AND i.record_kind = target_kind
      AND i.record_id = target_id
      AND i.outcome IS NULL
  );
$$ LANGUAGE sql STABLE;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION reject_document_version_change() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE'
    AND current_setting('chiban.probe_purge', true) = 'on'
    AND EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = OLD.document_id
        AND d.record_kind = 'enforcement_case'
        AND EXISTS (SELECT 1 FROM complaints c WHERE c.case_id = d.record_id AND c.is_probe)
        AND NOT EXISTS (SELECT 1 FROM complaints c WHERE c.case_id = d.record_id AND NOT c.is_probe)
    ) THEN
    RETURN OLD;
  END IF;
  IF TG_OP = 'DELETE' AND disposition_may_delete('document', OLD.document_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'E_DB_003 % on % is not allowed: the table is insert-only', TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE FUNCTION reject_snapshot_change() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND disposition_may_delete('application_snapshot', OLD.id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'E_DB_003 % on % is not allowed: the table is insert-only', TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER application_snapshots_immutable ON application_snapshots;
--> statement-breakpoint
CREATE TRIGGER application_snapshots_immutable BEFORE UPDATE OR DELETE ON application_snapshots FOR EACH ROW EXECUTE FUNCTION reject_snapshot_change();
--> statement-breakpoint
CREATE TRIGGER disposition_tombstones_immutable BEFORE UPDATE OR DELETE ON disposition_tombstones FOR EACH ROW EXECUTE FUNCTION reject_immutable_record_change();

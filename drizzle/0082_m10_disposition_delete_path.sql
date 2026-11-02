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

CREATE OR REPLACE FUNCTION reject_document_version_change() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('chiban.probe_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'E_DB_003 % on % is not allowed: the table is insert-only', TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER document_versions_immutable ON document_versions;
--> statement-breakpoint
CREATE TRIGGER document_versions_immutable BEFORE UPDATE OR DELETE ON document_versions FOR EACH ROW EXECUTE FUNCTION reject_document_version_change();

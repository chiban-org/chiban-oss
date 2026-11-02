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
  RAISE EXCEPTION 'E_DB_003 % on % is not allowed: the table is insert-only', TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

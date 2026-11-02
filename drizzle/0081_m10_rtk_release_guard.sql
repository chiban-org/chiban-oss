CREATE FUNCTION reject_rtk_release_change() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.link_revoked_at IS NULL
    AND NEW.link_revoked_at IS NOT NULL
    AND (to_jsonb(NEW) - 'link_revoked_at') = (to_jsonb(OLD) - 'link_revoked_at') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
    AND OLD.letter_document_id IS NULL
    AND NEW.letter_document_id IS NOT NULL
    AND (to_jsonb(NEW) - 'letter_document_id') = (to_jsonb(OLD) - 'letter_document_id') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'E_DB_003 % on % is not allowed: the table is insert-only', TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER rtk_releases_immutable BEFORE UPDATE OR DELETE ON rtk_releases FOR EACH ROW EXECUTE FUNCTION reject_rtk_release_change();

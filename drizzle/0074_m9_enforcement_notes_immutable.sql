CREATE TRIGGER enforcement_notes_immutable BEFORE UPDATE OR DELETE ON enforcement_notes FOR EACH ROW EXECUTE FUNCTION reject_immutable_record_change();

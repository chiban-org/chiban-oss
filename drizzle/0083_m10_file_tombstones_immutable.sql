CREATE TRIGGER file_tombstones_immutable BEFORE UPDATE OR DELETE ON file_tombstones FOR EACH ROW EXECUTE FUNCTION reject_immutable_record_change();

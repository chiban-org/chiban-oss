CREATE TRIGGER counsel_outcomes_immutable BEFORE UPDATE OR DELETE ON counsel_outcomes FOR EACH ROW EXECUTE FUNCTION reject_immutable_record_change();

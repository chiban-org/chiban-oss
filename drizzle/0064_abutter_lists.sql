CREATE TABLE "abutter_list_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"parcel_id" uuid NOT NULL,
	"reasons" jsonb NOT NULL,
	"excluded" boolean DEFAULT false NOT NULL,
	"exclusion_reason" text,
	CONSTRAINT "abutter_list_candidates_unique" UNIQUE("list_id","parcel_id")
);
--> statement-breakpoint
CREATE TABLE "abutter_list_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"origin_key" text NOT NULL,
	"position" integer NOT NULL,
	"data" jsonb NOT NULL,
	"excluded" boolean DEFAULT false NOT NULL,
	"exclusion_reason" text,
	"qualifies" boolean,
	"decision_reason" text,
	CONSTRAINT "abutter_list_recipients_unique" UNIQUE("list_id","origin_key")
);
--> statement-breakpoint
CREATE TABLE "abutter_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"strategy_key" text NOT NULL,
	"strategy_version" integer NOT NULL,
	"resolver_key" text NOT NULL,
	"resolver_version" integer NOT NULL,
	"drawn_on" date NOT NULL,
	"layers" jsonb NOT NULL,
	"incomplete" jsonb NOT NULL,
	"crossings_attested_by" uuid,
	"crossings_attested_at" timestamp with time zone,
	"issued_by" uuid,
	"issued_at" timestamp with time zone,
	"snapshot" jsonb,
	"snapshot_sha256" text,
	"superseded_by" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "abutter_lists_version_unique" UNIQUE("application_id","version")
);
--> statement-breakpoint
ALTER TABLE "abutter_list_candidates" ADD CONSTRAINT "abutter_list_candidates_list_id_abutter_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."abutter_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abutter_list_candidates" ADD CONSTRAINT "abutter_list_candidates_parcel_id_parcels_id_fk" FOREIGN KEY ("parcel_id") REFERENCES "public"."parcels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abutter_list_recipients" ADD CONSTRAINT "abutter_list_recipients_list_id_abutter_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."abutter_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abutter_lists" ADD CONSTRAINT "abutter_lists_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "abutter_lists_one_issued_idx" ON "abutter_lists" USING btree ("application_id") WHERE "abutter_lists"."status" = 'issued';
--> statement-breakpoint
CREATE FUNCTION abutter_list_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'issued' THEN
      RAISE EXCEPTION 'E_DB_003 an issued abutter list cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'issued' THEN
    IF NEW.status = 'superseded'
       AND NEW.superseded_by IS NOT NULL
       AND (to_jsonb(NEW) - 'status' - 'superseded_by') = (to_jsonb(OLD) - 'status' - 'superseded_by') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'E_DB_003 an issued abutter list may only be superseded';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER abutter_lists_guard BEFORE UPDATE OR DELETE ON abutter_lists FOR EACH ROW EXECUTE FUNCTION abutter_list_guard();
--> statement-breakpoint
CREATE FUNCTION abutter_list_child_guard() RETURNS trigger AS $$
DECLARE
  list_status text;
  target_list uuid;
BEGIN
  target_list := OLD.list_id;
  SELECT status INTO list_status FROM abutter_lists WHERE id = target_list;
  IF list_status IN ('issued', 'superseded') THEN
    RAISE EXCEPTION 'E_DB_003 the rows of an issued abutter list cannot change';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER abutter_list_candidates_guard BEFORE UPDATE OR DELETE ON abutter_list_candidates FOR EACH ROW EXECUTE FUNCTION abutter_list_child_guard();
--> statement-breakpoint
CREATE TRIGGER abutter_list_recipients_guard BEFORE UPDATE OR DELETE ON abutter_list_recipients FOR EACH ROW EXECUTE FUNCTION abutter_list_child_guard();

CREATE TABLE "rtk_release_items" (
	"release_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"version_id" uuid,
	"approval_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"withdrawn_at" timestamp with time zone,
	"withdrawn_reason" text,
	CONSTRAINT "rtk_release_items_release_id_document_id_pk" PRIMARY KEY("release_id","document_id")
);
--> statement-breakpoint
CREATE TABLE "rtk_releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"released_on" date NOT NULL,
	"method" text NOT NULL,
	"letter_document_id" uuid,
	"released_by" uuid NOT NULL,
	"link_token_hash" text,
	"link_expires_at" timestamp with time zone,
	"link_revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rtk_releases_request_sequence_unique" UNIQUE("request_id","sequence")
);
--> statement-breakpoint
ALTER TABLE "rtk_release_items" ADD CONSTRAINT "rtk_release_items_release_id_rtk_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."rtk_releases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rtk_release_items" ADD CONSTRAINT "rtk_release_items_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rtk_release_items" ADD CONSTRAINT "rtk_release_items_version_id_document_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."document_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rtk_release_items" ADD CONSTRAINT "rtk_release_items_approval_id_rendition_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."rendition_approvals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rtk_releases" ADD CONSTRAINT "rtk_releases_request_id_rtk_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."rtk_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rtk_releases" ADD CONSTRAINT "rtk_releases_letter_document_id_documents_id_fk" FOREIGN KEY ("letter_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rtk_withholdings" ADD CONSTRAINT "rtk_withholdings_release_id_rtk_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."rtk_releases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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

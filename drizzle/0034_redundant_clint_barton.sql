CREATE TABLE "document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"role" text NOT NULL,
	"file_sha256" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigserial NOT NULL,
	"record_kind" text NOT NULL,
	"record_id" uuid NOT NULL,
	"title" text NOT NULL,
	"doc_kind" text NOT NULL,
	"audiences" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"public_changed_by" uuid,
	"public_changed_at" timestamp with time zone,
	"created_by_kind" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_seq_unique" UNIQUE("seq")
);
--> statement-breakpoint
CREATE TABLE "upload_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" uuid NOT NULL,
	"title" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"temp_key" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_file_sha256_files_sha256_fk" FOREIGN KEY ("file_sha256") REFERENCES "public"."files"("sha256") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_versions_document_idx" ON "document_versions" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "document_versions_file_idx" ON "document_versions" USING btree ("file_sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "document_versions_one_original_idx" ON "document_versions" USING btree ("document_id") WHERE "document_versions"."role" = 'original';--> statement-breakpoint
CREATE INDEX "documents_record_idx" ON "documents" USING btree ("record_kind","record_id");
--> statement-breakpoint
CREATE FUNCTION reject_immutable_record_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'E_DB_003 % on % is not allowed: the table is insert-only', TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER document_versions_immutable BEFORE UPDATE OR DELETE ON document_versions FOR EACH ROW EXECUTE FUNCTION reject_immutable_record_change();

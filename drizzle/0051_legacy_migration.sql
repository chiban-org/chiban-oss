CREATE TABLE "migration_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"source_root" text NOT NULL,
	"series_key" text NOT NULL,
	"folder_pattern" text NOT NULL,
	"id_format" text NOT NULL,
	"status" text NOT NULL,
	"report" jsonb,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "migration_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"source_path" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"folder_key" text,
	"outcome" text,
	"except_reason" text,
	"document_id" uuid,
	"duplicate_of_item" uuid,
	"parcel_link" text DEFAULT 'none' NOT NULL,
	"ocr_status" text DEFAULT 'not_attempted' NOT NULL,
	"ocr_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "migration_items_batch_path_unique" UNIQUE("batch_id","source_path"),
	CONSTRAINT "migration_items_excepted_has_reason" CHECK (("migration_items"."outcome" = 'excepted') = ("migration_items"."except_reason" is not null))
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "migration_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "migration_items" ADD CONSTRAINT "migration_items_batch_id_migration_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."migration_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_items" ADD CONSTRAINT "migration_items_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "migration_items_batch_idx" ON "migration_items" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "migration_items_sha_idx" ON "migration_items" USING btree ("sha256");--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_migration_batch_id_migration_batches_id_fk" FOREIGN KEY ("migration_batch_id") REFERENCES "public"."migration_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_migration_batch_idx" ON "documents" USING btree ("migration_batch_id");
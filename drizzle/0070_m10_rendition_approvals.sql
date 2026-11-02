CREATE TABLE "rendition_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"rtk_request_id" uuid,
	"approved_by_kind" text NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"review_statement" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	"revoke_reason" text
);
--> statement-breakpoint
ALTER TABLE "rendition_approvals" ADD CONSTRAINT "rendition_approvals_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rendition_approvals" ADD CONSTRAINT "rendition_approvals_version_id_document_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."document_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rendition_approvals" ADD CONSTRAINT "rendition_approvals_rtk_request_id_rtk_requests_id_fk" FOREIGN KEY ("rtk_request_id") REFERENCES "public"."rtk_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rendition_approvals_one_active_public_idx" ON "rendition_approvals" USING btree ("document_id") WHERE "rendition_approvals"."purpose" = 'public' and "rendition_approvals"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "rendition_approvals_version_idx" ON "rendition_approvals" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "rendition_approvals_request_idx" ON "rendition_approvals" USING btree ("rtk_request_id");--> statement-breakpoint
INSERT INTO "rendition_approvals" ("document_id", "version_id", "purpose", "approved_by_kind", "review_statement")
SELECT d.id,
  coalesce(
    (SELECT v.id FROM document_versions v WHERE v.document_id = d.id AND v.role = 'public_redacted' ORDER BY v.created_at DESC, v.id DESC LIMIT 1),
    (SELECT v.id FROM document_versions v WHERE v.document_id = d.id AND v.role = 'original' LIMIT 1)
  ),
  'public',
  'system',
  'Carried over from Phase 1 publication.'
FROM documents d
WHERE d.is_public
  AND coalesce(
    (SELECT v.id FROM document_versions v WHERE v.document_id = d.id AND v.role = 'public_redacted' ORDER BY v.created_at DESC, v.id DESC LIMIT 1),
    (SELECT v.id FROM document_versions v WHERE v.document_id = d.id AND v.role = 'original' LIMIT 1)
  ) IS NOT NULL
ON CONFLICT DO NOTHING;

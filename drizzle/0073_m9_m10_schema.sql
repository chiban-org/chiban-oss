CREATE TABLE "anonymous_intake_probe_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anonymous_intake_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"image_ref" text,
	"app_version" text NOT NULL,
	"caddyfile_sha256" text NOT NULL,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL,
	"passed" boolean NOT NULL,
	"findings" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "census_classifications" (
	"application_id" uuid PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"excluded_reason" text,
	"phase" text DEFAULT 'whole_building' NOT NULL,
	"buildings" integer NOT NULL,
	"housing_units" integer NOT NULL,
	"valuation_dollars" integer NOT NULL,
	"classified_by" uuid NOT NULL,
	"classified_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disposition_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"as_of" date NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"proposed_by" uuid NOT NULL,
	"proposed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"executed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "disposition_items" (
	"batch_id" uuid NOT NULL,
	"record_kind" text NOT NULL,
	"record_id" uuid NOT NULL,
	"series_key" text NOT NULL,
	"series_version" text NOT NULL,
	"eligible_on" date NOT NULL,
	"outcome" text,
	CONSTRAINT "disposition_items_batch_id_record_kind_record_id_pk" PRIMARY KEY("batch_id","record_kind","record_id")
);
--> statement-breakpoint
CREATE TABLE "disposition_tombstones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"record_kind" text NOT NULL,
	"record_id" uuid NOT NULL,
	"title" text NOT NULL,
	"series_key" text NOT NULL,
	"series_version" text NOT NULL,
	"series_citation" jsonb NOT NULL,
	"retention_basis" jsonb NOT NULL,
	"version_ids" uuid[] NOT NULL,
	"file_sha256s" text[] NOT NULL,
	"proposed_by" uuid NOT NULL,
	"approved_by" uuid NOT NULL,
	"executed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "disposition_tombstones_record_uq" UNIQUE("record_kind","record_id")
);
--> statement-breakpoint
CREATE TABLE "document_renditions" (
	"version_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"page" integer NOT NULL,
	"storage_key" text NOT NULL,
	"width" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_renditions_version_id_kind_page_pk" PRIMARY KEY("version_id","kind","page")
);
--> statement-breakpoint
CREATE TABLE "complaints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"case_id" uuid,
	"channel" text NOT NULL,
	"received_on" date NOT NULL,
	"location_text" text NOT NULL,
	"parcel_id" uuid,
	"description_original" text NOT NULL,
	"description_public" text,
	"public_text_approved_by" uuid,
	"public_text_approved_at" timestamp with time zone,
	"complainant_name" text,
	"complainant_email" "citext",
	"complainant_phone" text,
	"created_by" uuid,
	"is_probe" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "complaints_number_unique" UNIQUE("number"),
	CONSTRAINT "complaints_anonymous_has_no_identity" CHECK ("complaints"."channel" <> 'anonymous_web' or ("complaints"."complainant_name" is null and "complaints"."complainant_email" is null and "complaints"."complainant_phone" is null and "complaints"."created_by" is null))
);
--> statement-breakpoint
CREATE TABLE "enforcement_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"parcel_id" uuid,
	"location_text" text NOT NULL,
	"status" text DEFAULT 'intake' NOT NULL,
	"opened_on" date NOT NULL,
	"closed_on" date,
	"closure_reason" text,
	"assigned_to" uuid,
	"is_public" boolean DEFAULT false NOT NULL,
	"public_summary" text,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enforcement_cases_number_unique" UNIQUE("number"),
	CONSTRAINT "enforcement_cases_public_summary_check" CHECK ("enforcement_cases"."is_public" = false or "enforcement_cases"."public_summary" is not null)
);
--> statement-breakpoint
CREATE TABLE "enforcement_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"observed_on" date NOT NULL,
	"body" text NOT NULL,
	"author_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enforcement_appeals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" uuid NOT NULL,
	"filed_on" date NOT NULL,
	"appellant_name" text NOT NULL,
	"board" text DEFAULT 'zba' NOT NULL,
	"resolved_on" date,
	"outcome" text,
	"recorded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "peril_certifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appeal_id" uuid NOT NULL,
	"certified_on" date NOT NULL,
	"certified_by" uuid NOT NULL,
	"categories" text[] NOT NULL,
	"statement" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restraining_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appeal_id" uuid NOT NULL,
	"issued_by" text NOT NULL,
	"issued_on" date NOT NULL,
	"document_id" uuid NOT NULL,
	"dissolved_on" date
);
--> statement-breakpoint
CREATE TABLE "order_court_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"occurred_on" date NOT NULL,
	"court" text NOT NULL,
	"docket" text,
	"document_id" uuid NOT NULL,
	"judgment_outcome" text,
	"appeal_due" jsonb,
	"recorded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "counsel_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referral_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"occurred_on" date NOT NULL,
	"court" text,
	"docket" text,
	"document_id" uuid,
	"note" text,
	"recorded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "counsel_referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"referred_on" date NOT NULL,
	"counsel_name" text NOT NULL,
	"purpose" text NOT NULL,
	"packet_document_id" uuid NOT NULL,
	"referred_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enforcement_fines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"order_id" uuid,
	"kind" text NOT NULL,
	"rule_key" text,
	"amount_cents" integer NOT NULL,
	"imposed_on" date NOT NULL,
	"court" text NOT NULL,
	"docket" text NOT NULL,
	"judgment_step_id" uuid,
	"counsel_outcome_id" uuid,
	"recorded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enforcement_fines_amount_positive" CHECK ("enforcement_fines"."amount_cents" > 0),
	CONSTRAINT "enforcement_fines_one_basis" CHECK (("enforcement_fines"."judgment_step_id" is not null) <> ("enforcement_fines"."counsel_outcome_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "enforcement_designations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"adopting_authority" text NOT NULL,
	"adopted_on" date NOT NULL,
	"ended_on" date
);
--> statement-breakpoint
CREATE TABLE "enforcement_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"number" text NOT NULL,
	"rule_key" text NOT NULL,
	"rule_version" integer NOT NULL,
	"finding_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"corrective_action" text NOT NULL,
	"corrective_deadline" date,
	"cease_immediately" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"drafted_by" uuid NOT NULL,
	"issued_on" date,
	"issued_by" uuid,
	"document_id" uuid,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enforcement_orders_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "violation_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"provision_kind" text NOT NULL,
	"provision_ref" text NOT NULL,
	"facts" text NOT NULL,
	"inspection_date" date NOT NULL,
	"found_on" date NOT NULL,
	"found_by" uuid NOT NULL,
	"status" text DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "violation_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"finding_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"sent_on" date NOT NULL,
	"method" text NOT NULL,
	"sent_by" uuid NOT NULL,
	"received_on" date,
	"receipt_basis" text,
	"document_id" uuid
);
--> statement-breakpoint
CREATE TABLE "order_service_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"recipient_id" uuid,
	"method" text NOT NULL,
	"served_on" date NOT NULL,
	"server_name" text,
	"server_role" text,
	"newspaper" text,
	"proof_document_id" uuid NOT NULL,
	"recorded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_service_events_recipient_rule" CHECK (("order_service_events"."method" in ('posting_on_property', 'newspaper_publication')) = ("order_service_events"."recipient_id" is null)),
	CONSTRAINT "order_service_events_server_rule" CHECK ("order_service_events"."method" not in ('in_hand', 'abode') or ("order_service_events"."server_name" is not null and "order_service_events"."server_role" is not null))
);
--> statement-breakpoint
CREATE TABLE "order_service_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"role" text NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"source" text NOT NULL,
	"answer_due" jsonb,
	"answered_on" date,
	"answer_document_id" uuid
);
--> statement-breakpoint
CREATE TABLE "order_service_role_checks" (
	"order_id" uuid NOT NULL,
	"role" text NOT NULL,
	"outcome" text NOT NULL,
	"basis" text NOT NULL,
	"checked_by" uuid NOT NULL,
	"checked_on" date NOT NULL,
	CONSTRAINT "order_service_role_checks_order_id_role_pk" PRIMARY KEY("order_id","role"),
	CONSTRAINT "order_service_role_checks_same_as_owner" CHECK ("order_service_role_checks"."outcome" <> 'same_as_owner' or "order_service_role_checks"."role" = 'taxpayer'),
	CONSTRAINT "order_service_role_checks_owner_not_found" CHECK ("order_service_role_checks"."outcome" <> 'owner_not_found' or "order_service_role_checks"."role" = 'record_owner')
);
--> statement-breakpoint
CREATE TABLE "file_deletions" (
	"sha256" text PRIMARY KEY NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"batch_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_tombstones" (
	"sha256" text PRIMARY KEY NOT NULL,
	"size_bytes" bigint NOT NULL,
	"content_type" text NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"batch_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redaction_boxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"page" integer,
	"pdf_box" jsonb,
	"image_box" jsonb,
	"exemption_key" text NOT NULL,
	"other_citation" text,
	"explanation" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redaction_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"source_version_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"rtk_request_id" uuid,
	"status" text DEFAULT 'queued' NOT NULL,
	"failure_reason" text,
	"result_version_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
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
CREATE TABLE "rtk_release_items" (
	"release_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"version_id" uuid,
	"former_version_id" uuid,
	"approval_id" uuid,
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
CREATE TABLE "rtk_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"received_on" date NOT NULL,
	"received_via" text NOT NULL,
	"requester_name" text,
	"requester_contact" text,
	"description" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"response_due" jsonb NOT NULL,
	"stated_due" jsonb,
	"open_due_on" date,
	"first_response_on" date,
	"first_response_kind" text,
	"first_response_url" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "rtk_requests_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "rtk_time_statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"stated_on" date NOT NULL,
	"stated_date" date NOT NULL,
	"delay_reason" text NOT NULL,
	"cost_estimate" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rtk_withholdings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"release_id" uuid,
	"scope" text NOT NULL,
	"document_id" uuid,
	"record_description" text NOT NULL,
	"exemption_key" text NOT NULL,
	"other_citation" text,
	"explanation" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "board_packet_access" DROP CONSTRAINT "board_packet_access_version_id_document_versions_id_fk";
--> statement-breakpoint
ALTER TABLE "board_packet_items" ALTER COLUMN "version_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "record_events" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "board_packet_items" ADD COLUMN "former_version_id" uuid;--> statement-breakpoint
ALTER TABLE "board_packet_items" ADD COLUMN "approval_id" uuid;--> statement-breakpoint
ALTER TABLE "board_packet_items" ADD COLUMN "withdrawn_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "board_packet_items" ADD COLUMN "withdrawn_reason" text;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "derived_from_version_id" uuid;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "redaction_job_id" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "disposed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "disposed_tombstone_id" uuid;--> statement-breakpoint
ALTER TABLE "upload_intents" ADD COLUMN "doc_kind" text;--> statement-breakpoint
ALTER TABLE "ledger_allocations" ADD COLUMN "fine_id" uuid;--> statement-breakpoint
ALTER TABLE "record_events" ADD COLUMN "case_id" uuid;--> statement-breakpoint
ALTER TABLE "town_settings" ADD COLUMN "anonymous_intake_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "census_classifications" ADD CONSTRAINT "census_classifications_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disposition_items" ADD CONSTRAINT "disposition_items_batch_id_disposition_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."disposition_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disposition_tombstones" ADD CONSTRAINT "disposition_tombstones_batch_id_disposition_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."disposition_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_renditions" ADD CONSTRAINT "document_renditions_version_id_document_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."document_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_case_id_enforcement_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."enforcement_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_parcel_id_parcels_id_fk" FOREIGN KEY ("parcel_id") REFERENCES "public"."parcels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enforcement_cases" ADD CONSTRAINT "enforcement_cases_parcel_id_parcels_id_fk" FOREIGN KEY ("parcel_id") REFERENCES "public"."parcels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enforcement_notes" ADD CONSTRAINT "enforcement_notes_case_id_enforcement_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."enforcement_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enforcement_appeals" ADD CONSTRAINT "enforcement_appeals_case_id_enforcement_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."enforcement_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peril_certifications" ADD CONSTRAINT "peril_certifications_appeal_id_enforcement_appeals_id_fk" FOREIGN KEY ("appeal_id") REFERENCES "public"."enforcement_appeals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restraining_orders" ADD CONSTRAINT "restraining_orders_appeal_id_enforcement_appeals_id_fk" FOREIGN KEY ("appeal_id") REFERENCES "public"."enforcement_appeals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restraining_orders" ADD CONSTRAINT "restraining_orders_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_court_steps" ADD CONSTRAINT "order_court_steps_order_id_enforcement_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."enforcement_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_court_steps" ADD CONSTRAINT "order_court_steps_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counsel_outcomes" ADD CONSTRAINT "counsel_outcomes_referral_id_counsel_referrals_id_fk" FOREIGN KEY ("referral_id") REFERENCES "public"."counsel_referrals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counsel_outcomes" ADD CONSTRAINT "counsel_outcomes_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counsel_referrals" ADD CONSTRAINT "counsel_referrals_case_id_enforcement_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."enforcement_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counsel_referrals" ADD CONSTRAINT "counsel_referrals_packet_document_id_documents_id_fk" FOREIGN KEY ("packet_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enforcement_fines" ADD CONSTRAINT "enforcement_fines_case_id_enforcement_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."enforcement_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enforcement_fines" ADD CONSTRAINT "enforcement_fines_order_id_enforcement_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."enforcement_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enforcement_fines" ADD CONSTRAINT "enforcement_fines_judgment_step_id_order_court_steps_id_fk" FOREIGN KEY ("judgment_step_id") REFERENCES "public"."order_court_steps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enforcement_fines" ADD CONSTRAINT "enforcement_fines_counsel_outcome_id_counsel_outcomes_id_fk" FOREIGN KEY ("counsel_outcome_id") REFERENCES "public"."counsel_outcomes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enforcement_orders" ADD CONSTRAINT "enforcement_orders_case_id_enforcement_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."enforcement_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enforcement_orders" ADD CONSTRAINT "enforcement_orders_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "violation_findings" ADD CONSTRAINT "violation_findings_case_id_enforcement_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."enforcement_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "violation_notices" ADD CONSTRAINT "violation_notices_case_id_enforcement_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."enforcement_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "violation_notices" ADD CONSTRAINT "violation_notices_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_service_events" ADD CONSTRAINT "order_service_events_order_id_enforcement_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."enforcement_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_service_events" ADD CONSTRAINT "order_service_events_recipient_id_order_service_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."order_service_recipients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_service_events" ADD CONSTRAINT "order_service_events_proof_document_id_documents_id_fk" FOREIGN KEY ("proof_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_service_recipients" ADD CONSTRAINT "order_service_recipients_order_id_enforcement_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."enforcement_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_service_recipients" ADD CONSTRAINT "order_service_recipients_answer_document_id_documents_id_fk" FOREIGN KEY ("answer_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_service_role_checks" ADD CONSTRAINT "order_service_role_checks_order_id_enforcement_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."enforcement_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_deletions" ADD CONSTRAINT "file_deletions_batch_id_disposition_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."disposition_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_tombstones" ADD CONSTRAINT "file_tombstones_batch_id_disposition_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."disposition_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redaction_boxes" ADD CONSTRAINT "redaction_boxes_job_id_redaction_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."redaction_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redaction_jobs" ADD CONSTRAINT "redaction_jobs_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redaction_jobs" ADD CONSTRAINT "redaction_jobs_source_version_id_document_versions_id_fk" FOREIGN KEY ("source_version_id") REFERENCES "public"."document_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redaction_jobs" ADD CONSTRAINT "redaction_jobs_rtk_request_id_rtk_requests_id_fk" FOREIGN KEY ("rtk_request_id") REFERENCES "public"."rtk_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redaction_jobs" ADD CONSTRAINT "redaction_jobs_result_version_id_document_versions_id_fk" FOREIGN KEY ("result_version_id") REFERENCES "public"."document_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rendition_approvals" ADD CONSTRAINT "rendition_approvals_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rendition_approvals" ADD CONSTRAINT "rendition_approvals_version_id_document_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."document_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rendition_approvals" ADD CONSTRAINT "rendition_approvals_rtk_request_id_rtk_requests_id_fk" FOREIGN KEY ("rtk_request_id") REFERENCES "public"."rtk_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rtk_release_items" ADD CONSTRAINT "rtk_release_items_release_id_rtk_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."rtk_releases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rtk_release_items" ADD CONSTRAINT "rtk_release_items_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rtk_release_items" ADD CONSTRAINT "rtk_release_items_version_id_document_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."document_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rtk_release_items" ADD CONSTRAINT "rtk_release_items_approval_id_rendition_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."rendition_approvals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rtk_releases" ADD CONSTRAINT "rtk_releases_request_id_rtk_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."rtk_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rtk_releases" ADD CONSTRAINT "rtk_releases_letter_document_id_documents_id_fk" FOREIGN KEY ("letter_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rtk_time_statements" ADD CONSTRAINT "rtk_time_statements_request_id_rtk_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."rtk_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rtk_withholdings" ADD CONSTRAINT "rtk_withholdings_request_id_rtk_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."rtk_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rtk_withholdings" ADD CONSTRAINT "rtk_withholdings_release_id_rtk_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."rtk_releases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "disposition_batches_status_idx" ON "disposition_batches" USING btree ("status","proposed_at");--> statement-breakpoint
CREATE INDEX "disposition_items_record_idx" ON "disposition_items" USING btree ("record_kind","record_id");--> statement-breakpoint
CREATE INDEX "complaints_case_idx" ON "complaints" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "enforcement_cases_status_idx" ON "enforcement_cases" USING btree ("status");--> statement-breakpoint
CREATE INDEX "enforcement_cases_parcel_idx" ON "enforcement_cases" USING btree ("parcel_id");--> statement-breakpoint
CREATE INDEX "enforcement_notes_case_idx" ON "enforcement_notes" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "enforcement_appeals_case_idx" ON "enforcement_appeals" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "order_court_steps_order_idx" ON "order_court_steps" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "counsel_outcomes_referral_idx" ON "counsel_outcomes" USING btree ("referral_id");--> statement-breakpoint
CREATE INDEX "counsel_referrals_case_idx" ON "counsel_referrals" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "enforcement_fines_case_idx" ON "enforcement_fines" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "enforcement_orders_case_idx" ON "enforcement_orders" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "violation_findings_case_idx" ON "violation_findings" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "violation_notices_case_idx" ON "violation_notices" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "order_service_events_order_idx" ON "order_service_events" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_service_recipients_order_idx" ON "order_service_recipients" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "redaction_boxes_job_idx" ON "redaction_boxes" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "redaction_jobs_document_idx" ON "redaction_jobs" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "redaction_jobs_status_idx" ON "redaction_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rendition_approvals_one_active_public_idx" ON "rendition_approvals" USING btree ("document_id") WHERE "rendition_approvals"."purpose" = 'public' and "rendition_approvals"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "rendition_approvals_version_idx" ON "rendition_approvals" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "rendition_approvals_request_idx" ON "rendition_approvals" USING btree ("rtk_request_id");--> statement-breakpoint
CREATE INDEX "rtk_requests_status_due_idx" ON "rtk_requests" USING btree ("status","open_due_on");--> statement-breakpoint
CREATE INDEX "rtk_requests_due_idx" ON "rtk_requests" USING btree ("open_due_on","id");--> statement-breakpoint
CREATE INDEX "rtk_withholdings_request_idx" ON "rtk_withholdings" USING btree ("request_id");--> statement-breakpoint
ALTER TABLE "board_packet_items" ADD CONSTRAINT "board_packet_items_approval_id_rendition_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."rendition_approvals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_derived_from_version_id_document_versions_id_fk" FOREIGN KEY ("derived_from_version_id") REFERENCES "public"."document_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_allocations" ADD CONSTRAINT "ledger_allocations_fine_id_enforcement_fines_id_fk" FOREIGN KEY ("fine_id") REFERENCES "public"."enforcement_fines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_events" ADD CONSTRAINT "record_events_case_id_enforcement_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."enforcement_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "record_events_case_idx" ON "record_events" USING btree ("case_id");--> statement-breakpoint
ALTER TABLE "ledger_allocations" ADD CONSTRAINT "ledger_allocations_fine_fields" CHECK ("ledger_allocations"."target_kind" <> 'fine' or ("ledger_allocations"."fine_id" is not null and "ledger_allocations"."application_id" is null));--> statement-breakpoint
ALTER TABLE "record_events" ADD CONSTRAINT "record_events_one_target_check" CHECK (("record_events"."project_id" is null) <> ("record_events"."case_id" is null));
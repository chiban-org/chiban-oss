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
ALTER TABLE "rtk_time_statements" ADD CONSTRAINT "rtk_time_statements_request_id_rtk_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."rtk_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rtk_withholdings" ADD CONSTRAINT "rtk_withholdings_request_id_rtk_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."rtk_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rtk_requests_status_due_idx" ON "rtk_requests" USING btree ("status","open_due_on");--> statement-breakpoint
CREATE INDEX "rtk_requests_due_idx" ON "rtk_requests" USING btree ("open_due_on","id");--> statement-breakpoint
CREATE INDEX "rtk_withholdings_request_idx" ON "rtk_withholdings" USING btree ("request_id");
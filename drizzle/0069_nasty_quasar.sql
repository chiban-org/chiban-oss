CREATE TABLE "appeal_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"application_id" uuid,
	"decision_id" uuid,
	"parent_id" uuid,
	"linked_pb_node_id" uuid,
	"occurred_on" date NOT NULL,
	"outcome" text,
	"status" text DEFAULT 'open' NOT NULL,
	"untimely" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appeal_nodes" ADD CONSTRAINT "appeal_nodes_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeal_nodes" ADD CONSTRAINT "appeal_nodes_decision_id_board_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."board_decisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appeal_nodes_application_idx" ON "appeal_nodes" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "appeal_nodes_parent_idx" ON "appeal_nodes" USING btree ("parent_id");
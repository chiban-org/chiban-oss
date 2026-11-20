CREATE TABLE "decision_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"decision_id" uuid,
	"appeal_node_id" uuid,
	"recipient_role" text NOT NULL,
	"party_id" uuid,
	"recipient_name" text NOT NULL,
	"method" text,
	"delivered_on" date,
	"recorded_by" uuid,
	"recorded_at" timestamp with time zone,
	CONSTRAINT "decision_deliveries_one_source" CHECK (("decision_deliveries"."decision_id" is not null) <> ("decision_deliveries"."appeal_node_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "decision_deliveries" ADD CONSTRAINT "decision_deliveries_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_deliveries" ADD CONSTRAINT "decision_deliveries_decision_id_board_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."board_decisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_deliveries" ADD CONSTRAINT "decision_deliveries_appeal_node_id_appeal_nodes_id_fk" FOREIGN KEY ("appeal_node_id") REFERENCES "public"."appeal_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_deliveries" ADD CONSTRAINT "decision_deliveries_party_id_project_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."project_parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "decision_deliveries_application_idx" ON "decision_deliveries" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "decision_deliveries_decision_idx" ON "decision_deliveries" USING btree ("decision_id");--> statement-breakpoint
CREATE INDEX "decision_deliveries_appeal_node_idx" ON "decision_deliveries" USING btree ("appeal_node_id");
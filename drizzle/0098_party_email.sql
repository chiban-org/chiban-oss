ALTER TABLE "contractor_claims" ALTER COLUMN "sent_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_outbox" ALTER COLUMN "recipient_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "contractor_claims" ADD COLUMN "application_id" uuid;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD COLUMN "recipient_party_id" uuid;--> statement-breakpoint
ALTER TABLE "contractor_claims" ADD CONSTRAINT "contractor_claims_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_recipient_party_id_project_parties_id_fk" FOREIGN KEY ("recipient_party_id") REFERENCES "public"."project_parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_outbox_party_dedup_idx" ON "notification_outbox" USING btree ("event","application_id","recipient_party_id",coalesce("payload"->>'discriminator', '')) WHERE "notification_outbox"."recipient_party_id" is not null;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_one_recipient" CHECK (("notification_outbox"."recipient_user_id" is null) <> ("notification_outbox"."recipient_party_id" is null));
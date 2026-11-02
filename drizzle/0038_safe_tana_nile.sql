CREATE TABLE "contractor_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"email" "citext" NOT NULL,
	"token_hash" text NOT NULL,
	"sent_by" uuid NOT NULL,
	"sent_by_kind" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"claimed_by" uuid,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "contractor_claims_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "contractor_claims" ADD CONSTRAINT "contractor_claims_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor_claims" ADD CONSTRAINT "contractor_claims_party_id_project_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."project_parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contractor_claims_project_idx" ON "contractor_claims" USING btree ("project_id","created_at");
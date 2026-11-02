CREATE TABLE "processor_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"processor" text NOT NULL,
	"mode" text NOT NULL,
	"account_ref" text NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"credentials_enc" text NOT NULL,
	"webhook_secret_enc" text NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "processor_accounts_one_active" ON "processor_accounts" USING btree ("is_active") WHERE "processor_accounts"."is_active";
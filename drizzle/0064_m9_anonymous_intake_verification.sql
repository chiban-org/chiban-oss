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

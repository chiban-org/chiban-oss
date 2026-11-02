CREATE TABLE "files" (
	"sha256" text PRIMARY KEY NOT NULL,
	"size_bytes" bigint NOT NULL,
	"content_type" text NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "simulated_processor_objects" (
	"id" text PRIMARY KEY NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"settled" boolean DEFAULT false NOT NULL,
	"refunds" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

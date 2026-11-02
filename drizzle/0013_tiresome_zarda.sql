CREATE TABLE "job_effects" (
	"job_name" text NOT NULL,
	"dedup_key" text NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_effects_job_name_dedup_key_pk" PRIMARY KEY("job_name","dedup_key")
);

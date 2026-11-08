CREATE TABLE "report_schedule_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"period_from" date NOT NULL,
	"period_to" date NOT NULL,
	"outcome" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_schedule_recipients" (
	"schedule_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "report_schedule_recipients_schedule_id_user_id_pk" PRIMARY KEY("schedule_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "report_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report" text NOT NULL,
	"frequency" text NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"next_run_on" date NOT NULL,
	"last_sent_at" timestamp with time zone,
	"last_period_from" date,
	"last_period_to" date,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "report_schedule_deliveries" ADD CONSTRAINT "report_schedule_deliveries_schedule_id_report_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."report_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_schedule_deliveries" ADD CONSTRAINT "report_schedule_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_schedule_recipients" ADD CONSTRAINT "report_schedule_recipients_schedule_id_report_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."report_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_schedule_recipients" ADD CONSTRAINT "report_schedule_recipients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "report_schedule_deliveries_once_idx" ON "report_schedule_deliveries" USING btree ("schedule_id","user_id","period_from","period_to");--> statement-breakpoint
CREATE INDEX "report_schedules_due_idx" ON "report_schedules" USING btree ("next_run_on") WHERE "report_schedules"."paused" = false;
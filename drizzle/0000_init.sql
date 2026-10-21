CREATE TABLE "activity_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"agent" text NOT NULL,
	"type" text DEFAULT 'INFO' NOT NULL,
	"message" text NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"agent" text NOT NULL,
	"status" text DEFAULT 'IDLE' NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"message" text,
	"model" text,
	"prompt_version" text,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"job_id" text NOT NULL,
	"company_id" text NOT NULL,
	"cv_document_id" text,
	"status" text DEFAULT 'DISCOVERED' NOT NULL,
	"mode" text DEFAULT 'ASSISTED' NOT NULL,
	"channel" text DEFAULT 'EMAIL' NOT NULL,
	"compatibility_score" real DEFAULT 0 NOT NULL,
	"recipient_email" text,
	"subject" text,
	"scheduled_for" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"replied_at" timestamp with time zone,
	"interview_at" timestamp with time zone,
	"follow_up_due_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"rejection_reason" text,
	"notes" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"board_order" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text DEFAULT 'Daily automation' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"mode" text DEFAULT 'ASSISTED' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"days_of_week" jsonb DEFAULT '[1,2,3,4,5]'::jsonb NOT NULL,
	"start_hour" integer DEFAULT 9 NOT NULL,
	"end_hour" integer DEFAULT 11 NOT NULL,
	"max_per_run" integer DEFAULT 5 NOT NULL,
	"last_run_at" timestamp with time zone,
	"next_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"priority" integer DEFAULT 5 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error" text,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"agent_run_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"full_name" text,
	"headline" text,
	"summary" text,
	"email" text,
	"phone" text,
	"city" text,
	"country" text,
	"linkedin_url" text,
	"github_url" text,
	"portfolio_url" text,
	"years_experience" integer DEFAULT 0 NOT NULL,
	"current_title" text,
	"seniority" text,
	"education" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"experience" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"certifications" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"languages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"projects" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"achievements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"desired_titles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"desired_skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"desired_locations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"target_industries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"work_modes" jsonb DEFAULT '["REMOTE","HYBRID"]'::jsonb NOT NULL,
	"preferred_language" text DEFAULT 'en' NOT NULL,
	"min_salary" integer,
	"max_salary" integer,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"availability_weeks" integer DEFAULT 0 NOT NULL,
	"auto_apply_enabled" boolean DEFAULT false NOT NULL,
	"automation_mode" text DEFAULT 'ASSISTED' NOT NULL,
	"daily_application_limit" integer DEFAULT 10 NOT NULL,
	"completeness" real DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"website" text,
	"linkedin_url" text,
	"careers_url" text,
	"industry" text,
	"size" text,
	"headquarters" text,
	"description" text,
	"technologies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"target_title" text,
	"research_status" text DEFAULT 'PENDING' NOT NULL,
	"research_confidence" real DEFAULT 0 NOT NULL,
	"research_notes" text,
	"research_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_researched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cover_letters" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text,
	"job_id" text,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"plain_text" text DEFAULT '' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"style" text DEFAULT 'PROFESSIONAL' NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"model" text DEFAULT 'fallback-heuristic' NOT NULL,
	"prompt_version" text DEFAULT 'v1' NOT NULL,
	"generation_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cv_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"file_name" text NOT NULL,
	"storage_path" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"raw_text" text DEFAULT '' NOT NULL,
	"parsed" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'UPLOADED' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"parse_error" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"email_address" text NOT NULL,
	"display_name" text,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"access_token_enc" text,
	"refresh_token_enc" text,
	"token_iv" text,
	"token_tag" text,
	"token_expires_at" timestamp with time zone,
	"status" text DEFAULT 'DISCONNECTED' NOT NULL,
	"daily_limit" integer DEFAULT 30 NOT NULL,
	"sent_today" integer DEFAULT 0 NOT NULL,
	"last_reset_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"connection_id" text,
	"application_id" text,
	"provider_message_id" text,
	"thread_id" text,
	"direction" text NOT NULL,
	"from" text NOT NULL,
	"to" text NOT NULL,
	"subject" text NOT NULL,
	"snippet" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"is_reply" boolean DEFAULT false NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"ai_draft" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follow_ups" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"user_id" text NOT NULL,
	"sequence" integer DEFAULT 1 NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generated_emails" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text,
	"user_id" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"tone" text DEFAULT 'PROFESSIONAL' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"recipient_email" text,
	"personalization_score" real DEFAULT 0 NOT NULL,
	"quality_score" real DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"model" text DEFAULT 'fallback-heuristic' NOT NULL,
	"prompt_version" text DEFAULT 'v1' NOT NULL,
	"generation_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_listings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"company_id" text NOT NULL,
	"title" text NOT NULL,
	"location" text,
	"remote" text DEFAULT 'ONSITE' NOT NULL,
	"seniority" text,
	"employment_type" text DEFAULT 'FULL_TIME' NOT NULL,
	"department" text,
	"description" text DEFAULT '' NOT NULL,
	"requirements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"salary_min" double precision,
	"salary_max" double precision,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"source" text NOT NULL,
	"source_url" text NOT NULL,
	"external_id" text,
	"apply_url" text,
	"posted_at" timestamp with time zone,
	"language" text DEFAULT 'en' NOT NULL,
	"dedupe_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_matches" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"user_id" text NOT NULL,
	"score" real NOT NULL,
	"breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"explanation" text DEFAULT '' NOT NULL,
	"matched_skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"missing_skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'NEW' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"type" text DEFAULT 'INFO' NOT NULL,
	"href" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recruiter_contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"name" text,
	"role" text,
	"email" text NOT NULL,
	"source_url" text NOT NULL,
	"source_type" text DEFAULT 'CAREERS_PAGE' NOT NULL,
	"confidence" real DEFAULT 0.5 NOT NULL,
	"verification" text DEFAULT 'UNVERIFIED' NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"notes" text,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"user_agent" text,
	"ip" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"image" text,
	"password_hash" text,
	"role" text DEFAULT 'USER' NOT NULL,
	"plan" text DEFAULT 'FREE' NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"email_verified" timestamp with time zone,
	"onboarding_step" integer DEFAULT 0 NOT NULL,
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"demo_mode" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_job_listings_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_cv_document_id_cv_documents_id_fk" FOREIGN KEY ("cv_document_id") REFERENCES "public"."cv_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_schedules" ADD CONSTRAINT "automation_schedules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_tasks" ADD CONSTRAINT "automation_tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD CONSTRAINT "candidate_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cover_letters" ADD CONSTRAINT "cover_letters_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cover_letters" ADD CONSTRAINT "cover_letters_job_id_job_listings_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job_listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cover_letters" ADD CONSTRAINT "cover_letters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_documents" ADD CONSTRAINT "cv_documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_connections" ADD CONSTRAINT "email_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_connection_id_email_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."email_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_emails" ADD CONSTRAINT "generated_emails_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_emails" ADD CONSTRAINT "generated_emails_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_listings" ADD CONSTRAINT "job_listings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_listings" ADD CONSTRAINT "job_listings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_matches" ADD CONSTRAINT "job_matches_job_id_job_listings_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_matches" ADD CONSTRAINT "job_matches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruiter_contacts" ADD CONSTRAINT "recruiter_contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_events_user_created_idx" ON "activity_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_runs_user_started_idx" ON "agent_runs" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "agent_runs_agent_status_idx" ON "agent_runs" USING btree ("agent","status");--> statement-breakpoint
CREATE UNIQUE INDEX "applications_user_job_unique" ON "applications" USING btree ("user_id","job_id");--> statement-breakpoint
CREATE INDEX "applications_user_status_idx" ON "applications" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "applications_user_scheduled_idx" ON "applications" USING btree ("user_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "audit_logs_user_created_idx" ON "audit_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_rules_user_key_unique" ON "automation_rules" USING btree ("user_id","key");--> statement-breakpoint
CREATE INDEX "automation_schedules_user_idx" ON "automation_schedules" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_tasks_idempotency_key_unique" ON "automation_tasks" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "automation_tasks_user_status_run_after_idx" ON "automation_tasks" USING btree ("user_id","status","run_after");--> statement-breakpoint
CREATE INDEX "automation_tasks_status_run_after_idx" ON "automation_tasks" USING btree ("status","run_after");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_profiles_user_id_unique" ON "candidate_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_user_name_unique" ON "companies" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "companies_user_status_idx" ON "companies" USING btree ("user_id","research_status");--> statement-breakpoint
CREATE INDEX "cover_letters_user_created_idx" ON "cover_letters" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "cv_documents_user_created_idx" ON "cv_documents" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "email_connections_user_provider_email_unique" ON "email_connections" USING btree ("user_id","provider","email_address");--> statement-breakpoint
CREATE INDEX "email_connections_user_status_idx" ON "email_connections" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "email_messages_user_received_idx" ON "email_messages" USING btree ("user_id","received_at");--> statement-breakpoint
CREATE INDEX "email_messages_application_idx" ON "email_messages" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "follow_ups_user_status_due_idx" ON "follow_ups" USING btree ("user_id","status","due_at");--> statement-breakpoint
CREATE INDEX "generated_emails_user_created_idx" ON "generated_emails" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "job_listings_user_dedupe_unique" ON "job_listings" USING btree ("user_id","dedupe_hash");--> statement-breakpoint
CREATE INDEX "job_listings_user_discovered_idx" ON "job_listings" USING btree ("user_id","discovered_at");--> statement-breakpoint
CREATE INDEX "job_listings_user_active_idx" ON "job_listings" USING btree ("user_id","is_active");--> statement-breakpoint
CREATE INDEX "job_listings_company_idx" ON "job_listings" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_matches_job_user_unique" ON "job_matches" USING btree ("job_id","user_id");--> statement-breakpoint
CREATE INDEX "job_matches_user_score_idx" ON "job_matches" USING btree ("user_id","score");--> statement-breakpoint
CREATE INDEX "notifications_user_read_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "recruiter_contacts_company_email_unique" ON "recruiter_contacts" USING btree ("company_id","email");--> statement-breakpoint
CREATE INDEX "recruiter_contacts_company_confidence_idx" ON "recruiter_contacts" USING btree ("company_id","confidence");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_unique" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_deleted_at_idx" ON "users" USING btree ("deleted_at");
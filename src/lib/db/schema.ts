/**
 * ApplyPilot AI — relational schema (PostgreSQL).
 *
 * Runs on real Postgres in production (`DATABASE_URL=postgres://…`) and on the embedded
 * PGlite Postgres engine locally (`DATABASE_URL=file:./.pgdata`), so the very same
 * schema, indexes, unique constraints and foreign keys are used in both environments.
 *
 * Enum-like columns are stored as `text` and constrained by TypeScript unions
 * (see `src/lib/enums.ts`) plus zod validation at every API boundary.
 */
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const createdAt = (name = "created_at") => timestamp(name, { withTimezone: true }).defaultNow().notNull();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

/** jsonb helper that keeps array columns type-safe in TypeScript. */
const jsonArray = <T>(name: string) => jsonb(name).$type<T[]>().notNull().default(sql`'[]'::jsonb`);
const jsonObject = <T>(name: string) => jsonb(name).$type<T>().notNull().default(sql`'{}'::jsonb`);

// ─────────────────────────────────────────────────────────────
// Identity & access
// ─────────────────────────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    name: text("name"),
    image: text("image"),
    passwordHash: text("password_hash"),
    role: text("role").$type<"USER" | "ADMIN">().notNull().default("USER"),
    plan: text("plan").$type<"FREE" | "PRO" | "SCALE">().notNull().default("FREE"),
    locale: text("locale").$type<"en" | "fr">().notNull().default("en"),
    timezone: text("timezone").notNull().default("UTC"),
    emailVerified: timestamp("email_verified", { withTimezone: true }),
    onboardingStep: integer("onboarding_step").notNull().default(0),
    onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
    demoMode: boolean("demo_mode").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email), index("users_deleted_at_idx").on(t.deletedAt)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    userAgent: text("user_agent"),
    ip: text("ip"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_unique").on(t.tokenHash),
    index("sessions_user_id_idx").on(t.userId),
    index("sessions_expires_at_idx").on(t.expiresAt),
  ],
);

// ─────────────────────────────────────────────────────────────
// Candidate
// ─────────────────────────────────────────────────────────────

export type EducationEntry = {
  school: string;
  degree?: string;
  field?: string;
  startYear?: string;
  endYear?: string;
  location?: string;
};

export type ExperienceEntry = {
  company: string;
  title: string;
  startDate?: string;
  endDate?: string;
  location?: string;
  description?: string;
  highlights?: string[];
};

export type ProjectEntry = { name: string; description?: string; link?: string; stack?: string[] };
export type CertificationEntry = { name: string; issuer?: string; year?: string };
export type LanguageEntry = { name: string; level?: string };

export const candidateProfiles = pgTable(
  "candidate_profiles",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    fullName: text("full_name"),
    headline: text("headline"),
    summary: text("summary"),
    email: text("email"),
    phone: text("phone"),
    city: text("city"),
    country: text("country"),
    linkedinUrl: text("linkedin_url"),
    githubUrl: text("github_url"),
    portfolioUrl: text("portfolio_url"),

    yearsExperience: integer("years_experience").notNull().default(0),
    currentTitle: text("current_title"),
    seniority: text("seniority").$type<Seniority>(),

    education: jsonArray<EducationEntry>("education"),
    experience: jsonArray<ExperienceEntry>("experience"),
    skills: jsonArray<string>("skills"),
    certifications: jsonArray<CertificationEntry>("certifications"),
    languages: jsonArray<LanguageEntry>("languages"),
    projects: jsonArray<ProjectEntry>("projects"),
    achievements: jsonArray<string>("achievements"),

    desiredTitles: jsonArray<string>("desired_titles"),
    desiredSkills: jsonArray<string>("desired_skills"),
    desiredLocations: jsonArray<string>("desired_locations"),
    targetIndustries: jsonArray<string>("target_industries"),
    workModes: jsonArray<WorkMode>("work_modes").default(sql`'["REMOTE","HYBRID"]'::jsonb`),
    preferredLanguage: text("preferred_language").$type<"en" | "fr">().notNull().default("en"),
    minSalary: integer("min_salary"),
    maxSalary: integer("max_salary"),
    currency: text("currency").notNull().default("EUR"),
    availabilityWeeks: integer("availability_weeks").notNull().default(0),

    autoApplyEnabled: boolean("auto_apply_enabled").notNull().default(false),
    automationMode: text("automation_mode").$type<AutomationMode>().notNull().default("ASSISTED"),
    dailyApplicationLimit: integer("daily_application_limit").notNull().default(10),

    completeness: real("completeness").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("candidate_profiles_user_id_unique").on(t.userId)],
);

export type Seniority = "INTERN" | "JUNIOR" | "MID" | "SENIOR" | "LEAD" | "MANAGER";
export type WorkMode = "REMOTE" | "HYBRID" | "ONSITE";
export type AutomationMode = "MANUAL" | "ASSISTED" | "SCHEDULED";

export const cvDocuments = pgTable(
  "cv_documents",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    storagePath: text("storage_path").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    rawText: text("raw_text").notNull().default(""),
    parsed: jsonObject<Record<string, unknown>>("parsed"),
    status: text("status")
      .$type<"UPLOADED" | "PARSING" | "PARSED" | "ANALYZING" | "READY" | "FAILED">()
      .notNull()
      .default("UPLOADED"),
    language: text("language").$type<"en" | "fr">().notNull().default("en"),
    parseError: text("parse_error"),
    isPrimary: boolean("is_primary").notNull().default(false),
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("cv_documents_user_created_idx").on(t.userId, t.createdAt)],
);

// ─────────────────────────────────────────────────────────────
// Companies, contacts & jobs
// ─────────────────────────────────────────────────────────────

export type ResearchSource = {
  url: string;
  title?: string;
  kind: "WEBSITE" | "CAREERS" | "LINKEDIN" | "JOB_BOARD" | "PRESS" | "DIRECTORY";
  snippet?: string;
  fetchedAt?: string;
};

export const companies = pgTable(
  "companies",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    name: text("name").notNull(),
    website: text("website"),
    linkedinUrl: text("linkedin_url"),
    careersUrl: text("careers_url"),
    industry: text("industry"),
    size: text("size"),
    headquarters: text("headquarters"),
    description: text("description"),
    technologies: jsonArray<string>("technologies"),
    targetTitle: text("target_title"),

    researchStatus: text("research_status")
      .$type<"PENDING" | "RESEARCHING" | "READY" | "FAILED">()
      .notNull()
      .default("PENDING"),
    researchConfidence: real("research_confidence").notNull().default(0),
    researchNotes: text("research_notes"),
    researchData: jsonObject<{
      sources?: ResearchSource[];
      applicationProcess?: string;
      techStack?: string[];
      hiringSignals?: string[];
    }>("research_data"),
    lastResearchedAt: timestamp("last_researched_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("companies_user_name_unique").on(t.userId, t.name),
    index("companies_user_status_idx").on(t.userId, t.researchStatus),
  ],
);

export const recruiterContacts = pgTable(
  "recruiter_contacts",
  {
    id: id(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name"),
    role: text("role"),
    email: text("email").notNull(),
    sourceUrl: text("source_url").notNull(),
    sourceType: text("source_type")
      .$type<"CAREERS_PAGE" | "WEBSITE" | "JOB_BOARD" | "PRESS" | "DIRECTORY">()
      .notNull()
      .default("CAREERS_PAGE"),
    confidence: real("confidence").notNull().default(0.5),
    verification: text("verification")
      .$type<"UNVERIFIED" | "PATTERN_INFERRED" | "VERIFIED_PUBLIC">()
      .notNull()
      .default("UNVERIFIED"),
    isPublic: boolean("is_public").notNull().default(true),
    notes: text("notes"),
    discoveredAt: createdAt("discovered_at"),
  },
  (t) => [
    uniqueIndex("recruiter_contacts_company_email_unique").on(t.companyId, t.email),
    index("recruiter_contacts_company_confidence_idx").on(t.companyId, t.confidence),
  ],
);

export const jobListings = pgTable(
  "job_listings",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),

    title: text("title").notNull(),
    location: text("location"),
    remote: text("remote").$type<WorkMode>().notNull().default("ONSITE"),
    seniority: text("seniority").$type<Seniority>(),
    employmentType: text("employment_type")
      .$type<"FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERNSHIP">()
      .notNull()
      .default("FULL_TIME"),
    department: text("department"),

    description: text("description").notNull().default(""),
    requirements: jsonArray<string>("requirements"),
    skills: jsonArray<string>("skills"),

    salaryMin: doublePrecision("salary_min"),
    salaryMax: doublePrecision("salary_max"),
    currency: text("currency").notNull().default("EUR"),

    source: text("source")
      .$type<"LINKEDIN" | "INDEED" | "GREENHOUSE" | "LEVER" | "WTTJ" | "CAREERS_PAGE" | "MANUAL">()
      .notNull(),
    sourceUrl: text("source_url").notNull(),
    externalId: text("external_id"),
    applyUrl: text("apply_url"),
    postedAt: timestamp("posted_at", { withTimezone: true }),

    language: text("language").$type<"en" | "fr">().notNull().default("en"),
    dedupeHash: text("dedupe_hash").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    discoveredAt: createdAt("discovered_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Scoped per user: two accounts may legitimately discover the same listing.
    uniqueIndex("job_listings_user_dedupe_unique").on(t.userId, t.dedupeHash),
    index("job_listings_user_discovered_idx").on(t.userId, t.discoveredAt),
    index("job_listings_user_active_idx").on(t.userId, t.isActive),
    index("job_listings_company_idx").on(t.companyId),
  ],
);

export type MatchBreakdown = {
  skills: number;
  experience: number;
  location: number;
  seniority: number;
  language: number;
  recency: number;
};

export const jobMatches = pgTable(
  "job_matches",
  {
    id: id(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobListings.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    score: real("score").notNull(),
    breakdown: jsonObject<MatchBreakdown>("breakdown"),
    explanation: text("explanation").notNull().default(""),
    matchedSkills: jsonArray<string>("matched_skills"),
    missingSkills: jsonArray<string>("missing_skills"),
    status: text("status")
      .$type<"NEW" | "SHORTLISTED" | "DISMISSED" | "APPLIED">()
      .notNull()
      .default("NEW"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("job_matches_job_user_unique").on(t.jobId, t.userId),
    index("job_matches_user_score_idx").on(t.userId, t.score),
  ],
);

// ─────────────────────────────────────────────────────────────
// Applications & generated content
// ─────────────────────────────────────────────────────────────

export type ApplicationStatus =
  | "DISCOVERED"
  | "RESEARCHING"
  | "DRAFT_READY"
  | "AWAITING_APPROVAL"
  | "SCHEDULED"
  | "SENT"
  | "REPLIED"
  | "INTERVIEW"
  | "OFFER"
  | "REJECTED"
  | "FAILED";

export const applications = pgTable(
  "applications",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobId: text("job_id")
      .notNull()
      .references(() => jobListings.id, { onDelete: "cascade" }),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    cvDocumentId: text("cv_document_id").references(() => cvDocuments.id, { onDelete: "set null" }),

    status: text("status").$type<ApplicationStatus>().notNull().default("DISCOVERED"),
    mode: text("mode").$type<AutomationMode>().notNull().default("ASSISTED"),
    channel: text("channel").$type<"EMAIL" | "PORTAL" | "MANUAL">().notNull().default("EMAIL"),
    compatibilityScore: real("compatibility_score").notNull().default(0),

    recipientEmail: text("recipient_email"),
    subject: text("subject"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    repliedAt: timestamp("replied_at", { withTimezone: true }),
    interviewAt: timestamp("interview_at", { withTimezone: true }),
    followUpDueAt: timestamp("follow_up_due_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    /** Why the last send attempt failed — surfaced in the UI, never swallowed. */
    lastError: text("last_error"),
    notes: text("notes"),
    priority: integer("priority").notNull().default(0),
    boardOrder: doublePrecision("board_order").notNull().default(0),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("applications_user_job_unique").on(t.userId, t.jobId),
    index("applications_user_status_idx").on(t.userId, t.status),
    index("applications_user_scheduled_idx").on(t.userId, t.scheduledFor),
  ],
);

export const generatedEmails = pgTable(
  "generated_emails",
  {
    id: id(),
    applicationId: text("application_id").references(() => applications.id, { onDelete: "set null" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    subject: text("subject").notNull(),
    body: text("body").notNull(),
    tone: text("tone").$type<"FORMAL" | "PROFESSIONAL" | "FRIENDLY" | "CONCISE">().notNull().default("PROFESSIONAL"),
    language: text("language").$type<"en" | "fr">().notNull().default("en"),
    recipientEmail: text("recipient_email"),
    personalizationScore: real("personalization_score").notNull().default(0),
    qualityScore: real("quality_score").notNull().default(0),
    status: text("status").$type<"DRAFT" | "APPROVED" | "SENT" | "FAILED">().notNull().default("DRAFT"),
    model: text("model").notNull().default("fallback-heuristic"),
    promptVersion: text("prompt_version").notNull().default("v1"),
    generationMs: integer("generation_ms").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("generated_emails_user_created_idx").on(t.userId, t.createdAt)],
);

export const coverLetters = pgTable(
  "cover_letters",
  {
    id: id(),
    applicationId: text("application_id").references(() => applications.id, { onDelete: "set null" }),
    jobId: text("job_id").references(() => jobListings.id, { onDelete: "set null" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    title: text("title").notNull(),
    content: text("content").notNull(), // rich text (HTML)
    plainText: text("plain_text").notNull().default(""),
    language: text("language").$type<"en" | "fr">().notNull().default("en"),
    style: text("style")
      .$type<"PROFESSIONAL" | "STORYTELLING" | "IMPACT" | "ACADEMIC">()
      .notNull()
      .default("PROFESSIONAL"),
    status: text("status").$type<"DRAFT" | "FINAL">().notNull().default("DRAFT"),
    model: text("model").notNull().default("fallback-heuristic"),
    promptVersion: text("prompt_version").notNull().default("v1"),
    generationMs: integer("generation_ms").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("cover_letters_user_created_idx").on(t.userId, t.createdAt)],
);

// ─────────────────────────────────────────────────────────────
// Email integrations & mailbox
// ─────────────────────────────────────────────────────────────

export const emailConnections = pgTable(
  "email_connections",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").$type<"GMAIL" | "OUTLOOK" | "SMTP">().notNull(),
    emailAddress: text("email_address").notNull(),
    displayName: text("display_name"),
    scopes: jsonArray<string>("scopes"),

    accessTokenEnc: text("access_token_enc"),
    refreshTokenEnc: text("refresh_token_enc"),
    tokenIv: text("token_iv"),
    tokenTag: text("token_tag"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),

    status: text("status")
      .$type<"CONNECTED" | "DISCONNECTED" | "EXPIRED" | "RATE_LIMITED" | "ERROR">()
      .notNull()
      .default("DISCONNECTED"),
    dailyLimit: integer("daily_limit").notNull().default(30),
    sentToday: integer("sent_today").notNull().default(0),
    lastResetAt: timestamp("last_reset_at", { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("email_connections_user_provider_email_unique").on(t.userId, t.provider, t.emailAddress),
    index("email_connections_user_status_idx").on(t.userId, t.status),
  ],
);

export const emailMessages = pgTable(
  "email_messages",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    connectionId: text("connection_id").references(() => emailConnections.id, { onDelete: "set null" }),
    applicationId: text("application_id").references(() => applications.id, { onDelete: "set null" }),

    providerMessageId: text("provider_message_id"),
    threadId: text("thread_id"),
    direction: text("direction").$type<"INBOUND" | "OUTBOUND">().notNull(),
    from: text("from").notNull(),
    to: text("to").notNull(),
    subject: text("subject").notNull(),
    snippet: text("snippet").notNull().default(""),
    body: text("body").notNull().default(""),
    isReply: boolean("is_reply").notNull().default(false),
    isRead: boolean("is_read").notNull().default(false),
    aiDraft: jsonObject<{ subject?: string; body?: string; language?: string }>("ai_draft"),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("email_messages_user_received_idx").on(t.userId, t.receivedAt),
    index("email_messages_application_idx").on(t.applicationId),
  ],
);

// ─────────────────────────────────────────────────────────────
// Automation
// ─────────────────────────────────────────────────────────────

export const automationSchedules = pgTable(
  "automation_schedules",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("Daily automation"),
    enabled: boolean("enabled").notNull().default(false),
    mode: text("mode").$type<AutomationMode>().notNull().default("ASSISTED"),
    timezone: text("timezone").notNull().default("UTC"),
    daysOfWeek: jsonArray<number>("days_of_week").default(sql`'[1,2,3,4,5]'::jsonb`),
    startHour: integer("start_hour").notNull().default(9),
    endHour: integer("end_hour").notNull().default(11),
    maxPerRun: integer("max_per_run").notNull().default(5),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("automation_schedules_user_idx").on(t.userId)],
);

export type TaskType =
  | "RESEARCH_COMPANY"
  | "DISCOVER_JOBS"
  | "MATCH_JOB"
  | "DRAFT_EMAIL"
  | "DRAFT_COVER_LETTER"
  | "PREPARE_APPLICATION"
  | "SEND_APPLICATION"
  | "DRAFT_FOLLOW_UP"
  | "SYNC_MAILBOX";

export const automationTasks = pgTable(
  "automation_tasks",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<TaskType>().notNull(),
    payload: jsonObject<Record<string, unknown>>("payload"),
    status: text("status")
      .$type<"PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED">()
      .notNull()
      .default("PENDING"),
    priority: integer("priority").notNull().default(5),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    runAfter: timestamp("run_after", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    error: text("error"),
    result: jsonObject<Record<string, unknown>>("result"),
    idempotencyKey: text("idempotency_key").notNull(),
    agentRunId: text("agent_run_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("automation_tasks_idempotency_key_unique").on(t.idempotencyKey),
    index("automation_tasks_user_status_run_after_idx").on(t.userId, t.status, t.runAfter),
    index("automation_tasks_status_run_after_idx").on(t.status, t.runAfter),
  ],
);

export type AgentName =
  | "RESEARCH"
  | "DISCOVERY"
  | "CV_ANALYSIS"
  | "MATCHING"
  | "EMAIL"
  | "COVER_LETTER"
  | "AUTOMATION"
  | "FOLLOW_UP";

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    agent: text("agent").$type<AgentName>().notNull(),
    status: text("status")
      .$type<"IDLE" | "RUNNING" | "COMPLETED" | "FAILED">()
      .notNull()
      .default("IDLE"),
    input: jsonObject<Record<string, unknown>>("input"),
    output: jsonObject<Record<string, unknown>>("output"),
    progress: integer("progress").notNull().default(0),
    message: text("message"),
    model: text("model"),
    promptVersion: text("prompt_version"),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    latencyMs: integer("latency_ms").notNull().default(0),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("agent_runs_user_started_idx").on(t.userId, t.startedAt),
    index("agent_runs_agent_status_idx").on(t.agent, t.status),
  ],
);

export const activityEvents = pgTable(
  "activity_events",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    agent: text("agent").notNull(),
    type: text("type").$type<"INFO" | "SUCCESS" | "WARNING" | "ERROR">().notNull().default("INFO"),
    message: text("message").notNull(),
    meta: jsonObject<Record<string, unknown>>("meta"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("activity_events_user_created_idx").on(t.userId, t.createdAt)],
);

export const followUps = pgTable(
  "follow_ups",
  {
    id: id(),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull().default(1),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    language: text("language").$type<"en" | "fr">().notNull().default("en"),
    status: text("status").$type<"DRAFT" | "APPROVED" | "SENT" | "SKIPPED">().notNull().default("DRAFT"),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("follow_ups_user_status_due_idx").on(t.userId, t.status, t.dueAt)],
);

export const automationRules = pgTable(
  "automation_rules",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    description: text("description").notNull().default(""),
    enabled: boolean("enabled").notNull().default(true),
    config: jsonObject<Record<string, number | string | boolean>>("config"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("automation_rules_user_key_unique").on(t.userId, t.key)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    type: text("type")
      .$type<"INFO" | "SUCCESS" | "WARNING" | "ERROR" | "APPROVAL">()
      .notNull()
      .default("INFO"),
    href: text("href"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_read_idx").on(t.userId, t.readAt)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    meta: jsonObject<Record<string, unknown>>("meta"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_logs_user_created_idx").on(t.userId, t.createdAt),
    index("audit_logs_entity_idx").on(t.entity, t.entityId),
  ],
);

// ─────────────────────────────────────────────────────────────
// Relations (typed query API)
// ─────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(candidateProfiles, { fields: [users.id], references: [candidateProfiles.userId] }),
  cvDocuments: many(cvDocuments),
  companies: many(companies),
  jobs: many(jobListings),
  matches: many(jobMatches),
  applications: many(applications),
}));

export const candidateProfilesRelations = relations(candidateProfiles, ({ one }) => ({
  user: one(users, { fields: [candidateProfiles.userId], references: [users.id] }),
}));

export const companiesRelations = relations(companies, ({ one, many }) => ({
  user: one(users, { fields: [companies.userId], references: [users.id] }),
  contacts: many(recruiterContacts),
  jobs: many(jobListings),
  applications: many(applications),
}));

export const recruiterContactsRelations = relations(recruiterContacts, ({ one }) => ({
  company: one(companies, { fields: [recruiterContacts.companyId], references: [companies.id] }),
}));

export const jobListingsRelations = relations(jobListings, ({ one, many }) => ({
  company: one(companies, { fields: [jobListings.companyId], references: [companies.id] }),
  user: one(users, { fields: [jobListings.userId], references: [users.id] }),
  matches: many(jobMatches),
  applications: many(applications),
}));

export const jobMatchesRelations = relations(jobMatches, ({ one }) => ({
  job: one(jobListings, { fields: [jobMatches.jobId], references: [jobListings.id] }),
}));

export const applicationsRelations = relations(applications, ({ one, many }) => ({
  user: one(users, { fields: [applications.userId], references: [users.id] }),
  job: one(jobListings, { fields: [applications.jobId], references: [jobListings.id] }),
  company: one(companies, { fields: [applications.companyId], references: [companies.id] }),
  cv: one(cvDocuments, { fields: [applications.cvDocumentId], references: [cvDocuments.id] }),
  emails: many(generatedEmails),
  coverLetters: many(coverLetters),
  followUps: many(followUps),
  messages: many(emailMessages),
}));

export const generatedEmailsRelations = relations(generatedEmails, ({ one }) => ({
  application: one(applications, { fields: [generatedEmails.applicationId], references: [applications.id] }),
}));

export const coverLettersRelations = relations(coverLetters, ({ one }) => ({
  application: one(applications, { fields: [coverLetters.applicationId], references: [applications.id] }),
  job: one(jobListings, { fields: [coverLetters.jobId], references: [jobListings.id] }),
}));

export const emailConnectionsRelations = relations(emailConnections, ({ one, many }) => ({
  user: one(users, { fields: [emailConnections.userId], references: [users.id] }),
  messages: many(emailMessages),
}));

export const emailMessagesRelations = relations(emailMessages, ({ one }) => ({
  application: one(applications, { fields: [emailMessages.applicationId], references: [applications.id] }),
  connection: one(emailConnections, { fields: [emailMessages.connectionId], references: [emailConnections.id] }),
}));

export const followUpsRelations = relations(followUps, ({ one }) => ({
  application: one(applications, { fields: [followUps.applicationId], references: [applications.id] }),
}));

// ─────────────────────────────────────────────────────────────
// Inferred types
// ─────────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type CandidateProfile = typeof candidateProfiles.$inferSelect;
export type CVDocument = typeof cvDocuments.$inferSelect;
export type Company = typeof companies.$inferSelect;
export type RecruiterContact = typeof recruiterContacts.$inferSelect;
export type JobListing = typeof jobListings.$inferSelect;
export type JobMatch = typeof jobMatches.$inferSelect;
export type Application = typeof applications.$inferSelect;
export type GeneratedEmail = typeof generatedEmails.$inferSelect;
export type CoverLetter = typeof coverLetters.$inferSelect;
export type EmailConnection = typeof emailConnections.$inferSelect;
export type EmailMessage = typeof emailMessages.$inferSelect;
export type AutomationTask = typeof automationTasks.$inferSelect;
export type AgentRun = typeof agentRuns.$inferSelect;
export type ActivityEvent = typeof activityEvents.$inferSelect;
export type FollowUp = typeof followUps.$inferSelect;
export type AutomationRule = typeof automationRules.$inferSelect;
export type AutomationSchedule = typeof automationSchedules.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;

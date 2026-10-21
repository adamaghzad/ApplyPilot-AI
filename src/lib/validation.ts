import { z } from "zod";

import { LANGUAGES, LETTER_STYLES, SENIORITIES, TONES, WORK_MODES } from "./enums";

export const emailSchema = z.string().email("Enter a valid email address").toLowerCase().trim();

export const signUpSchema = z
  .object({
    name: z.string().min(2, "Tell us your name").max(80),
    email: emailSchema,
    password: z
      .string()
      .min(8, "Use at least 8 characters")
      .max(128)
      .regex(/[A-Za-z]/, "Include at least one letter")
      .regex(/[0-9]/, "Include at least one number"),
    locale: z.enum(LANGUAGES).default("en"),
  })
  .strict();

export const signInSchema = z.object({ email: emailSchema, password: z.string().min(1, "Password required") }).strict();

export const profileBasicsSchema = z
  .object({
    fullName: z.string().min(2).max(120),
    headline: z.string().max(160).optional().nullable(),
    phone: z.string().max(40).optional().nullable(),
    city: z.string().max(80).optional().nullable(),
    country: z.string().max(80).optional().nullable(),
    linkedinUrl: z.string().url().optional().nullable().or(z.literal("")),
    githubUrl: z.string().url().optional().nullable().or(z.literal("")),
    portfolioUrl: z.string().url().optional().nullable().or(z.literal("")),
    yearsExperience: z.number().int().min(0).max(60).optional(),
    currentTitle: z.string().max(120).optional().nullable(),
    seniority: z.enum(SENIORITIES).optional().nullable(),
    summary: z.string().max(2000).optional().nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "No fields to update");

export const preferencesSchema = z.object({
  desiredTitles: z.array(z.string().min(2).max(120)).max(15).default([]),
  desiredSkills: z.array(z.string().min(1).max(60)).max(60).default([]),
  desiredLocations: z.array(z.string().min(2).max(120)).max(20).default([]),
  targetIndustries: z.array(z.string().min(2).max(80)).max(20).default([]),
  workModes: z.array(z.enum(WORK_MODES)).min(1, "Select at least one work mode").default(["REMOTE", "HYBRID"]),
  preferredLanguage: z.enum(LANGUAGES).default("en"),
  minSalary: z.number().int().min(0).max(1_000_000).nullable().optional(),
  maxSalary: z.number().int().min(0).max(10_000_000).nullable().optional(),
  currency: z.string().length(3).default("EUR"),
  availabilityWeeks: z.number().int().min(0).max(52).default(0),
  timezone: z.string().max(64).optional(),
});

export const automationPrefsSchema = z.object({
  automationMode: z.enum(["MANUAL", "ASSISTED", "SCHEDULED"]).default("ASSISTED"),
  autoApplyEnabled: z.boolean().default(false),
  dailyApplicationLimit: z.number().int().min(1).max(200).default(10),
});

export const onboardingCompleteSchema = z.object({
  step: z.number().int().min(0).max(6),
});

export const companySchema = z
  .object({
    name: z.string().min(2, "Company name is required").max(140),
    website: z.string().url().optional().nullable().or(z.literal("")),
    linkedinUrl: z.string().url().optional().nullable().or(z.literal("")),
    industry: z.string().max(80).optional().nullable(),
    targetTitle: z.string().max(140).optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
  })
  .strict();

export const companyUpdateSchema = companySchema.partial();

export const bulkCompanySchema = z.object({
  companies: z
    .array(
      z.object({
        name: z.string().min(2).max(140),
        website: z.string().url().optional().nullable().or(z.literal("")),
        targetTitle: z.string().max(140).optional().nullable(),
      }),
    )
    .min(1)
    .max(200),
});

export const researchCompanySchema = z.object({ companyId: z.string().min(1), deep: z.boolean().default(false) }).strict();

export const jobSearchSchema = z
  .object({
    keywords: z.array(z.string().min(2).max(120)).min(1, "Add at least one job title").max(10),
    locations: z.array(z.string().min(2).max(120)).max(10).default([]),
    remote: z.enum(WORK_MODES).optional().nullable(),
    skills: z.array(z.string().min(1).max(60)).max(40).default([]),
    seniority: z.enum(SENIORITIES).optional().nullable(),
    maxAgeDays: z.number().int().min(1).max(365).default(30),
    sources: z.array(z.enum(["LINKEDIN", "INDEED", "GREENHOUSE", "LEVER", "WTTJ", "CAREERS_PAGE"])).default([
      "GREENHOUSE",
      "LEVER",
      "CAREERS_PAGE",
      "WTTJ",
    ]),
    limit: z.number().int().min(1).max(100).default(25),
  })
  .strict();

export const emailGenerateSchema = z.object({
  applicationId: z.string().min(1),
  tone: z.enum(TONES).default("PROFESSIONAL"),
  language: z.enum(LANGUAGES).default("en"),
  recipientEmail: emailSchema.optional().nullable(),
  extraContext: z.string().max(1000).optional().nullable(),
});

export const emailUpdateSchema = z
  .object({ subject: z.string().min(3).max(200), body: z.string().min(20).max(8000) })
  .strict();

export const coverLetterGenerateSchema = z.object({
  applicationId: z.string().min(1).optional(),
  jobId: z.string().min(1).optional(),
  language: z.enum(LANGUAGES).default("en"),
  style: z.enum(LETTER_STYLES).default("PROFESSIONAL"),
});

export const coverLetterUpdateSchema = z
  .object({ title: z.string().min(2).max(200).optional(), content: z.string().min(20).max(20000), plainText: z.string().optional() })
  .strict();

export const applicationUpdateSchema = z
  .object({
    status: z
      .enum([
        "DISCOVERED",
        "RESEARCHING",
        "DRAFT_READY",
        "AWAITING_APPROVAL",
        "SCHEDULED",
        "SENT",
        "REPLIED",
        "INTERVIEW",
        "OFFER",
        "REJECTED",
        "FAILED",
      ])
      .optional(),
    notes: z.string().max(4000).optional().nullable(),
    scheduledFor: z.string().datetime().optional().nullable(),
    priority: z.number().int().min(0).max(5).optional(),
    boardOrder: z.number().optional(),
    recipientEmail: emailSchema.optional().nullable(),
    interviewAt: z.string().datetime().optional().nullable(),
  })
  .strict();

export const scheduleSchema = z
  .object({
    enabled: z.boolean().default(false),
    mode: z.enum(["MANUAL", "ASSISTED", "SCHEDULED"]).default("ASSISTED"),
    timezone: z.string().min(1).max(64).default("UTC"),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7).default([1, 2, 3, 4, 5]),
    startHour: z.number().int().min(0).max(23).default(9),
    endHour: z.number().int().min(0).max(23).default(11),
    maxPerRun: z.number().int().min(1).max(50).default(5),
    name: z.string().max(80).optional(),
  })
  .strict()
  .refine((v) => v.endHour > v.startHour, { message: "End hour must be after start hour", path: ["endHour"] });

export const ruleUpdateSchema = z
  .object({
    key: z.string().min(2).max(60),
    label: z.string().min(2).max(120),
    description: z.string().max(400).default(""),
    enabled: z.boolean().default(true),
    config: z.record(z.union([z.number(), z.string(), z.boolean()])).default({}),
  })
  .strict();

export const taskCreateSchema = z.object({
  type: z.enum([
    "RESEARCH_COMPANY",
    "DISCOVER_JOBS",
    "MATCH_JOB",
    "DRAFT_EMAIL",
    "DRAFT_COVER_LETTER",
    "PREPARE_APPLICATION",
    "SEND_APPLICATION",
    "DRAFT_FOLLOW_UP",
    "SYNC_MAILBOX",
  ]),
  payload: z.record(z.unknown()).default({}),
  runAfter: z.string().datetime().optional(),
  priority: z.number().int().min(0).max(10).optional(),
});

export const sendApplicationSchema = z
  .object({
    applicationId: z.string().min(1),
    connectionId: z.string().min(1).optional(),
    scheduleAt: z.string().datetime().optional().nullable(),
  })
  .strict();

export const followUpSchema = z.object({ applicationId: z.string().min(1), language: z.enum(LANGUAGES).default("en") }).strict();

export const cvMetaUpdateSchema = z.object({ isPrimary: z.boolean() }).strict();

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type PreferencesInput = z.infer<typeof preferencesSchema>;
export type JobSearchInput = z.infer<typeof jobSearchSchema>;
export type CompanyInput = z.infer<typeof companySchema>;
export type ScheduleInput = z.infer<typeof scheduleSchema>;
export type EmailGenerateInput = z.infer<typeof emailGenerateSchema>;
export type CoverLetterGenerateInput = z.infer<typeof coverLetterGenerateSchema>;
export type ApplicationUpdateInput = z.infer<typeof applicationUpdateSchema>;

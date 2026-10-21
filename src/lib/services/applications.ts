import { and, asc, count, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import {
  applications,
  candidateProfiles,
  companies,
  coverLetters,
  cvDocuments,
  emailConnections,
  emailMessages,
  followUps,
  generatedEmails,
  jobListings,
  jobMatches,
  recruiterContacts,
  type Application,
  type ApplicationStatus,
} from "@/lib/db/schema";
import { draftCoverLetter } from "@/lib/ai/agents/coverLetter";
import { draftEmail } from "@/lib/ai/agents/email";
import { draftFollowUp } from "@/lib/ai/agents/followUp";
import { PROMPT_VERSION } from "@/lib/ai/client";
import { recordActivity, notify, recordAudit, startAgentRun, updateAgentRun } from "@/lib/audit";
import { ApiError } from "@/lib/api";
import { eventBus } from "@/lib/events";
import { enqueue } from "@/lib/jobs/queue";
import { runCompanyResearch } from "@/lib/services/companies";
import { rescoreJob } from "@/lib/services/discovery";
import {
  ensureAccessToken,
  getConnection,
  markRateLimited,
  resetDailyCountersIfNeeded,
} from "@/lib/services/connections";
import {
  booleanRule,
  followUpDueDate,
  getRules,
  isRuleActive,
  nextWindowStart,
  numberRule,
  withinSendWindow,
} from "@/lib/services/rules";
import { getCvFile } from "@/lib/services/cv";
import { sendGmailMessage, listGmailMessages, getGmailMessage } from "@/lib/integrations/gmail";
import { listOutlookInbox, sendOutlookMessage } from "@/lib/integrations/outlook";
import { addBusinessDays } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────

export async function listApplications(userId: string, filters: { status?: ApplicationStatus[]; search?: string } = {}) {
  const query = getDb()
    .select({
      application: applications,
      job: jobListings,
      company: companies,
    })
    .from(applications)
    .innerJoin(jobListings, eq(jobListings.id, applications.jobId))
    .innerJoin(companies, eq(companies.id, applications.companyId))
    .where(
      and(
        eq(applications.userId, userId),
        filters.status?.length ? inArray(applications.status, filters.status) : undefined,
      ),
    )
    .orderBy(desc(applications.updatedAt));

  const rows = await query;
  const search = filters.search?.trim().toLowerCase();
  return rows.filter((row) => {
    if (!search) return true;
    return (
      row.job.title.toLowerCase().includes(search) ||
      row.company.name.toLowerCase().includes(search) ||
      (row.application.recipientEmail ?? "").toLowerCase().includes(search)
    );
  });
}

export async function getApplicationDetail(userId: string, applicationId: string) {
  const [row] = await getDb()
    .select({ application: applications, job: jobListings, company: companies })
    .from(applications)
    .innerJoin(jobListings, eq(jobListings.id, applications.jobId))
    .innerJoin(companies, eq(companies.id, applications.companyId))
    .where(and(eq(applications.id, applicationId), eq(applications.userId, userId)))
    .limit(1);

  if (!row) throw new ApiError("Application not found", 404);

  const [emails, letters, messages, followUpRows, contacts, match] = await Promise.all([
    getDb().select().from(generatedEmails).where(eq(generatedEmails.applicationId, applicationId)).orderBy(desc(generatedEmails.createdAt)),
    getDb().select().from(coverLetters).where(eq(coverLetters.applicationId, applicationId)).orderBy(desc(coverLetters.createdAt)),
    getDb().select().from(emailMessages).where(eq(emailMessages.applicationId, applicationId)).orderBy(desc(emailMessages.receivedAt)),
    getDb().select().from(followUps).where(eq(followUps.applicationId, applicationId)).orderBy(asc(followUps.dueAt)),
    getDb().select().from(recruiterContacts).where(eq(recruiterContacts.companyId, row.company.id)).orderBy(desc(recruiterContacts.confidence)),
    getDb().select().from(jobMatches).where(and(eq(jobMatches.jobId, row.job.id), eq(jobMatches.userId, userId))).limit(1),
  ]);

  return { ...row, emails, coverLetters: letters, messages, followUps: followUpRows, contacts, match: match[0] ?? null };
}

export async function ensureApplication(userId: string, jobId: string): Promise<Application> {
  const [existing] = await getDb()
    .select()
    .from(applications)
    .where(and(eq(applications.userId, userId), eq(applications.jobId, jobId)))
    .limit(1);
  if (existing) return existing;

  const [job] = await getDb().select().from(jobListings).where(and(eq(jobListings.id, jobId), eq(jobListings.userId, userId))).limit(1);
  if (!job) throw new ApiError("Job listing not found", 404);

  const [primaryCv] = await getDb()
    .select()
    .from(cvDocuments)
    .where(and(eq(cvDocuments.userId, userId), eq(cvDocuments.isPrimary, true)))
    .limit(1);

  const [created] = await getDb()
    .insert(applications)
    .values({ userId, jobId, companyId: job.companyId, status: "DISCOVERED", cvDocumentId: primaryCv?.id ?? null })
    .onConflictDoNothing()
    .returning();

  const application = created ?? (await getDb().select().from(applications).where(and(eq(applications.userId, userId), eq(applications.jobId, jobId))).limit(1))[0];

  eventBus.publish(userId, { type: "application", payload: { action: "created", application } });
  return application;
}

// ─────────────────────────────────────────────────────────────
// Step 3 → 9: prepare a complete, reviewable application
// ─────────────────────────────────────────────────────────────

/**
 * Researches the company, scores the job, drafts a personalized email and a unique
 * cover letter, then parks the application in the review queue.
 *
 * Nothing is ever sent from here — sending requires explicit approval.
 */
export async function prepareApplication(userId: string, jobId: string, options: { force?: boolean } = {}) {
  const run = await startAgentRun({ userId, agent: "AUTOMATION", input: { jobId }, message: "Preparing application" });

  const application = await ensureApplication(userId, jobId);
  if (application.status === "AWAITING_APPROVAL" || application.status === "SENT" || application.status === "SCHEDULED") {
    if (!options.force) {
      await updateAgentRun(run.id, userId, { status: "COMPLETED", progress: 100, message: "Already prepared" });
      return { application, skipped: true as const };
    }
  }

  const rules = await getRules(userId);
  await getDb().update(applications).set({ status: "RESEARCHING", updatedAt: new Date() }).where(eq(applications.id, application.id));

  const [job] = await getDb().select().from(jobListings).where(eq(jobListings.id, jobId)).limit(1);
  let [company] = await getDb().select().from(companies).where(eq(companies.id, job.companyId)).limit(1);
  const [profile] = await getDb().select().from(candidateProfiles).where(eq(candidateProfiles.userId, userId)).limit(1);

  if (!profile) throw new ApiError("Complete your candidate profile before preparing applications", 400);

  // ── 4. Company research ──────────────────────────────────────
  if (company.researchStatus !== "READY" || options.force) {
    await recordActivity({ userId, agent: "RESEARCH", message: `Researching ${company.name} before drafting`, meta: { companyId: company.id } });
    try {
      await runCompanyResearch(userId, company.id);
      const [refreshed] = await getDb().select().from(companies).where(eq(companies.id, company.id)).limit(1);
      company = refreshed ?? company;
    } catch (error) {
      await recordActivity({
        userId,
        agent: "RESEARCH",
        message: `Research incomplete for ${company.name}: ${error instanceof Error ? error.message : "error"}`,
        type: "WARNING",
      });
    }
  }

  // ── 6. Compatibility ─────────────────────────────────────────
  await updateAgentRun(run.id, userId, { progress: 35, message: "Scoring compatibility" });
  const match = await rescoreJob(userId, jobId);

  if (match && isRuleActive(rules, "min_match_score")) {
    const minScore = numberRule(rules, "min_match_score", "value", 85);
    if (match.score < minScore) {
      await getDb().update(applications).set({ status: "DISCOVERED", compatibilityScore: match.score, updatedAt: new Date() }).where(eq(applications.id, application.id));
      await updateAgentRun(run.id, userId, { status: "COMPLETED", progress: 100, message: `Below threshold (${match.score}% < ${minScore}%)` });
      await recordActivity({
        userId,
        agent: "MATCHING",
        message: `${job.title} @ ${company.name} scored ${match.score}% — below your ${minScore}% threshold, not prepared`,
        type: "WARNING",
        meta: { jobId, score: match.score },
      });
      return { application: { ...application, status: "DISCOVERED" as ApplicationStatus, compatibilityScore: match.score }, skipped: true as const, reason: "below-threshold" as const };
    }
  }

  // ── 5. Recruitment channel ───────────────────────────────────
  await updateAgentRun(run.id, userId, { progress: 50, message: "Selecting recruitment channel" });
  const contacts = await getDb()
    .select()
    .from(recruiterContacts)
    .where(eq(recruiterContacts.companyId, company.id))
    .orderBy(desc(recruiterContacts.confidence));

  const usableContact = contacts.find(
    (contact) => contact.confidence >= 0.6 && (contact.verification === "VERIFIED_PUBLIC" || contact.verification === "PATTERN_INFERRED"),
  );
  const channel = usableContact ? "EMAIL" : job.applyUrl ? "PORTAL" : ("MANUAL" as const);

  await recordActivity({
    userId,
    agent: "RESEARCH",
    message: usableContact
      ? `Recruitment channel found for ${company.name}: ${usableContact.email} (${usableContact.verification.toLowerCase().replace("_", " ")})`
      : `No verified recruitment email for ${company.name} — application will use the official job link`,
    type: usableContact ? "SUCCESS" : "WARNING",
    meta: { companyId: company.id, channel },
  });

  // ── 7. Personalized email ────────────────────────────────────
  await updateAgentRun(run.id, userId, { progress: 65, message: "Drafting email" });
  const draft = await draftEmail({
    profile,
    job,
    company,
    contactName: usableContact?.name ?? null,
    recipientEmail: usableContact?.email ?? null,
    tone: profile.preferredLanguage === "fr" ? "PROFESSIONAL" : "PROFESSIONAL",
    language: profile.preferredLanguage ?? "en",
  });

  const [email] = await getDb()
    .insert(generatedEmails)
    .values({
      applicationId: application.id,
      userId,
      subject: draft.subject,
      body: draft.body,
      tone: "PROFESSIONAL",
      language: profile.preferredLanguage ?? "en",
      recipientEmail: usableContact?.email ?? null,
      personalizationScore: draft.personalizationScore,
      qualityScore: draft.qualityScore,
      model: draft.model,
      promptVersion: PROMPT_VERSION,
      generationMs: draft.latencyMs,
    })
    .returning();

  await recordActivity({
    userId,
    agent: "EMAIL",
    message: `Personalized email drafted — ${draft.personalizationScore}% personalization, ${draft.qualityScore}% quality`,
    type: "SUCCESS",
    meta: { applicationId: application.id, model: draft.model },
  });

  // ── 8. Cover letter ──────────────────────────────────────────
  await updateAgentRun(run.id, userId, { progress: 85, message: "Writing cover letter" });
  const letter = await draftCoverLetter({
    profile,
    job,
    company,
    language: profile.preferredLanguage ?? "en",
    style: "PROFESSIONAL",
  });

  await getDb()
    .insert(coverLetters)
    .values({
      applicationId: application.id,
      jobId,
      userId,
      title: letter.title,
      content: letter.content,
      plainText: letter.plainText,
      language: profile.preferredLanguage ?? "en",
      style: "PROFESSIONAL",
      model: letter.model,
      promptVersion: PROMPT_VERSION,
      generationMs: letter.latencyMs,
    })
    .returning();

  await recordActivity({
    userId,
    agent: "COVER_LETTER",
    message: `Cover letter generated for ${company.name} — ${letter.wordCount} words`,
    type: "SUCCESS",
    meta: { applicationId: application.id, model: letter.model },
  });

  // ── 9. Park in the review queue ──────────────────────────────
  const nextStatus: ApplicationStatus = profile.automationMode === "MANUAL" ? "DRAFT_READY" : "AWAITING_APPROVAL";

  const [updated] = await getDb()
    .update(applications)
    .set({
      status: nextStatus,
      channel,
      compatibilityScore: match?.score ?? application.compatibilityScore,
      recipientEmail: usableContact?.email ?? null,
      subject: draft.subject,
      updatedAt: new Date(),
    })
    .where(eq(applications.id, application.id))
    .returning();

  await updateAgentRun(run.id, userId, {
    progress: 100,
    status: "COMPLETED",
    message: "Application ready for review",
    output: { score: match?.score, channel, emailId: email.id },
  });

  await recordActivity({
    userId,
    agent: "AUTOMATION",
    message: `Application ready for review — ${job.title} @ ${company.name} (${match?.score ?? 0}%)`,
    type: "SUCCESS",
    meta: { applicationId: application.id },
  });

  await notify({
    userId,
    title: "Application awaiting approval",
    body: `${job.title} at ${company.name} — ${match?.score ?? 0}% compatibility`,
    type: "APPROVAL",
    href: `/applications?focus=${application.id}`,
  });

  eventBus.publish(userId, { type: "application", payload: { action: "prepared", application: updated } });
  return { application: updated, skipped: false as const };
}

// ─────────────────────────────────────────────────────────────
// Step 10 → 12: approval, scheduling, sending
// ─────────────────────────────────────────────────────────────

export async function approveApplication(userId: string, applicationId: string, options: { scheduleAt?: Date | null; connectionId?: string } = {}) {
  const [application] = await getDb()
    .select()
    .from(applications)
    .where(and(eq(applications.id, applicationId), eq(applications.userId, userId)))
    .limit(1);
  if (!application) throw new ApiError("Application not found", 404);
  if (application.sentAt) throw new ApiError("This application has already been sent", 409);

  const rules = await getRules(userId);
  const scheduledFor = options.scheduleAt ?? null;

  const [updated] = await getDb()
    .update(applications)
    .set({
      status: scheduledFor ? "SCHEDULED" : "AWAITING_APPROVAL",
      approvedAt: new Date(),
      scheduledFor,
      updatedAt: new Date(),
    })
    .where(eq(applications.id, applicationId))
    .returning();

  await getDb().update(generatedEmails).set({ status: "APPROVED", updatedAt: new Date() }).where(eq(generatedEmails.applicationId, applicationId));

  await recordAudit({ userId, action: "application.approve", entity: "application", entityId: applicationId });
  await recordActivity({
    userId,
    agent: "AUTOMATION",
    message: scheduledFor
      ? `Application approved — scheduled for ${scheduledFor.toISOString().slice(0, 16).replace("T", " ")} UTC`
      : "Application approved — queued for sending",
    type: "SUCCESS",
    meta: { applicationId },
  });

  if (!scheduledFor) {
    await enqueue({
      userId,
      type: "SEND_APPLICATION",
      payload: { applicationId, connectionId: options.connectionId ?? null },
      idempotencyKey: `send:${applicationId}`,
      priority: 2,
    });
  } else if (isRuleActive(rules, "never_duplicate")) {
    await enqueue({
      userId,
      type: "SEND_APPLICATION",
      payload: { applicationId, connectionId: options.connectionId ?? null },
      idempotencyKey: `send:${applicationId}`,
      priority: 2,
      runAfter: scheduledFor,
    });
  }

  eventBus.publish(userId, { type: "application", payload: { action: "approved", application: updated } });
  return updated;
}

export type SendOutcome = {
  status: "sent" | "skipped" | "scheduled" | "needs-channel";
  reason?: string;
  scheduledFor?: Date | null;
  providerMessageId?: string;
};

/**
 * Idempotent send. Safe to call repeatedly: the `sentAt` guard plus the task
 * idempotency key guarantee an application is delivered at most once.
 */
export async function sendApplication(userId: string, applicationId: string, options: { connectionId?: string | null; ignoreWindow?: boolean } = {}): Promise<SendOutcome> {
  const [row] = await getDb()
    .select({ application: applications, job: jobListings, company: companies })
    .from(applications)
    .innerJoin(jobListings, eq(jobListings.id, applications.jobId))
    .innerJoin(companies, eq(companies.id, applications.companyId))
    .where(and(eq(applications.id, applicationId), eq(applications.userId, userId)))
    .limit(1);

  if (!row) throw new ApiError("Application not found", 404);
  const { application, job, company } = row;

  // ── Idempotency ──────────────────────────────────────────────
  if (application.sentAt) return { status: "skipped", reason: "Already sent" };

  const rules = await getRules(userId);

  // ── Approval rule ────────────────────────────────────────────
  if (booleanRule(rules, "require_approval", "enabled", true) && !application.approvedAt) {
    return { status: "skipped", reason: "Approval required before sending" };
  }

  // ── Channel ──────────────────────────────────────────────────
  if (application.channel === "PORTAL" || application.channel === "MANUAL") {
    return { status: "needs-channel", reason: "Apply through the official link — no verified recruitment email available" };
  }

  // ── Sending window (scheduled mode) ──────────────────────────
  if (!options.ignoreWindow && application.mode === "SCHEDULED" && !withinSendWindow(rules, new Date())) {
    const scheduledFor = nextWindowStart(rules, new Date());
    await getDb().update(applications).set({ scheduledFor, status: "SCHEDULED", updatedAt: new Date() }).where(eq(applications.id, applicationId));
    await enqueue({
      userId,
      type: "SEND_APPLICATION",
      payload: { applicationId },
      idempotencyKey: `send:${applicationId}`,
      runAfter: scheduledFor,
      priority: 2,
    });
    return { status: "scheduled", scheduledFor };
  }

  // ── Mailbox ──────────────────────────────────────────────────
  const connection = await getConnection(userId, options.connectionId ?? null);
  if (!connection) throw new ApiError("No connected mailbox — connect Gmail or Outlook first", 400);
  if (connection.status === "RATE_LIMITED") throw new ApiError("Mailbox is rate limited — automation paused", 429);

  // ── Daily limit ──────────────────────────────────────────────
  const sentToday = await resetDailyCountersIfNeeded(connection);
  const limit = Math.min(numberRule(rules, "daily_send_limit", "value", 10), connection.dailyLimit);
  if (sentToday >= limit) {
    await notify({ userId, title: "Daily sending limit reached", body: `${sentToday}/${limit} emails sent today. Resumes tomorrow.`, type: "WARNING" });
    return { status: "skipped", reason: `Daily limit reached (${sentToday}/${limit})` };
  }

  // ── Content ──────────────────────────────────────────────────
  const [email] = await getDb()
    .select()
    .from(generatedEmails)
    .where(eq(generatedEmails.applicationId, applicationId))
    .orderBy(desc(generatedEmails.createdAt))
    .limit(1);
  const [letter] = await getDb()
    .select()
    .from(coverLetters)
    .where(eq(coverLetters.applicationId, applicationId))
    .orderBy(desc(coverLetters.createdAt))
    .limit(1);

  if (!email) throw new ApiError("No drafted email for this application", 400);
  const recipient = application.recipientEmail ?? email.recipientEmail;
  if (!recipient) throw new ApiError("No recipient email address for this application", 400);

  // ── Attachment (CV) ──────────────────────────────────────────
  let attachments: { filename: string; mimeType: string; content: Buffer }[] = [];
  if (application.cvDocumentId) {
    try {
      const { document, buffer } = await getCvFile(userId, application.cvDocumentId);
      attachments = [{ filename: document.fileName, mimeType: document.mimeType, content: buffer }];
    } catch (error) {
      console.warn("[send] CV attachment unavailable:", error);
    }
  }

  const body = letter ? `${email.body}\n\n${letter.plainText}` : email.body;
  const accessToken = await ensureAccessToken(connection);

  try {
    let providerMessageId = "";
    if (connection.provider === "GMAIL") {
      const result = await sendGmailMessage(accessToken, {
        from: connection.emailAddress,
        fromName: connection.displayName ?? undefined,
        to: [recipient],
        subject: email.subject,
        body,
        attachments,
      });
      providerMessageId = result.providerMessageId;
    } else {
      const result = await sendOutlookMessage(accessToken, { to: [recipient], subject: email.subject, body, attachments });
      providerMessageId = result.providerMessageId;
    }

    const now = new Date();
    const followUpDays = numberRule(rules, "follow_up_after_days", "value", 7);

    await getDb()
      .update(applications)
      .set({ status: "SENT", sentAt: now, followUpDueAt: followUpDueDate(now, followUpDays), updatedAt: new Date() })
      .where(eq(applications.id, applicationId));

    await getDb().update(generatedEmails).set({ status: "SENT", updatedAt: new Date() }).where(eq(generatedEmails.id, email.id));

    await getDb().insert(emailMessages).values({
      userId,
      connectionId: connection.id,
      applicationId,
      providerMessageId,
      direction: "OUTBOUND",
      from: connection.emailAddress,
      to: recipient,
      subject: email.subject,
      snippet: body.slice(0, 200),
      body,
    });

    await getDb()
      .update(emailConnections)
      .set({ sentToday: sentToday + 1, lastUsedAt: now, updatedAt: new Date() })
      .where(eq(emailConnections.id, connection.id));

    await createFollowUpDraft(userId, applicationId, { dueAt: followUpDueDate(now, followUpDays) });

    await recordAudit({ userId, action: "application.send", entity: "application", entityId: applicationId, meta: { to: recipient, provider: connection.provider } });
    await recordActivity({
      userId,
      agent: "AUTOMATION",
      message: `Application sent to ${recipient} — ${job.title} @ ${company.name}`,
      type: "SUCCESS",
      meta: { applicationId, provider: connection.provider },
    });
    await notify({ userId, title: "Application sent", body: `${job.title} at ${company.name}`, type: "SUCCESS", href: `/applications?focus=${applicationId}` });

    eventBus.publish(userId, { type: "application", payload: { action: "sent", applicationId, to: recipient } });
    return { status: "sent", providerMessageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Send failed";
    const rateLimited = /rate limit|quota|429|throttled/i.test(message);

    if (rateLimited) {
      await markRateLimited(connection.id, message);
      await notify({ userId, title: "Mailbox rate limited", body: "Automation paused to respect provider limits. It resumes automatically.", type: "WARNING" });
      await recordActivity({ userId, agent: "AUTOMATION", message: `Rate limited by ${connection.provider} — automation paused`, type: "WARNING" });

      if (isRuleActive(rules, "pause_on_rate_limit")) {
        const resumeAt = new Date(Date.now() + 15 * 60_000);
        await enqueue({
          userId,
          type: "SEND_APPLICATION",
          payload: { applicationId },
          idempotencyKey: `send:${applicationId}`,
          runAfter: resumeAt,
          priority: 1,
        });
        return { status: "scheduled", scheduledFor: resumeAt, reason: message };
      }
    }

    await getDb().update(applications).set({ updatedAt: new Date() }).where(eq(applications.id, applicationId));
    await recordActivity({ userId, agent: "AUTOMATION", message: `Send failed: ${message}`, type: "ERROR", meta: { applicationId } });
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────
// Follow-ups (step 13)
// ─────────────────────────────────────────────────────────────

export async function createFollowUpDraft(userId: string, applicationId: string, options: { dueAt?: Date } = {}) {
  const [row] = await getDb()
    .select({ application: applications, job: jobListings, company: companies })
    .from(applications)
    .innerJoin(jobListings, eq(jobListings.id, applications.jobId))
    .innerJoin(companies, eq(companies.id, applications.companyId))
    .where(and(eq(applications.id, applicationId), eq(applications.userId, userId)))
    .limit(1);
  if (!row) throw new ApiError("Application not found", 404);

  const [profile] = await getDb().select().from(candidateProfiles).where(eq(candidateProfiles.userId, userId)).limit(1);
  if (!profile) throw new ApiError("Candidate profile missing", 400);

  const existing = await getDb().select().from(followUps).where(and(eq(followUps.applicationId, applicationId), eq(followUps.status, "DRAFT"))).limit(1);
  if (existing.length) return existing[0];

  const rules = await getRules(userId);
  const days = numberRule(rules, "follow_up_after_days", "value", 7);
  const dueAt = options.dueAt ?? addBusinessDays(row.application.sentAt ?? new Date(), days);
  const sequence = (await getDb().select({ value: count() }).from(followUps).where(eq(followUps.applicationId, applicationId)))[0]?.value ?? 0;

  const draft = await draftFollowUp({
    profile,
    companyName: row.company.name,
    jobTitle: row.job.title,
    sentAt: row.application.sentAt ?? new Date(),
    sequence: sequence + 1,
    language: profile.preferredLanguage ?? "en",
  });

  const [followUp] = await getDb()
    .insert(followUps)
    .values({
      applicationId,
      userId,
      sequence: sequence + 1,
      subject: draft.subject,
      body: draft.body,
      language: profile.preferredLanguage ?? "en",
      dueAt,
    })
    .returning();

  await recordActivity({
    userId,
    agent: "FOLLOW_UP",
    message: `Follow-up #${sequence + 1} drafted for ${row.company.name} — due ${dueAt.toISOString().slice(0, 10)}`,
    type: "INFO",
    meta: { applicationId, followUpId: followUp.id },
  });

  eventBus.publish(userId, { type: "application", payload: { action: "follow-up-drafted", followUp } });
  return followUp;
}

// ─────────────────────────────────────────────────────────────
// Status & controls
// ─────────────────────────────────────────────────────────────

export async function updateApplication(userId: string, applicationId: string, patch: Partial<Application> & { notes?: string | null }) {
  const [updated] = await getDb()
    .update(applications)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(applications.id, applicationId), eq(applications.userId, userId)))
    .returning();
  if (!updated) throw new ApiError("Application not found", 404);

  await recordActivity({
    userId,
    agent: "AUTOMATION",
    message: `Application moved to ${updated.status.replace(/_/g, " ").toLowerCase()}`,
    meta: { applicationId, status: updated.status },
  });
  eventBus.publish(userId, { type: "application", payload: { action: "updated", application: updated } });
  return updated;
}

/** Emergency stop: cancels every pending task for the user. */
export async function emergencyStop(userId: string) {
  const { cancelPendingTasks } = await import("@/lib/jobs/queue");
  await cancelPendingTasks(userId);
  await getDb().update(applications).set({ updatedAt: new Date() }).where(and(eq(applications.userId, userId), eq(applications.status, "SCHEDULED")));
  await recordActivity({ userId, agent: "AUTOMATION", message: "Emergency stop — all pending tasks cancelled", type: "WARNING" });
  await notify({ userId, title: "Automation stopped", body: "All pending tasks were cancelled. Scheduled applications remain unsent.", type: "WARNING" });
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// Mailbox sync → recruiter replies
// ─────────────────────────────────────────────────────────────

/**
 * Detects recruiter replies and links them to applications.
 * Read-only: it never sends anything.
 */
export async function syncMailbox(userId: string) {
  const { listConnections, ensureAccessToken } = await import("@/lib/services/connections");
  const connections = await listConnections(userId);
  const active = connections.filter((connection) => connection.status === "CONNECTED");
  const results: { provider: string; checked: number; imported: number; error?: string }[] = [];

  for (const connection of active) {
    try {
      const accessToken = await ensureAccessToken(connection);
      let imported = 0;
      let checked = 0;

      if (connection.provider === "GMAIL") {
        const messages = await listGmailMessages(accessToken, "newer_than:60d -from:me", 25);
        checked = messages.length;
        for (const message of messages) {
          const detail = await getGmailMessage(accessToken, message.id);
          const from = extractEmailAddress(detail.from);
          if (!from) continue;
          const application = await findApplicationByCorrespondent(userId, from, detail.subject);
          if (!application) continue;
          const saved = await recordInbound({ userId, connectionId: connection.id, applicationId: application.id, from, subject: detail.subject, body: detail.body, snippet: detail.snippet, providerMessageId: detail.id, receivedAt: new Date(detail.date || Date.now()) });
          if (saved) imported += 1;
        }
      } else {
        const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
        const messages = await listOutlookInbox(accessToken, `receivedDateTime ge ${since}`, 25);
        checked = messages.length;
        for (const message of messages) {
          const from = extractEmailAddress(message.from);
          if (!from) continue;
          const application = await findApplicationByCorrespondent(userId, from, message.subject);
          if (!application) continue;
          const saved = await recordInbound({ userId, connectionId: connection.id, applicationId: application.id, from, subject: message.subject, body: message.snippet, snippet: message.snippet, providerMessageId: message.id, receivedAt: new Date(message.receivedAt) });
          if (saved) imported += 1;
        }
      }

      results.push({ provider: connection.provider, checked, imported });
    } catch (error) {
      results.push({ provider: connection.provider, checked: 0, imported: 0, error: error instanceof Error ? error.message : "error" });
    }
  }

  if (results.some((r) => r.imported > 0)) {
    await recordActivity({
      userId,
      agent: "FOLLOW_UP",
      message: `Mailbox synced — ${results.reduce((sum, r) => sum + r.imported, 0)} new recruiter message(s)`,
      type: "SUCCESS",
      meta: { results },
    });
  }

  return results;
}

function extractEmailAddress(value: string): string | null {
  const match = value.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match ? match[0].toLowerCase() : null;
}

async function findApplicationByCorrespondent(userId: string, from: string, subject: string) {
  const byRecipient = await getDb()
    .select()
    .from(applications)
    .where(and(eq(applications.userId, userId), eq(applications.recipientEmail, from)))
    .limit(1);
  if (byRecipient[0]) return byRecipient[0];

  const sent = await getDb().select().from(applications).where(and(eq(applications.userId, userId), isNotNull(applications.sentAt)));
  const normalisedSubject = subject.toLowerCase().replace(/^(re|fwd|tr)\s*:\s*/i, "").trim();
  return (
    sent.find((application) => application.subject && normalisedSubject.includes(application.subject.toLowerCase().slice(0, 30))) ?? null
  );
}

async function recordInbound(input: {
  userId: string;
  connectionId: string;
  applicationId: string;
  from: string;
  subject: string;
  body: string;
  snippet: string;
  providerMessageId: string;
  receivedAt: Date;
}) {
  const existing = await getDb()
    .select()
    .from(emailMessages)
    .where(and(eq(emailMessages.applicationId, input.applicationId), eq(emailMessages.providerMessageId, input.providerMessageId)))
    .limit(1);
  if (existing.length) return null;

  const [message] = await getDb()
    .insert(emailMessages)
    .values({
      userId: input.userId,
      connectionId: input.connectionId,
      applicationId: input.applicationId,
      providerMessageId: input.providerMessageId,
      direction: "INBOUND",
      from: input.from,
      to: "",
      subject: input.subject,
      snippet: input.snippet,
      body: input.body,
      isReply: true,
      receivedAt: input.receivedAt,
    })
    .returning();

  await getDb()
    .update(applications)
    .set({ repliedAt: new Date(), status: "REPLIED", followUpDueAt: null, updatedAt: new Date() })
    .where(and(eq(applications.id, input.applicationId), eq(applications.userId, input.userId)));

  // Cancel pending follow-ups — the recruiter already answered.
  await getDb()
    .update(followUps)
    .set({ status: "SKIPPED", updatedAt: new Date() })
    .where(and(eq(followUps.applicationId, input.applicationId), eq(followUps.status, "DRAFT")));

  await recordActivity({
    userId: input.userId,
    agent: "FOLLOW_UP",
    message: `Recruiter replied (${input.from}) — follow-ups cancelled`,
    type: "SUCCESS",
    meta: { applicationId: input.applicationId },
  });
  await notify({ userId: input.userId, title: "Recruiter replied", body: `${input.from}: ${input.subject}`, type: "SUCCESS", href: `/applications?focus=${input.applicationId}` });

  eventBus.publish(input.userId, { type: "application", payload: { action: "replied", message } });
  return message;
}

// ─────────────────────────────────────────────────────────────
// Analytics
// ─────────────────────────────────────────────────────────────

export async function getPipelineStats(userId: string) {
  const [totals] = await getDb()
    .select({
      total: count(),
      sent: sql<number>`sum(case when ${applications.sentAt} is not null then 1 else 0 end)`,
      replied: sql<number>`sum(case when ${applications.repliedAt} is not null then 1 else 0 end)`,
      interviews: sql<number>`sum(case when ${applications.interviewAt} is not null then 1 else 0 end)`,
      offers: sql<number>`sum(case when ${applications.status} = 'OFFER' then 1 else 0 end)`,
      awaiting: sql<number>`sum(case when ${applications.status} = 'AWAITING_APPROVAL' then 1 else 0 end)`,
      scheduled: sql<number>`sum(case when ${applications.status} = 'SCHEDULED' then 1 else 0 end)`,
    })
    .from(applications)
    .where(eq(applications.userId, userId));

  return {
    total: Number(totals?.total ?? 0),
    sent: Number(totals?.sent ?? 0),
    replied: Number(totals?.replied ?? 0),
    interviews: Number(totals?.interviews ?? 0),
    offers: Number(totals?.offers ?? 0),
    awaitingApproval: Number(totals?.awaiting ?? 0),
    scheduled: Number(totals?.scheduled ?? 0),
    successRate: Number(totals?.sent ?? 0) > 0 ? Number(totals?.replied ?? 0) / Number(totals.sent) : 0,
  };
}

export async function getActivitySeries(userId: string, days = 14) {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await getDb()
    .select({ day: sql<string>`to_char(${applications.sentAt}, 'YYYY-MM-DD')`, sent: count() })
    .from(applications)
    .where(and(eq(applications.userId, userId), gte(applications.sentAt, since)))
    .groupBy(sql`to_char(${applications.sentAt}, 'YYYY-MM-DD')`);
  return rows;
}

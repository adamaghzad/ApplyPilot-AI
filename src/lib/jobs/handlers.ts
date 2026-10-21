import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { automationTasks, candidateProfiles } from "@/lib/db/schema";
import { runCompanyResearch } from "@/lib/services/companies";
import { rescoreJob, runJobDiscovery, type DiscoveryCriteria } from "@/lib/services/discovery";
import { prepareApplication, sendApplication, syncMailbox, createFollowUpDraft } from "@/lib/services/applications";
import { notify } from "@/lib/audit";

export type TaskRow = typeof automationTasks.$inferSelect;

/**
 * Background task dispatcher.
 *
 * Every handler is idempotent: re-running a completed task produces no side effects
 * (guards: `sentAt`, unique idempotency keys, `onConflictDoNothing` inserts).
 */
export async function handleTask(task: TaskRow): Promise<Record<string, unknown>> {
  const payload = (task.payload ?? {}) as Record<string, unknown>;

  switch (task.type) {
    case "RESEARCH_COMPANY": {
      const companyId = String(payload.companyId ?? "");
      if (!companyId) throw new Error("companyId missing");
      const result = await runCompanyResearch(task.userId, companyId);
      return { companyId, contacts: result.contactsCreated, confidence: result.result.confidence };
    }

    case "DISCOVER_JOBS": {
      const [profile] = await getDb().select().from(candidateProfiles).where(eq(candidateProfiles.userId, task.userId)).limit(1);
      const criteria: DiscoveryCriteria = {
        keywords: (payload.keywords as unknown as string[] | undefined) ?? (profile?.desiredTitles ?? []),
        locations: (payload.locations as unknown as string[] | undefined) ?? (profile?.desiredLocations ?? []),
        remote: (payload.remote as DiscoveryCriteria["remote"]) ?? null,
        skills: (payload.skills as unknown as string[] | undefined) ?? (profile?.desiredSkills ?? []).slice(0, 20),
        seniority: (payload.seniority as DiscoveryCriteria["seniority"]) ?? null,
        maxAgeDays: Number(payload.maxAgeDays ?? 30),
        sources: (payload.sources as unknown as DiscoveryCriteria["sources"] | undefined) ?? ["GREENHOUSE", "LEVER", "CAREERS_PAGE"],
        limit: Number(payload.limit ?? 25),
      };
      if (!criteria.keywords.length) throw new Error("No target job titles configured");
      const report = await runJobDiscovery(task.userId, criteria);
      if (report.discovered > 0) {
        await notify({
          userId: task.userId,
          title: `${report.discovered} new opportunit${report.discovered === 1 ? "y" : "ies"}`,
          body: `Discovery found ${report.discovered} listing(s), ${report.duplicates} duplicate(s) skipped.`,
          type: "SUCCESS",
          href: "/jobs",
        });
      }
      return { ...report, listings: report.listings.length };
    }

    case "MATCH_JOB": {
      const jobId = String(payload.jobId ?? "");
      if (!jobId) throw new Error("jobId missing");
      const match = await rescoreJob(task.userId, jobId);
      return { jobId, score: match?.score ?? null };
    }

    case "DRAFT_EMAIL": {
      const applicationId = String(payload.applicationId ?? "");
      const prepared = await prepareApplication(task.userId, String(payload.jobId ?? ""), { force: Boolean(payload.force) });
      return { applicationId: prepared.application.id, status: prepared.application.status };
    }

    case "DRAFT_COVER_LETTER": {
      const applicationId = String(payload.applicationId ?? "");
      const prepared = await prepareApplication(task.userId, String(payload.jobId ?? ""), { force: true });
      return { applicationId: prepared.application.id, status: prepared.application.status };
    }

    case "PREPARE_APPLICATION": {
      const jobId = String(payload.jobId ?? "");
      if (!jobId) throw new Error("jobId missing");
      const prepared = await prepareApplication(task.userId, jobId);
      return { jobId, status: prepared.application.status, skipped: prepared.skipped };
    }

    case "SEND_APPLICATION": {
      const applicationId = String(payload.applicationId ?? "");
      if (!applicationId) throw new Error("applicationId missing");
      const outcome = await sendApplication(task.userId, applicationId, {
        connectionId: (payload.connectionId as string) ?? null,
      });
      if (outcome.status === "skipped") {
        // Idempotent no-op — do not retry forever on a legitimately skipped send.
        return { applicationId, ...outcome };
      }
      return { applicationId, ...outcome };
    }

    case "DRAFT_FOLLOW_UP": {
      const applicationId = String(payload.applicationId ?? "");
      if (!applicationId) throw new Error("applicationId missing");
      const followUp = await createFollowUpDraft(task.userId, applicationId);
      return { applicationId, followUpId: followUp.id, dueAt: followUp.dueAt };
    }

    case "SYNC_MAILBOX": {
      const results = await syncMailbox(task.userId);
      return { results };
    }

    default:
      throw new Error(`Unsupported task type: ${task.type}`);
  }
}

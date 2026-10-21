import { eq } from "drizzle-orm";

import { dbReady, getDb } from "@/lib/db";
import {
  activityEvents,
  agentRuns,
  applications,
  auditLogs,
  automationRules,
  automationSchedules,
  automationTasks,
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
  notifications,
  sessions,
  users,
} from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { listCvDocuments } from "@/lib/services/cv";
import { fail, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Full GDPR-style data export as JSON. */
export async function GET() {
  try {
    await dbReady();
    const user = await requireUser();
    const db = getDb();

    const [profile] = await db.select().from(candidateProfiles).where(eq(candidateProfiles.userId, user.id)).limit(1);
    const [documents, userCompanies, jobs, matches, apps, emails, letters, connections, tasks, runs, events, logs, followUpRows, messages, rules, schedules] =
      await Promise.all([
        listCvDocuments(user.id),
        db.select().from(companies).where(eq(companies.userId, user.id)),
        db.select().from(jobListings).where(eq(jobListings.userId, user.id)),
        db.select().from(jobMatches).where(eq(jobMatches.userId, user.id)),
        db.select().from(applications).where(eq(applications.userId, user.id)),
        db.select().from(generatedEmails).where(eq(generatedEmails.userId, user.id)),
        db.select().from(coverLetters).where(eq(coverLetters.userId, user.id)),
        db.select().from(emailConnections).where(eq(emailConnections.userId, user.id)),
        db.select().from(automationTasks).where(eq(automationTasks.userId, user.id)),
        db.select().from(agentRuns).where(eq(agentRuns.userId, user.id)),
        db.select().from(activityEvents).where(eq(activityEvents.userId, user.id)),
        db.select().from(auditLogs).where(eq(auditLogs.userId, user.id)),
        db.select().from(followUps).where(eq(followUps.userId, user.id)),
        db.select().from(emailMessages).where(eq(emailMessages.userId, user.id)),
        db.select().from(automationRules).where(eq(automationRules.userId, user.id)),
        db.select().from(automationSchedules).where(eq(automationSchedules.userId, user.id)),
      ]);

    const exportPayload = {
      exportedAt: new Date().toISOString(),
      account: { id: user.id, email: user.email, name: user.name, locale: user.locale, plan: user.plan, createdAt: user.createdAt },
      profile,
      cvDocuments: documents.map(({ rawText, ...rest }) => ({ ...rest, rawTextLength: rawText.length })),
      companies: userCompanies,
      jobs,
      matches,
      applications: apps,
      emails,
      coverLetters: letters,
      connections: connections.map(({ accessTokenEnc, refreshTokenEnc, tokenIv, tokenTag, ...rest }) => rest),
      followUps: followUpRows,
      messages,
      tasks,
      agentRuns: runs,
      activity: events,
      auditLogs: logs,
      automation: { rules, schedules },
    };

    return new Response(JSON.stringify(exportPayload, null, 2), {
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename="applypilot-export-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (error) {
    return fail(error);
  }
}

/** Permanent account deletion (cascades through every owned row). */
export async function DELETE() {
  try {
    await dbReady();
    const user = await requireUser();
    const db = getDb();

    await db.delete(sessions).where(eq(sessions.userId, user.id));
    await db.delete(users).where(eq(users.id, user.id));

    return ok({ deleted: true });
  } catch (error) {
    return fail(error);
  }
}

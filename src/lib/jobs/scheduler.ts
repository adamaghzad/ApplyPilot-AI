import { and, eq, isNotNull, isNull, lte, or } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { applications, automationSchedules, emailConnections, followUps, users } from "@/lib/db/schema";
import { notify, recordActivity } from "@/lib/audit";
import { enqueue } from "@/lib/jobs/queue";
import { getRules, numberRule } from "@/lib/services/rules";
import { addBusinessDays } from "@/lib/utils";

/**
 * Periodic maintenance executed by the worker on every tick:
 *  1. fire due automation schedules (discovery + preparation),
 *  2. release scheduled applications whose send time has arrived,
 *  3. surface due follow-up drafts for approval,
 *  4. clear mailbox rate-limit pauses after the cooldown.
 */
export async function processDueWork() {
  const now = new Date();
  await Promise.all([runDueSchedules(now), releaseScheduledApplications(now), surfaceDueFollowUps(now), clearExpiredRateLimits(now)]);
}

async function runDueSchedules(now: Date) {
  const schedules = await getDb()
    .select()
    .from(automationSchedules)
    .where(and(eq(automationSchedules.enabled, true), lte(automationSchedules.nextRunAt, now)));

  for (const schedule of schedules) {
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: schedule.timezone || "UTC" }).format(now),
    );
    const dayOfWeek = Number(
      new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: schedule.timezone || "UTC" })
        .format(now)
        .slice(0, 2),
    );

    const days = new Set(schedule.daysOfWeek ?? []);
    const isScheduledDay = days.has(new Date(now.toLocaleString("en-US", { timeZone: schedule.timezone || "UTC" })).getDay());

    if (!isScheduledDay || hour < schedule.startHour || hour >= schedule.endHour) {
      continue;
    }

    await recordActivity({
      userId: schedule.userId,
      agent: "AUTOMATION",
      message: `Scheduled run started (${schedule.mode.toLowerCase()} mode)`,
      meta: { scheduleId: schedule.id },
    });

    await enqueue({
      userId: schedule.userId,
      type: "DISCOVER_JOBS",
      payload: { maxAgeDays: 14, limit: schedule.maxPerRun * 5 },
      idempotencyKey: `discover:${schedule.userId}:${now.toISOString().slice(0, 10)}`,
      priority: 4,
    });

    await getDb()
      .update(automationSchedules)
      .set({ lastRunAt: now, nextRunAt: addBusinessDays(now, 1), updatedAt: new Date() })
      .where(eq(automationSchedules.id, schedule.id));
  }
}

async function releaseScheduledApplications(now: Date) {
  const due = await getDb()
    .select()
    .from(applications)
    .where(and(eq(applications.status, "SCHEDULED"), lte(applications.scheduledFor, now), isNull(applications.sentAt)));

  for (const application of due) {
    await enqueue({
      userId: application.userId,
      type: "SEND_APPLICATION",
      payload: { applicationId: application.id },
      idempotencyKey: `send:${application.id}`,
      priority: 1,
    });
  }
}

async function surfaceDueFollowUps(now: Date) {
  const due = await getDb()
    .select()
    .from(followUps)
    .where(and(eq(followUps.status, "DRAFT"), lte(followUps.dueAt, now)));

  for (const followUp of due) {
    await notify({
      userId: followUp.userId,
      title: "Follow-up ready",
      body: followUp.subject,
      type: "APPROVAL",
      href: `/applications?focus=${followUp.applicationId}`,
    });
    // Remind again tomorrow if it is still pending.
    await getDb()
      .update(followUps)
      .set({ dueAt: addBusinessDays(now, 1), updatedAt: new Date() })
      .where(eq(followUps.id, followUp.id));
  }
}

async function clearExpiredRateLimits(now: Date) {
  const cooldown = new Date(now.getTime() - 15 * 60_000);
  const paused = await getDb()
    .select()
    .from(emailConnections)
    .where(and(eq(emailConnections.status, "RATE_LIMITED"), lte(emailConnections.updatedAt, cooldown)));

  for (const connection of paused) {
    await getDb()
      .update(emailConnections)
      .set({ status: "CONNECTED", lastError: null, updatedAt: new Date() })
      .where(eq(emailConnections.id, connection.id));
    await recordActivity({
      userId: connection.userId,
      agent: "AUTOMATION",
      message: `${connection.provider} rate limit cleared — automation resumed`,
      type: "SUCCESS",
      meta: { connectionId: connection.id },
    });
  }
}

/** Recomputes `nextRunAt` for a schedule (used when settings change). */
export async function rescheduleAutomation(userId: string) {
  const [schedule] = await getDb().select().from(automationSchedules).where(eq(automationSchedules.userId, userId)).limit(1);
  if (!schedule) return null;
  const nextRunAt = schedule.enabled ? nextRunFor(schedule) : null;
  const [updated] = await getDb()
    .update(automationSchedules)
    .set({ nextRunAt, updatedAt: new Date() })
    .where(eq(automationSchedules.id, schedule.id))
    .returning();
  return updated ?? null;
}

function nextRunFor(schedule: typeof automationSchedules.$inferSelect): Date {
  const now = new Date();
  const candidate = new Date(now);
  candidate.setMinutes(0, 0, 0);
  const days = new Set(schedule.daysOfWeek ?? [1, 2, 3, 4, 5]);

  for (let i = 0; i < 14 * 24; i += 1) {
    candidate.setHours(candidate.getHours() + 1);
    const local = new Date(candidate.toLocaleString("en-US", { timeZone: schedule.timezone || "UTC" }));
    if (!days.has(local.getDay())) continue;
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: schedule.timezone || "UTC" }).format(candidate),
    );
    if (hour >= schedule.startHour && hour < schedule.endHour) return candidate;
  }
  const fallback = new Date(now.getTime() + 86_400_000);
  fallback.setHours(schedule.startHour, 0, 0, 0);
  return fallback;
}

/** Users with automation enabled (kept for future multi-tenant sweeps). */
export async function listAutomationUsers() {
  return getDb().select({ id: users.id }).from(users).where(or(isNotNull(users.deletedAt), isNull(users.deletedAt)));
}

export { numberRule, getRules };

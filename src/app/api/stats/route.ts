import { and, desc, eq, gte, sql } from "drizzle-orm";

import { dbReady, getDb } from "@/lib/db";
import { activityEvents, agentRuns, applications, companies, emailMessages, jobListings, notifications } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { getPipelineStats } from "@/lib/services/applications";
import { fail, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await dbReady();
    const user = await requireUser();
    const db = getDb();

    const [pipeline, counts] = await Promise.all([
      getPipelineStats(user.id),
      Promise.all([
        db.select({ value: sql<number>`count(*)` }).from(companies).where(eq(companies.userId, user.id)),
        db.select({ value: sql<number>`count(*)` }).from(jobListings).where(eq(jobListings.userId, user.id)),
        db.select({ value: sql<number>`count(*)` }).from(jobListings).where(and(eq(jobListings.userId, user.id), gte(jobListings.discoveredAt, new Date(Date.now() - 7 * 86_400_000)))),
        db.select({ value: sql<number>`count(*)` }).from(emailMessages).where(and(eq(emailMessages.userId, user.id), eq(emailMessages.direction, "INBOUND"))),
      ]),
    ]);

    // Applications over the last 14 days
    const series = await db
      .select({ day: sql<string>`to_char(${applications.sentAt}, 'YYYY-MM-DD')`, sent: sql<number>`count(*)` })
      .from(applications)
      .where(and(eq(applications.userId, user.id), gte(applications.sentAt, new Date(Date.now() - 14 * 86_400_000))))
      .groupBy(sql`to_char(${applications.sentAt}, 'YYYY-MM-DD')`);

    const sparkline = Array.from({ length: 14 }, (_, index) => {
      const date = new Date(Date.now() - (13 - index) * 86_400_000);
      const key = date.toISOString().slice(0, 10);
      const found = series.find((row) => row.day === key);
      return { date: key, label: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date), sent: Number(found?.sent ?? 0) };
    });

    const statusRows = await db
      .select({ status: applications.status, value: sql<number>`count(*)` })
      .from(applications)
      .where(eq(applications.userId, user.id))
      .groupBy(applications.status);

    const [activity, agentActivity] = await Promise.all([
      db.select().from(activityEvents).where(eq(activityEvents.userId, user.id)).orderBy(desc(activityEvents.createdAt)).limit(12),
      db.select({ agent: agentRuns.agent, value: sql<number>`count(*)` }).from(agentRuns).where(eq(agentRuns.userId, user.id)).groupBy(agentRuns.agent),
    ]);

    const unread = await db.select({ value: sql<number>`count(*)` }).from(notifications).where(and(eq(notifications.userId, user.id), sql`${notifications.readAt} is null`));

    return ok({
      pipeline,
      companiesResearched: Number(counts[0][0]?.value ?? 0),
      companiesReady: 0,
      opportunities: Number(counts[1][0]?.value ?? 0),
      newThisWeek: Number(counts[2][0]?.value ?? 0),
      inboundMessages: Number(counts[3][0]?.value ?? 0),
      sparkline,
      statusDistribution: statusRows.map((row) => ({ status: row.status, count: Number(row.value) })),
      agentActivity: agentActivity.map((row) => ({ agent: row.agent, runs: Number(row.value) })),
      activity,
      unreadNotifications: Number(unread[0]?.value ?? 0),
    });
  } catch (error) {
    return fail(error);
  }
}

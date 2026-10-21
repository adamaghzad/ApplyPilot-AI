import { desc, eq } from "drizzle-orm";

import { dbReady, getDb } from "@/lib/db";
import { activityEvents, agentRuns } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { AGENTS } from "@/lib/enums";
import { aiConfigured } from "@/lib/env";
import { fail, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await dbReady();
    const user = await requireUser();
    const db = getDb();

    // Latest run per agent + recent run history.
    const runs = await db.select().from(agentRuns).where(eq(agentRuns.userId, user.id)).orderBy(desc(agentRuns.startedAt)).limit(60);

    const latestByAgent = new Map<string, (typeof runs)[number]>();
    for (const run of runs) if (!latestByAgent.has(run.agent)) latestByAgent.set(run.agent, run);

    const activity = await db.select().from(activityEvents).where(eq(activityEvents.userId, user.id)).orderBy(desc(activityEvents.createdAt)).limit(40);

    return ok({
      engine: aiConfigured ? "openai" : "local-deterministic",
      agents: AGENTS.map((agent) => ({
        ...agent,
        run: latestByAgent.get(agent.name) ?? null,
      })),
      runs: runs.slice(0, 20),
      activity,
    });
  } catch (error) {
    return fail(error);
  }
}

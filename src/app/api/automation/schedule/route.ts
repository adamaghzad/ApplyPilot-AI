import { eq } from "drizzle-orm";

import { dbReady, getDb } from "@/lib/db";
import { automationSchedules } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { scheduleSchema } from "@/lib/validation";
import { rescheduleAutomation } from "@/lib/jobs/scheduler";
import { recordActivity } from "@/lib/audit";
import { fail, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await dbReady();
    const user = await requireUser();
    const [schedule] = await getDb().select().from(automationSchedules).where(eq(automationSchedules.userId, user.id)).limit(1);
    return ok({ schedule: schedule ?? null });
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(req: Request) {
  try {
    await dbReady();
    const user = await requireUser();
    const input = scheduleSchema.parse(await req.json());
    const db = getDb();

    const [existing] = await db.select().from(automationSchedules).where(eq(automationSchedules.userId, user.id)).limit(1);

    let schedule;
    if (existing) {
      [schedule] = await db
        .update(automationSchedules)
        .set({ ...input, name: input.name ?? existing.name, updatedAt: new Date() })
        .where(eq(automationSchedules.id, existing.id))
        .returning();
    } else {
      [schedule] = await db.insert(automationSchedules).values({ userId: user.id, ...input }).returning();
    }

    const updated = await rescheduleAutomation(user.id);

    await recordActivity({
      userId: user.id,
      agent: "AUTOMATION",
      message: input.enabled
        ? `Schedule enabled — ${input.startHour}:00–${input.endHour}:00 (${input.timezone}), max ${input.maxPerRun} per run`
        : "Schedule paused",
      type: "INFO",
    });

    return ok({ schedule: updated ?? schedule });
  } catch (error) {
    return fail(error);
  }
}

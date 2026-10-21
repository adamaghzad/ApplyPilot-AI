import { eq } from "drizzle-orm";

import { dbReady, getDb } from "@/lib/db";
import { candidateProfiles, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { preferencesSchema } from "@/lib/validation";
import { computeCompleteness } from "@/lib/services/cv";
import { recordActivity } from "@/lib/audit";
import { fail, ok } from "@/lib/api";

export async function PUT(req: Request) {
  try {
    await dbReady();
    const user = await requireUser();
    const input = preferencesSchema.parse(await req.json());
    const db = getDb();

    const [existing] = await db.select().from(candidateProfiles).where(eq(candidateProfiles.userId, user.id)).limit(1);
    const values = { ...input, updatedAt: new Date() };

    let profile;
    if (existing) {
      [profile] = await db.update(candidateProfiles).set({ ...values, completeness: computeCompleteness({ ...existing, ...values }) }).where(eq(candidateProfiles.userId, user.id)).returning();
    } else {
      [profile] = await db.insert(candidateProfiles).values({ userId: user.id, ...values, completeness: computeCompleteness(values) }).returning();
    }

    if (input.timezone) {
      await db.update(users).set({ timezone: input.timezone, updatedAt: new Date() }).where(eq(users.id, user.id));
    }

    await recordActivity({ userId: user.id, agent: "MATCHING", message: "Job preferences updated — compatibility scores will be recalculated", type: "INFO" });
    return ok({ profile });
  } catch (error) {
    return fail(error);
  }
}

import { eq } from "drizzle-orm";

import { dbReady, getDb } from "@/lib/db";
import { candidateProfiles } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { automationPrefsSchema } from "@/lib/validation";
import { recordActivity } from "@/lib/audit";
import { fail, ok } from "@/lib/api";

export async function PUT(req: Request) {
  try {
    await dbReady();
    const user = await requireUser();
    const input = automationPrefsSchema.parse(await req.json());
    const db = getDb();

    const [existing] = await db.select().from(candidateProfiles).where(eq(candidateProfiles.userId, user.id)).limit(1);
    let profile;
    if (existing) {
      [profile] = await db.update(candidateProfiles).set({ ...input, updatedAt: new Date() }).where(eq(candidateProfiles.userId, user.id)).returning();
    } else {
      [profile] = await db.insert(candidateProfiles).values({ userId: user.id, ...input }).returning();
    }

    await recordActivity({
      userId: user.id,
      agent: "AUTOMATION",
      message: `Automation mode set to ${input.automationMode.toLowerCase()} — daily limit ${input.dailyApplicationLimit}`,
      type: "INFO",
    });

    return ok({ profile });
  } catch (error) {
    return fail(error);
  }
}

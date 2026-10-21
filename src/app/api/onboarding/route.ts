import { eq } from "drizzle-orm";

import { dbReady, getDb } from "@/lib/db";
import { candidateProfiles, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { onboardingCompleteSchema, preferencesSchema, automationPrefsSchema, profileBasicsSchema } from "@/lib/validation";
import { computeCompleteness } from "@/lib/services/cv";
import { recordActivity } from "@/lib/audit";
import { fail, ok } from "@/lib/api";

export async function POST(req: Request) {
  try {
    await dbReady();
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const db = getDb();

    if (body.step !== undefined) {
      onboardingCompleteSchema.parse({ step: body.step });
    }

    if (body.profile) {
      const patch = profileBasicsSchema.parse(body.profile);
      await db
        .update(candidateProfiles)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(candidateProfiles.userId, user.id));
    }

    if (body.preferences) {
      const prefs = preferencesSchema.parse(body.preferences);
      const [current] = await db.select().from(candidateProfiles).where(eq(candidateProfiles.userId, user.id)).limit(1);
      const values = { ...prefs, updatedAt: new Date(), completeness: computeCompleteness({ ...current, ...prefs }) };
      await db.update(candidateProfiles).set(values).where(eq(candidateProfiles.userId, user.id));
      if (prefs.timezone) {
        await db.update(users).set({ timezone: prefs.timezone, updatedAt: new Date() }).where(eq(users.id, user.id));
      }
    }

    if (body.automation) {
      const automation = automationPrefsSchema.parse(body.automation);
      await db.update(candidateProfiles).set({ ...automation, updatedAt: new Date() }).where(eq(candidateProfiles.userId, user.id));
    }

    if (body.complete) {
      await db.update(users).set({ onboardingCompleted: true, onboardingStep: 6, updatedAt: new Date() }).where(eq(users.id, user.id));
      await recordActivity({
        userId: user.id,
        agent: "AUTOMATION",
        message: "Onboarding complete — agents are ready. Add companies to start discovery.",
        type: "SUCCESS",
      });
    } else if (body.step !== undefined) {
      await db.update(users).set({ onboardingStep: body.step, updatedAt: new Date() }).where(eq(users.id, user.id));
    }

    const [profile] = await db.select().from(candidateProfiles).where(eq(candidateProfiles.userId, user.id)).limit(1);
    const [refreshed] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);

    return ok({ step: refreshed.onboardingStep, onboardingCompleted: refreshed.onboardingCompleted, profile });
  } catch (error) {
    return fail(error);
  }
}

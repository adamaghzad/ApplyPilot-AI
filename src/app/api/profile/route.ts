import { eq } from "drizzle-orm";

import { dbReady, getDb } from "@/lib/db";
import { candidateProfiles, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { profileBasicsSchema } from "@/lib/validation";
import { fail, ok } from "@/lib/api";
import { computeCompleteness } from "@/lib/services/cv";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await dbReady();
    const user = await requireUser();
    const db = getDb();
    const [profile] = await db.select().from(candidateProfiles).where(eq(candidateProfiles.userId, user.id)).limit(1);
    return ok({ user: { id: user.id, email: user.email, name: user.name, locale: user.locale, timezone: user.timezone, plan: user.plan }, profile: profile ?? null });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(req: Request) {
  try {
    await dbReady();
    const user = await requireUser();
    const patch = profileBasicsSchema.parse(await req.json());
    const db = getDb();

    const [existing] = await db.select().from(candidateProfiles).where(eq(candidateProfiles.userId, user.id)).limit(1);

    const values = {
      ...patch,
      linkedinUrl: patch.linkedinUrl || null,
      githubUrl: patch.githubUrl || null,
      portfolioUrl: patch.portfolioUrl || null,
      updatedAt: new Date(),
    };

    let profile;
    if (existing) {
      [profile] = await db.update(candidateProfiles).set({ ...values, completeness: computeCompleteness({ ...existing, ...values }) }).where(eq(candidateProfiles.userId, user.id)).returning();
    } else {
      [profile] = await db.insert(candidateProfiles).values({ userId: user.id, ...values }).returning();
    }

    if (patch.fullName || patch.headline) {
      await db.update(users).set({ name: patch.fullName ?? user.name, updatedAt: new Date() }).where(eq(users.id, user.id));
    }

    return ok({ profile });
  } catch (error) {
    return fail(error);
  }
}

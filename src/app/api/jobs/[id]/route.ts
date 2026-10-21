import { and, eq } from "drizzle-orm";

import { dbReady, getDb } from "@/lib/db";
import { applications, jobListings } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { rescoreJob } from "@/lib/services/discovery";
import { fail, ok } from "@/lib/api";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await dbReady();
    const user = await requireUser();
    const { id } = await ctx.params;
    const db = getDb();

    const [row] = await db
      .select()
      .from(jobListings)
      .where(and(eq(jobListings.id, id), eq(jobListings.userId, user.id)))
      .limit(1);
    if (!row) return fail(new (await import("@/lib/api")).ApiError("Job not found", 404));

    const [application] = await db.select().from(applications).where(and(eq(applications.jobId, id), eq(applications.userId, user.id))).limit(1);
    const match = await rescoreJob(user.id, id);

    return ok({ job: row, application: application ?? null, match: match ?? null });
  } catch (error) {
    return fail(error);
  }
}

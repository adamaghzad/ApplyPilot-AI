import { desc, eq } from "drizzle-orm";

import { dbReady, getDb } from "@/lib/db";
import { activityEvents } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { fail, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await dbReady();
    const user = await requireUser();
    const limit = Math.min(200, Number(new URL(req.url).searchParams.get("limit") ?? 60));
    const events = await getDb()
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.userId, user.id))
      .orderBy(desc(activityEvents.createdAt))
      .limit(limit);
    return ok({ events });
  } catch (error) {
    return fail(error);
  }
}

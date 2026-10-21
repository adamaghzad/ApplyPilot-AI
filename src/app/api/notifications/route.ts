import { desc, eq } from "drizzle-orm";

import { dbReady, getDb } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { fail, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await dbReady();
    const user = await requireUser();
    const rows = await getDb().select().from(notifications).where(eq(notifications.userId, user.id)).orderBy(desc(notifications.createdAt)).limit(30);
    return ok({ notifications: rows });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    await dbReady();
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as { id?: string; all?: boolean };
    const db = getDb();

    if (body.all || !body.id) {
      await db.update(notifications).set({ readAt: new Date() }).where(eq(notifications.userId, user.id));
    } else {
      await db.update(notifications).set({ readAt: new Date() }).where(eq(notifications.id, body.id));
    }
    return ok({ success: true });
  } catch (error) {
    return fail(error);
  }
}

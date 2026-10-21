import { and, eq } from "drizzle-orm";

import { dbReady, getDb } from "@/lib/db";
import { automationTasks } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { fail, ok } from "@/lib/api";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await dbReady();
    const user = await requireUser();
    const { id } = await ctx.params;
    const [task] = await getDb()
      .update(automationTasks)
      .set({ status: "CANCELLED", finishedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(automationTasks.id, id), eq(automationTasks.userId, user.id), eq(automationTasks.status, "PENDING")))
      .returning();
    return ok({ task: task ?? null });
  } catch (error) {
    return fail(error);
  }
}

import { desc, eq } from "drizzle-orm";

import { dbReady, getDb } from "@/lib/db";
import { automationTasks } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { taskCreateSchema } from "@/lib/validation";
import { enqueue } from "@/lib/jobs/queue";
import { fail, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await dbReady();
    const user = await requireUser();
    const tasks = await getDb()
      .select()
      .from(automationTasks)
      .where(eq(automationTasks.userId, user.id))
      .orderBy(desc(automationTasks.createdAt))
      .limit(50);
    const pending = tasks.filter((task) => task.status === "PENDING").length;
    const running = tasks.filter((task) => task.status === "RUNNING").length;
    const failed = tasks.filter((task) => task.status === "FAILED").length;
    return ok({ tasks, summary: { pending, running, failed } });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    await dbReady();
    const user = await requireUser();
    const input = taskCreateSchema.parse(await req.json());
    const task = await enqueue({
      userId: user.id,
      type: input.type,
      payload: input.payload,
      runAfter: input.runAfter ? new Date(input.runAfter) : undefined,
      priority: input.priority,
    });
    return ok({ task }, 201);
  } catch (error) {
    return fail(error);
  }
}

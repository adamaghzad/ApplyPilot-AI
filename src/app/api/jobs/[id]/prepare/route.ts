import { dbReady } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { prepareApplication } from "@/lib/services/applications";
import { enqueue } from "@/lib/jobs/queue";
import { fail, ok } from "@/lib/api";

/** Runs the full prepare pipeline (research → match → email → cover letter). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await dbReady();
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));

    if (body.background === true) {
      const task = await enqueue({
        userId: user.id,
        type: "PREPARE_APPLICATION",
        payload: { jobId: id },
        idempotencyKey: `prepare:${user.id}:${id}:${Date.now()}`,
        priority: 3,
      });
      return ok({ queued: true, task });
    }

    const result = await prepareApplication(user.id, id, { force: body.force === true });
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}

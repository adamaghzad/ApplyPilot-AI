import { dbReady } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { sendApplication } from "@/lib/services/applications";
import { enqueue } from "@/lib/jobs/queue";
import { fail, ok } from "@/lib/api";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await dbReady();
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { connectionId?: string; background?: boolean };

    if (body.background) {
      const task = await enqueue({
        userId: user.id,
        type: "SEND_APPLICATION",
        payload: { applicationId: id, connectionId: body.connectionId ?? null },
        idempotencyKey: `send:${id}`,
        priority: 1,
      });
      return ok({ queued: true, task });
    }

    const outcome = await sendApplication(user.id, id, { connectionId: body.connectionId ?? null });
    return ok(outcome);
  } catch (error) {
    return fail(error);
  }
}

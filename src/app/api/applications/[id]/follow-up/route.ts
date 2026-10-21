import { dbReady } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { createFollowUpDraft } from "@/lib/services/applications";
import { followUpSchema } from "@/lib/validation";
import { enqueue } from "@/lib/jobs/queue";
import { fail, ok } from "@/lib/api";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await dbReady();
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = followUpSchema.parse({ applicationId: id, ...(await req.json().catch(() => ({}))) });

    const followUp = await createFollowUpDraft(user.id, body.applicationId);
    return ok({ followUp }, 201);
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await dbReady();
    const user = await requireUser();
    const { id } = await ctx.params;
    const task = await enqueue({
      userId: user.id,
      type: "DRAFT_FOLLOW_UP",
      payload: { applicationId: id },
      idempotencyKey: `followup:${user.id}:${id}:${Date.now()}`,
      priority: 4,
    });
    return ok({ queued: true, task });
  } catch (error) {
    return fail(error);
  }
}

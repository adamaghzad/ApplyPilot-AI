import { dbReady } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { getApplicationDetail, updateApplication } from "@/lib/services/applications";
import { applicationUpdateSchema } from "@/lib/validation";
import { fail, ok } from "@/lib/api";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await dbReady();
    const user = await requireUser();
    const { id } = await ctx.params;
    const detail = await getApplicationDetail(user.id, id);
    return ok(detail);
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await dbReady();
    const user = await requireUser();
    const { id } = await ctx.params;
    const patch = applicationUpdateSchema.parse(await req.json());

    const application = await updateApplication(user.id, id, {
      ...(patch.status ? ({ status: patch.status } as never) : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
      ...(patch.boardOrder !== undefined ? { boardOrder: patch.boardOrder } : {}),
      ...(patch.recipientEmail !== undefined ? { recipientEmail: patch.recipientEmail } : {}),
      ...(patch.scheduledFor !== undefined
        ? ({ scheduledFor: patch.scheduledFor ? new Date(patch.scheduledFor) : null } as never)
        : {}),
      ...(patch.interviewAt !== undefined
        ? ({ interviewAt: patch.interviewAt ? new Date(patch.interviewAt) : null } as never)
        : {}),
    });

    return ok({ application });
  } catch (error) {
    return fail(error);
  }
}

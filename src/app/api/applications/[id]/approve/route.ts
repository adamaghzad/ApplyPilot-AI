import { dbReady } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { approveApplication } from "@/lib/services/applications";
import { fail, ok } from "@/lib/api";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await dbReady();
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { scheduleAt?: string | null; connectionId?: string };

    const application = await approveApplication(user.id, id, {
      scheduleAt: body.scheduleAt ? new Date(body.scheduleAt) : null,
      connectionId: body.connectionId,
    });
    return ok({ application });
  } catch (error) {
    return fail(error);
  }
}

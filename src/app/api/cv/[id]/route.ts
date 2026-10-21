import { dbReady } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { deleteCv } from "@/lib/services/cv";
import { fail, ok } from "@/lib/api";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await dbReady();
    const user = await requireUser();
    const { id } = await ctx.params;
    await deleteCv(user.id, id);
    return ok({ success: true });
  } catch (error) {
    return fail(error);
  }
}

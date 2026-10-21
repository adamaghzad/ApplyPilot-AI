import { dbReady } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { disconnectConnection } from "@/lib/services/connections";
import { fail, ok } from "@/lib/api";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await dbReady();
    const user = await requireUser();
    const { id } = await ctx.params;
    const connection = await disconnectConnection(user.id, id);
    return ok({ connection });
  } catch (error) {
    return fail(error);
  }
}

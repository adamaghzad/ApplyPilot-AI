import { dbReady } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { setPrimaryCv } from "@/lib/services/cv";
import { fail, ok } from "@/lib/api";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await dbReady();
    const user = await requireUser();
    const { id } = await ctx.params;
    const document = await setPrimaryCv(user.id, id);
    return ok({ document });
  } catch (error) {
    return fail(error);
  }
}

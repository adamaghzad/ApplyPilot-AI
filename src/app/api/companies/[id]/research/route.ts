import { dbReady } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { runCompanyResearch } from "@/lib/services/companies";
import { researchCompanySchema } from "@/lib/validation";
import { enqueue } from "@/lib/jobs/queue";
import { fail, ok } from "@/lib/api";

/**
 * Runs the Research Agent synchronously (default) or queues it as a background task.
 * Synchronous mode is used by the UI so results appear immediately.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await dbReady();
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const { deep } = researchCompanySchema.parse({ companyId: id, deep: body.deep ?? true });
    const background = body.background === true;

    if (background) {
      const task = await enqueue({
        userId: user.id,
        type: "RESEARCH_COMPANY",
        payload: { companyId: id },
        idempotencyKey: `research:${user.id}:${id}:${Date.now()}`,
        priority: 3,
      });
      return ok({ queued: true, task });
    }

    const result = await runCompanyResearch(user.id, id, { deep });
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}

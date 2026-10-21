import { dbReady } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { ensureApplication, listApplications } from "@/lib/services/applications";
import { fail, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await dbReady();
    const user = await requireUser();
    const url = new URL(req.url);
    const status = url.searchParams.get("status")?.split(",").filter(Boolean) as never[] | undefined;
    const search = url.searchParams.get("search") ?? undefined;

    const rows = await listApplications(user.id, { status: status && status.length ? status : undefined, search });
    return ok({ applications: rows });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    await dbReady();
    const user = await requireUser();
    const body = (await req.json()) as { jobId?: string };
    if (!body.jobId) return fail(new (await import("@/lib/api")).ApiError("jobId is required", 400));
    const application = await ensureApplication(user.id, body.jobId);
    return ok({ application }, 201);
  } catch (error) {
    return fail(error);
  }
}

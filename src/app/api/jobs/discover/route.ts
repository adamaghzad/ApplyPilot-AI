import { dbReady } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { runJobDiscovery } from "@/lib/services/discovery";
import { jobSearchSchema } from "@/lib/validation";
import { enqueue } from "@/lib/jobs/queue";
import { consume, rateLimitHeaders } from "@/lib/rate-limit";
import { fail, ok } from "@/lib/api";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    await dbReady();
    const user = await requireUser();

    const limit = consume(`discover:${user.id}`, 12, 3600);
    if (!limit.allowed) {
      return NextResponse.json(
        { ok: false, error: "Discovery rate limit reached — try again in a few minutes." },
        { status: 429, headers: rateLimitHeaders(limit) },
      );
    }

    const raw = await req.json().catch(() => ({}));
    const input = jobSearchSchema.parse(raw);
    const background = (raw as { background?: boolean }).background === true;

    if (background) {
      const task = await enqueue({
        userId: user.id,
        type: "DISCOVER_JOBS",
        payload: input,
        idempotencyKey: `discover:${user.id}:${Date.now()}`,
        priority: 3,
      });
      return ok({ queued: true, task });
    }

    const report = await runJobDiscovery(user.id, input);
    return ok(report);
  } catch (error) {
    return fail(error);
  }
}

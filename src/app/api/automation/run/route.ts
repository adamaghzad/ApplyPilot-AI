import { dbReady } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { enqueue } from "@/lib/jobs/queue";
import { recordActivity } from "@/lib/audit";
import { consume, rateLimitHeaders } from "@/lib/rate-limit";
import { fail, ok } from "@/lib/api";
import { NextResponse } from "next/server";

/** Triggers an immediate automation cycle (discovery → preparation). */
export async function POST(req: Request) {
  try {
    await dbReady();
    const user = await requireUser();

    const limit = consume(`run:${user.id}`, 6, 600);
    if (!limit.allowed) {
      return NextResponse.json({ ok: false, error: "Too many runs — wait a few minutes." }, { status: 429, headers: rateLimitHeaders(limit) });
    }

    const body = (await req.json().catch(() => ({}))) as { keywords?: string[]; locations?: string[]; maxAgeDays?: number; limit?: number };

    const task = await enqueue({
      userId: user.id,
      type: "DISCOVER_JOBS",
      payload: {
        keywords: body.keywords ?? [],
        locations: body.locations ?? [],
        maxAgeDays: body.maxAgeDays ?? 30,
        limit: body.limit ?? 25,
        sources: ["GREENHOUSE", "LEVER", "CAREERS_PAGE", "WTTJ"],
        skills: [],
      },
      idempotencyKey: `discover:${user.id}:manual:${Date.now()}`,
      priority: 2,
    });

    const sync = await enqueue({
      userId: user.id,
      type: "SYNC_MAILBOX",
      payload: {},
      idempotencyKey: `sync:${user.id}:manual:${Date.now()}`,
      priority: 6,
    });

    await recordActivity({ userId: user.id, agent: "AUTOMATION", message: "Manual automation cycle started", type: "INFO" });

    return ok({ queued: true, tasks: [task, sync].filter(Boolean) });
  } catch (error) {
    return fail(error);
  }
}

import { dbReady } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { syncMailbox } from "@/lib/services/applications";
import { consume, rateLimitHeaders } from "@/lib/rate-limit";
import { fail, ok } from "@/lib/api";
import { NextResponse } from "next/server";

/** Read-only mailbox sync that detects recruiter replies. */
export async function POST(req: Request) {
  try {
    await dbReady();
    const user = await requireUser();

    const limit = consume(`sync:${user.id}`, 20, 3600);
    if (!limit.allowed) {
      return NextResponse.json({ ok: false, error: "Mailbox sync rate limit reached." }, { status: 429, headers: rateLimitHeaders(limit) });
    }

    const results = await syncMailbox(user.id);
    return ok({ results });
  } catch (error) {
    return fail(error);
  }
}

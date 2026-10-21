import { dbReady } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { clearDemoData, seedDemoData } from "@/lib/services/demo";
import { consume, rateLimitHeaders } from "@/lib/rate-limit";
import { fail, ok } from "@/lib/api";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await dbReady();
    const user = await requireUser();

    const limit = consume(`demo:${user.id}`, 5, 3600);
    if (!limit.allowed) {
      return NextResponse.json({ ok: false, error: "Demo seeding rate limit reached." }, { status: 429, headers: rateLimitHeaders(limit) });
    }

    const summary = await seedDemoData(user.id);
    return ok(summary);
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE() {
  try {
    await dbReady();
    const user = await requireUser();
    const result = await clearDemoData(user.id);
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}

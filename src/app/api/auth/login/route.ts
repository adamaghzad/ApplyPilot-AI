import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { dbReady, getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/crypto";
import { createSession } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { consume, rateLimitHeaders } from "@/lib/rate-limit";
import { signInSchema } from "@/lib/validation";
import { ApiError, fail, ok } from "@/lib/api";

export async function POST(req: Request) {
  try {
    await dbReady();
    const body = signInSchema.parse(await req.json());

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const limit = consume(`login:${ip}:${body.email}`, 10, 900);
    if (!limit.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many attempts. Please wait a few minutes." },
        { status: 429, headers: rateLimitHeaders(limit) },
      );
    }

    const [user] = await getDb().select().from(users).where(eq(users.email, body.email)).limit(1);
    if (!user || !verifyPassword(body.password, user.passwordHash)) {
      throw new ApiError("Incorrect email or password", 401);
    }

    await createSession(user.id, { ip, userAgent: req.headers.get("user-agent") ?? undefined });
    await recordAudit({ userId: user.id, action: "auth.login", entity: "user", entityId: user.id, ip });

    return ok({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        onboardingCompleted: user.onboardingCompleted,
        onboardingStep: user.onboardingStep,
      },
    });
  } catch (error) {
    return fail(error);
  }
}

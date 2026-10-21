import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { dbReady, getDb } from "@/lib/db";
import { candidateProfiles, sessions, users } from "@/lib/db/schema";
import { hashPassword } from "@/lib/crypto";
import { createSession } from "@/lib/auth/session";
import { recordActivity, recordAudit } from "@/lib/audit";
import { consume, rateLimitHeaders } from "@/lib/rate-limit";
import { signUpSchema } from "@/lib/validation";
import { fail, ok } from "@/lib/api";

export async function POST(req: Request) {
  try {
    await dbReady();
    const body = signUpSchema.parse(await req.json());

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const limit = consume(`signup:${ip}`, 5, 3600);
    if (!limit.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many sign-up attempts. Try again later." },
        { status: 429, headers: rateLimitHeaders(limit) },
      );
    }

    const db = getDb();
    const [existing] = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
    if (existing) return fail(new (await import("@/lib/api")).ApiError("An account with this email already exists", 409));

    const [user] = await db
      .insert(users)
      .values({ email: body.email, name: body.name, passwordHash: hashPassword(body.password), locale: body.locale })
      .returning();

    await db.insert(candidateProfiles).values({
      userId: user.id,
      fullName: user.name,
      email: user.email,
      preferredLanguage: body.locale,
    });

    const { seedDefaultsForUser } = await import("@/lib/services/defaults");
    await seedDefaultsForUser(user.id);

    await createSession(user.id, { ip, userAgent: req.headers.get("user-agent") ?? undefined });
    await recordAudit({ userId: user.id, action: "auth.signup", entity: "user", entityId: user.id, ip });
    await recordActivity({ userId: user.id, agent: "AUTOMATION", message: "Welcome aboard — complete onboarding to activate your agents", type: "INFO" });

    return ok({ user: { id: user.id, email: user.email, name: user.name } }, 201);
  } catch (error) {
    return fail(error);
  }
}

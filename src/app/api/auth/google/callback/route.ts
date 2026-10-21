import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { dbReady, getDb } from "@/lib/db";
import { candidateProfiles, users } from "@/lib/db/schema";
import { createSession } from "@/lib/auth/session";
import { baseUrlFromRequest, decodeState } from "@/lib/auth/oauth";
import { exchangeGmailCode, gmailProfile } from "@/lib/integrations/gmail";
import { recordActivity, recordAudit } from "@/lib/audit";

export async function GET(req: Request) {
  const base = baseUrlFromRequest(req);
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error || !code || !decodeState(stateParam)) {
    return NextResponse.redirect(`${base}/login?error=google-auth-failed`);
  }

  try {
    await dbReady();
    const { access_token, refresh_token, expires_in } = await exchangeGmailCode(code, `${base}/api/auth/google/callback`);
    const profile = await gmailProfile(access_token);

    const db = getDb();
    let [user] = await db.select().from(users).where(eq(users.email, profile.email.toLowerCase())).limit(1);

    if (!user) {
      [user] = await db
        .insert(users)
        .values({ email: profile.email.toLowerCase(), name: profile.name ?? profile.email.split("@")[0], emailVerified: new Date() })
        .returning();
      await db.insert(candidateProfiles).values({ userId: user.id, fullName: user.name, email: user.email });
      const { seedDefaultsForUser } = await import("@/lib/services/defaults");
      await seedDefaultsForUser(user.id);
      await recordActivity({ userId: user.id, agent: "AUTOMATION", message: "Account created with Google — complete onboarding to activate your agents" });
    } else if (!user.emailVerified) {
      await db.update(users).set({ emailVerified: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id));
    }

    // A refresh token from the sign-in flow lets us offer a one-click mailbox connection later.
    if (refresh_token) {
      await db.update(users).set({ updatedAt: new Date() }).where(eq(users.id, user.id));
    }

    await createSession(user.id, { userAgent: req.headers.get("user-agent") ?? undefined });
    await recordAudit({ userId: user.id, action: "auth.login.google", entity: "user", entityId: user.id });

    return NextResponse.redirect(user.onboardingCompleted ? `${base}/dashboard` : `${base}/onboarding`);
  } catch (error) {
    console.error("[google callback]", error);
    return NextResponse.redirect(`${base}/login?error=google-auth-failed`);
  }
}


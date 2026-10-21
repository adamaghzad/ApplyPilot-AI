import { NextResponse } from "next/server";

import { dbReady } from "@/lib/db";
import { decodeState, baseUrlFromRequest } from "@/lib/auth/oauth";
import { exchangeGmailCode, gmailProfile, GMAIL_SCOPES } from "@/lib/integrations/gmail";
import { saveConnection } from "@/lib/services/connections";
import { fail } from "@/lib/api";

export async function GET(req: Request) {
  const base = baseUrlFromRequest(req);
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = decodeState(url.searchParams.get("state"));

  if (!code || !state || state.purpose !== "connect" || !state.userId) {
    return NextResponse.redirect(`${base}/settings?tab=integrations&error=oauth-invalid-state`);
  }

  try {
    await dbReady();
    const tokens = await exchangeGmailCode(code, `${base}/api/integrations/google/callback`);
    const profile = await gmailProfile(tokens.access_token);

    await saveConnection(state.userId, {
      provider: "GMAIL",
      emailAddress: profile.email,
      displayName: profile.name ?? null,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiresIn: tokens.expires_in ?? null,
      scopes: (tokens.scope ?? GMAIL_SCOPES.join(" ")).split(" "),
    });

    return NextResponse.redirect(`${base}/settings?tab=integrations&connected=gmail`);
  } catch (error) {
    console.error("[gmail callback]", error);
    return fail(error);
  }
}

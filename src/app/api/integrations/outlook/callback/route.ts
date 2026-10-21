import { NextResponse } from "next/server";

import { dbReady } from "@/lib/db";
import { baseUrlFromRequest, decodeState } from "@/lib/auth/oauth";
import { exchangeOutlookCode, outlookProfile, OUTLOOK_SCOPES } from "@/lib/integrations/outlook";
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
    const tokens = await exchangeOutlookCode(code, `${base}/api/integrations/outlook/callback`);
    const profile = await outlookProfile(tokens.access_token);

    await saveConnection(state.userId, {
      provider: "OUTLOOK",
      emailAddress: profile.email,
      displayName: profile.name ?? null,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiresIn: tokens.expires_in ?? null,
      scopes: (tokens.scope ?? OUTLOOK_SCOPES.join(" ")).split(" "),
    });

    return NextResponse.redirect(`${base}/settings?tab=integrations&connected=outlook`);
  } catch (error) {
    console.error("[outlook callback]", error);
    return fail(error);
  }
}

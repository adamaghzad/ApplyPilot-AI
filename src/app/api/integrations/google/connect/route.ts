import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { gmailAuthorizeUrl } from "@/lib/integrations/gmail";
import { baseUrlFromRequest, encodeState } from "@/lib/auth/oauth";
import { gmailConfigured } from "@/lib/env";
import { fail } from "@/lib/api";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const base = baseUrlFromRequest(req);

    if (!gmailConfigured) {
      return NextResponse.redirect(`${base}/settings?tab=integrations&error=google-not-configured`);
    }

    const state = encodeState({ purpose: "connect", provider: "google", userId: user.id, nonce: crypto.randomUUID() });
    return NextResponse.redirect(gmailAuthorizeUrl({ redirectUri: `${base}/api/integrations/google/callback`, state }));
  } catch (error) {
    return fail(error);
  }
}

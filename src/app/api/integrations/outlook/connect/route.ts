import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { outlookAuthorizeUrl } from "@/lib/integrations/outlook";
import { baseUrlFromRequest, encodeState } from "@/lib/auth/oauth";
import { outlookConfigured } from "@/lib/env";
import { fail } from "@/lib/api";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const base = baseUrlFromRequest(req);

    if (!outlookConfigured) {
      return NextResponse.redirect(`${base}/settings?tab=integrations&error=outlook-not-configured`);
    }

    const state = encodeState({ purpose: "connect", provider: "microsoft", userId: user.id, nonce: crypto.randomUUID() });
    return NextResponse.redirect(outlookAuthorizeUrl({ redirectUri: `${base}/api/integrations/outlook/callback`, state }));
  } catch (error) {
    return fail(error);
  }
}

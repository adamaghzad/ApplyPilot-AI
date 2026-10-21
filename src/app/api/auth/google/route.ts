import { NextResponse } from "next/server";

import { gmailAuthorizeUrl, GMAIL_SCOPES } from "@/lib/integrations/gmail";
import { baseUrlFromRequest, encodeState } from "@/lib/auth/oauth";
import { gmailConfigured } from "@/lib/env";

export async function GET(req: Request) {
  if (!gmailConfigured) {
    const base = baseUrlFromRequest(req);
    return NextResponse.redirect(`${base}/login?error=google-not-configured`);
  }

  const base = baseUrlFromRequest(req);
  const state = encodeState({ purpose: "login", provider: "google", nonce: crypto.randomUUID() });
  const url = new URL(gmailAuthorizeUrl({ redirectUri: `${base}/api/auth/google/callback`, state }));

  // Sign-in only needs identity scopes; the mailbox is connected later, on purpose.
  url.searchParams.set(
    "scope",
    ["https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile"].join(" "),
  );

  return NextResponse.redirect(url.toString());
}

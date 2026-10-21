/**
 * Gmail integration (Google REST APIs, no SDK).
 *
 * Scopes are deliberately least-privilege:
 *   • gmail.send            — send approved applications only
 *   • gmail.readonly        — detect recruiter replies
 *   • userinfo.email/profile — show which mailbox is connected
 * Tokens are encrypted at rest (AES-256-GCM) and refreshed automatically.
 */

import { env } from "@/lib/env";

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://gmail.googleapis.com/gmail/v1";
const USERINFO = "https://www.googleapis.com/oauth2/v3/userinfo";

export function gmailAuthorizeUrl(params: { redirectUri: string; state: string }): string {
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GMAIL_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent select_account");
  url.searchParams.set("state", params.state);
  return url.toString();
}

export type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

export async function exchangeGmailCode(code: string, redirectUri: string): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  if (!response.ok) throw new Error(`Google token exchange failed (${response.status}): ${(await response.text()).slice(0, 200)}`);
  return (await response.json()) as TokenResponse;
}

export async function refreshGmailToken(refreshToken: string): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) throw new Error(`Google token refresh failed (${response.status})`);
  return (await response.json()) as TokenResponse;
}

export async function gmailProfile(accessToken: string): Promise<{ email: string; name?: string }> {
  const response = await fetch(USERINFO, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`Google profile lookup failed (${response.status})`);
  const data = (await response.json()) as { email?: string; name?: string };
  if (!data.email) throw new Error("Google profile did not include an email address");
  return { email: data.email, name: data.name };
}

export type OutgoingMessage = {
  to: string[];
  subject: string;
  body: string;
  fromName?: string | null;
  replyTo?: string | null;
  attachments?: { filename: string; mimeType: string; content: Buffer }[];
};

function base64Url(data: string | Buffer): string {
  return Buffer.from(data).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Builds an RFC-822 message (multipart when attachments are present). */
export function buildRawMessage(message: OutgoingMessage & { from: string }): string {
  const boundary = `applypilot_${crypto.randomUUID().replace(/-/g, "")}`;
  const headers = [
    `From: ${message.fromName ? `${message.fromName} <${message.from}>` : message.from}`,
    `To: ${message.to.join(", ")}`,
    `Subject: ${message.subject}`,
    "MIME-Version: 1.0",
    ...(message.replyTo ? [`Reply-To: ${message.replyTo}`] : []),
  ];

  const attachments = message.attachments ?? [];
  if (!attachments.length) {
    return [...headers, 'Content-Type: text/plain; charset="UTF-8"', "", message.body].join("\r\n");
  }

  const parts: string[] = [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    message.body,
  ];

  for (const attachment of attachments) {
    parts.push(
      `--${boundary}`,
      `Content-Type: ${attachment.mimeType}; name="${attachment.filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${attachment.filename}"`,
      "",
      attachment.content.toString("base64"),
    );
  }
  parts.push(`--${boundary}--`);
  return parts.join("\r\n");
}

export type SendResult = { providerMessageId: string; threadId?: string };

export async function sendGmailMessage(
  accessToken: string,
  message: OutgoingMessage & { from: string },
): Promise<SendResult> {
  const raw = base64Url(buildRawMessage(message));
  const response = await fetch(`${API}/users/me/messages/send`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ raw }),
  });

  if (response.status === 429 || response.status === 403) {
    const text = await response.text();
    throw Object.assign(new Error(`Gmail rate limit or quota error: ${text.slice(0, 200)}`), { rateLimited: true });
  }
  if (!response.ok) {
    throw new Error(`Gmail send failed (${response.status}): ${(await response.text()).slice(0, 200)}`);
  }
  const data = (await response.json()) as { id?: string; threadId?: string };
  return { providerMessageId: data.id ?? "", threadId: data.threadId };
}

/** Lists recent messages matching a query (used to detect recruiter replies). */
export async function listGmailMessages(accessToken: string, query: string, maxResults = 20) {
  const url = new URL(`${API}/users/me/messages`);
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", String(maxResults));
  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`Gmail list failed (${response.status})`);
  const data = (await response.json()) as { messages?: { id: string; threadId: string }[] };
  return data.messages ?? [];
}

export async function getGmailMessage(accessToken: string, id: string) {
  const response = await fetch(`${API}/users/me/messages/${id}?format=full`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Gmail message fetch failed (${response.status})`);
  const data = (await response.json()) as {
    id: string;
    threadId?: string;
    snippet?: string;
    payload?: {
      headers?: { name: string; value: string }[];
      parts?: { mimeType?: string; body?: { data?: string } }[];
      body?: { data?: string };
    };
  };
  const header = (name: string) => data.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
  const part = data.payload?.parts?.find((p) => p.mimeType === "text/plain");
  const encoded = part?.body?.data ?? data.payload?.body?.data;
  return {
    id: data.id,
    threadId: data.threadId,
    snippet: data.snippet ?? "",
    subject: header("Subject"),
    from: header("From"),
    to: header("To"),
    date: header("Date"),
    body: encoded ? Buffer.from(encoded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8") : "",
  };
}

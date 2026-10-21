/**
 * Outlook / Microsoft 365 integration via Microsoft Graph.
 *
 * Least-privilege scopes: Mail.Send (approved applications) + Mail.Read (reply detection).
 * No admin consent required for a personal/work mailbox delegated flow.
 */

import { env } from "@/lib/env";

export const OUTLOOK_SCOPES = ["Mail.Send", "Mail.Read", "User.Read", "offline_access"];

const AUTHORITY = "https://login.microsoftonline.com";

function endpoints() {
  const tenant = env.MICROSOFT_TENANT_ID || "common";
  return {
    auth: `${AUTHORITY}/${tenant}/oauth2/v2.0/authorize`,
    token: `${AUTHORITY}/${tenant}/oauth2/v2.0/token`,
    graph: "https://graph.microsoft.com/v1.0",
  };
}

export function outlookAuthorizeUrl(params: { redirectUri: string; state: string }): string {
  const { auth } = endpoints();
  const url = new URL(auth);
  url.searchParams.set("client_id", env.MICROSOFT_CLIENT_ID);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", OUTLOOK_SCOPES.join(" "));
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", params.state);
  return url.toString();
}

export type OutlookTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};

export async function exchangeOutlookCode(code: string, redirectUri: string): Promise<OutlookTokenResponse> {
  const { token } = endpoints();
  const response = await fetch(token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.MICROSOFT_CLIENT_ID,
      client_secret: env.MICROSOFT_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      scope: OUTLOOK_SCOPES.join(" "),
    }),
  });
  if (!response.ok) throw new Error(`Microsoft token exchange failed (${response.status}): ${(await response.text()).slice(0, 200)}`);
  return (await response.json()) as OutlookTokenResponse;
}

export async function refreshOutlookToken(refreshToken: string): Promise<OutlookTokenResponse> {
  const { token } = endpoints();
  const response = await fetch(token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.MICROSOFT_CLIENT_ID,
      client_secret: env.MICROSOFT_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: OUTLOOK_SCOPES.join(" "),
    }),
  });
  if (!response.ok) throw new Error(`Microsoft token refresh failed (${response.status})`);
  return (await response.json()) as OutlookTokenResponse;
}

export async function outlookProfile(accessToken: string): Promise<{ email: string; name?: string }> {
  const { graph } = endpoints();
  const response = await fetch(`${graph}/me?$select=mail,userPrincipalName,displayName`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Microsoft profile lookup failed (${response.status})`);
  const data = (await response.json()) as { mail?: string; userPrincipalName?: string; displayName?: string };
  const email = data.mail ?? data.userPrincipalName;
  if (!email) throw new Error("Microsoft account did not expose an email address");
  return { email, name: data.displayName };
}

export type OutgoingMessage = {
  to: string[];
  subject: string;
  body: string;
  attachments?: { filename: string; mimeType: string; content: Buffer }[];
};

export async function sendOutlookMessage(accessToken: string, message: OutgoingMessage): Promise<{ providerMessageId: string }> {
  const { graph } = endpoints();
  const payload = {
    message: {
      subject: message.subject,
      body: { contentType: "Text", content: message.body },
      toRecipients: message.to.map((address) => ({ emailAddress: { address } })),
      ...(message.attachments?.length
        ? {
            attachments: message.attachments.map((attachment) => ({
              "@odata.type": "#microsoft.graph.fileAttachment",
              name: attachment.filename,
              contentType: attachment.mimeType,
              contentBytes: attachment.content.toString("base64"),
            })),
          }
        : {}),
    },
    saveToSentItems: true,
  };

  const response = await fetch(`${graph}/me/sendMail`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (response.status === 429) {
    throw Object.assign(new Error("Microsoft Graph throttled the request (429)"), { rateLimited: true });
  }
  // Graph returns 202 Accepted with an empty body on success.
  if (!response.ok && response.status !== 202) {
    throw new Error(`Outlook send failed (${response.status}): ${(await response.text()).slice(0, 200)}`);
  }
  return { providerMessageId: `graph-${Date.now()}` };
}

/** Recent inbound messages (reply detection). */
export async function listOutlookInbox(accessToken: string, filter: string, top = 20) {
  const { graph } = endpoints();
  const url = new URL(`${graph}/me/mailFolders/inbox/messages`);
  url.searchParams.set("$filter", filter);
  url.searchParams.set("$top", String(top));
  url.searchParams.set("$select", "id,subject,from,toRecipients,receivedDateTime,bodyPreview,conversationId");
  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`Outlook list failed (${response.status})`);
  const data = (await response.json()) as { value?: Record<string, unknown>[] };
  return (data.value ?? []).map((item) => ({
    id: String(item.id ?? ""),
    subject: String(item.subject ?? ""),
    from: String((item.from as { emailAddress?: { address?: string } })?.emailAddress?.address ?? ""),
    receivedAt: String(item.receivedDateTime ?? new Date().toISOString()),
    snippet: String(item.bodyPreview ?? ""),
    conversationId: String(item.conversationId ?? ""),
  }));
}

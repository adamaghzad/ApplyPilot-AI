import { and, asc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { emailConnections, type EmailConnection } from "@/lib/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";
import { recordAudit, recordActivity } from "@/lib/audit";
import { ApiError } from "@/lib/api";
import { GMAIL_SCOPES, refreshGmailToken } from "@/lib/integrations/gmail";
import { OUTLOOK_SCOPES, refreshOutlookToken } from "@/lib/integrations/outlook";

export async function listConnections(userId: string) {
  return getDb().select().from(emailConnections).where(eq(emailConnections.userId, userId)).orderBy(asc(emailConnections.createdAt));
}

export async function getConnection(userId: string, connectionId?: string | null): Promise<EmailConnection | null> {
  if (connectionId) {
    const [row] = await getDb()
      .select()
      .from(emailConnections)
      .where(and(eq(emailConnections.id, connectionId), eq(emailConnections.userId, userId)))
      .limit(1);
    return row ?? null;
  }
  const rows = await getDb()
    .select()
    .from(emailConnections)
    .where(and(eq(emailConnections.userId, userId), eq(emailConnections.status, "CONNECTED")))
    .limit(1);
  return rows[0] ?? null;
}

export async function saveConnection(userId: string, input: {
  provider: "GMAIL" | "OUTLOOK";
  emailAddress: string;
  displayName?: string | null;
  accessToken: string;
  refreshToken?: string | null;
  expiresIn?: number | null;
  scopes: string[];
}): Promise<EmailConnection> {
  const access = encrypt(input.accessToken);
  const refresh = input.refreshToken ? encrypt(input.refreshToken) : null;

  const [row] = await getDb()
    .insert(emailConnections)
    .values({
      userId,
      provider: input.provider,
      emailAddress: input.emailAddress,
      displayName: input.displayName ?? null,
      scopes: input.scopes,
      accessTokenEnc: access.ciphertext,
      tokenIv: access.iv,
      tokenTag: access.tag,
      refreshTokenEnc: refresh?.ciphertext ?? null,
      tokenExpiresAt: input.expiresIn ? new Date(Date.now() + input.expiresIn * 1000) : null,
      status: "CONNECTED",
    })
    .onConflictDoUpdate({
      target: [emailConnections.userId, emailConnections.provider, emailConnections.emailAddress],
      set: {
        accessTokenEnc: access.ciphertext,
        tokenIv: access.iv,
        tokenTag: access.tag,
        refreshTokenEnc: refresh?.ciphertext ?? null,
        tokenExpiresAt: input.expiresIn ? new Date(Date.now() + input.expiresIn * 1000) : null,
        scopes: input.scopes,
        status: "CONNECTED",
        lastError: null,
        displayName: input.displayName ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  await recordActivity({
    userId,
    agent: "AUTOMATION",
    message: `${input.provider === "GMAIL" ? "Gmail" : "Outlook"} connected — ${input.emailAddress}`,
    type: "SUCCESS",
    meta: { connectionId: row.id },
  });
  await recordAudit({ userId, action: "connection.connect", entity: "emailConnection", entityId: row.id, meta: { email: input.emailAddress, provider: input.provider } });
  return row;
}

export async function disconnectConnection(userId: string, connectionId: string) {
  const [row] = await getDb()
    .update(emailConnections)
    .set({ status: "DISCONNECTED", accessTokenEnc: null, refreshTokenEnc: null, tokenIv: null, tokenTag: null, updatedAt: new Date() })
    .where(and(eq(emailConnections.id, connectionId), eq(emailConnections.userId, userId)))
    .returning();
  if (!row) throw new ApiError("Connection not found", 404);
  await recordAudit({ userId, action: "connection.disconnect", entity: "emailConnection", entityId: connectionId });
  await recordActivity({ userId, agent: "AUTOMATION", message: `${row.provider} disconnected — ${row.emailAddress}`, meta: { connectionId } });
  return row;
}

/** Returns a valid access token, refreshing (and persisting) it when needed. */
export async function ensureAccessToken(connection: EmailConnection): Promise<string> {
  if (!connection.accessTokenEnc || !connection.tokenIv || !connection.tokenTag) {
    throw new ApiError("This mailbox is not connected", 400);
  }

  const expiringSoon = connection.tokenExpiresAt ? connection.tokenExpiresAt.getTime() - Date.now() < 60_000 : false;

  if (!expiringSoon) {
    return decrypt({ ciphertext: connection.accessTokenEnc, iv: connection.tokenIv, tag: connection.tokenTag });
  }

  if (!connection.refreshTokenEnc) {
    await getDb().update(emailConnections).set({ status: "EXPIRED", updatedAt: new Date() }).where(eq(emailConnections.id, connection.id));
    throw new ApiError("Mailbox token expired — reconnect the account", 401);
  }

  const refreshToken = decrypt({
    ciphertext: connection.refreshTokenEnc,
    iv: connection.tokenIv,
    tag: connection.tokenTag,
  });

  try {
    const refreshed =
      connection.provider === "GMAIL" ? await refreshGmailToken(refreshToken) : await refreshOutlookToken(refreshToken);

    const encrypted = encrypt(refreshed.access_token);
    await getDb()
      .update(emailConnections)
      .set({
        accessTokenEnc: encrypted.ciphertext,
        tokenIv: encrypted.iv,
        tokenTag: encrypted.tag,
        tokenExpiresAt: refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000) : null,
        status: "CONNECTED",
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(emailConnections.id, connection.id));

    return refreshed.access_token;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Token refresh failed";
    await getDb()
      .update(emailConnections)
      .set({ status: "EXPIRED", lastError: message, updatedAt: new Date() })
      .where(eq(emailConnections.id, connection.id));
    throw new ApiError(`Could not refresh the mailbox token: ${message}`, 401);
  }
}

/** Resets the per-day counter when the UTC day rolls over. */
export async function resetDailyCountersIfNeeded(connection: EmailConnection) {
  const lastReset = connection.lastResetAt ? new Date(connection.lastResetAt) : new Date(0);
  const isSameDay = lastReset.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
  if (!isSameDay) {
    await getDb()
      .update(emailConnections)
      .set({ sentToday: 0, lastResetAt: new Date(), updatedAt: new Date() })
      .where(eq(emailConnections.id, connection.id));
    return 0;
  }
  return connection.sentToday;
}

export async function markRateLimited(connectionId: string, message: string) {
  await getDb()
    .update(emailConnections)
    .set({ status: "RATE_LIMITED", lastError: message, updatedAt: new Date() })
    .where(eq(emailConnections.id, connectionId));
}

export async function clearRateLimit(connectionId: string) {
  await getDb()
    .update(emailConnections)
    .set({ status: "CONNECTED", lastError: null, updatedAt: new Date() })
    .where(eq(emailConnections.id, connectionId));
}

export const SCOPES_FOR = { GMAIL: GMAIL_SCOPES, OUTLOOK: OUTLOOK_SCOPES } as const;

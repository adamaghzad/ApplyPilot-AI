import { cache } from "react";
import { cookies } from "next/headers";
import { and, eq, gt, isNull } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { sessions, users, type User } from "@/lib/db/schema";
import { randomToken, sha256 } from "@/lib/crypto";
import { isProduction } from "@/lib/env";

export const SESSION_COOKIE = "applypilot_session";
const SESSION_TTL_DAYS = 30;

export type SessionUser = User;

export async function createSession(userId: string, meta?: { ip?: string; userAgent?: string }) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await getDb().insert(sessions).values({
    userId,
    tokenHash: sha256(token),
    expiresAt,
    ip: meta?.ip ?? null,
    userAgent: meta?.userAgent ?? null,
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  return { token, expiresAt };
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await getDb().delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
  }
  store.delete(SESSION_COOKIE);
}

export async function destroyAllSessions(userId: string) {
  await getDb().delete(sessions).where(eq(sessions.userId, userId));
}

/** Cached for the lifetime of a single request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await getDb()
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date()), isNull(users.deletedAt)))
    .limit(1);

  return rows[0]?.user ?? null;
});

export class UnauthorizedError extends Error {
  status = 401;
  constructor(message = "Authentication required") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

/** Best-effort: returns the user or null, never throws (for landing page / public routes). */
export async function optionalUser(): Promise<SessionUser | null> {
  try {
    return await getCurrentUser();
  } catch {
    return null;
  }
}

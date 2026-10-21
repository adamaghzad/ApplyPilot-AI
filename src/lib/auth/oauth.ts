import crypto from "node:crypto";

import { env } from "@/lib/env";

export type OAuthState = {
  purpose: "login" | "connect";
  userId?: string;
  provider: "google" | "microsoft";
  nonce: string;
  redirectTo?: string;
};

function sign(payload: string): string {
  return crypto.createHmac("sha256", env.AUTH_SECRET).update(payload).digest("base64url");
}

/** Signed, tamper-proof OAuth state (also carries the CSRF nonce). */
export function encodeState(state: OAuthState): string {
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodeState(raw: string | null | undefined): OAuthState | null {
  if (!raw) return null;
  const [payload, signature] = raw.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  if (expected.length !== signature.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthState;
  } catch {
    return null;
  }
}

/**
 * Base URL for OAuth redirects.
 * Derived from the incoming request so previews (e2b, codespaces, ngrok) work without
 * editing APP_URL; falls back to the configured value.
 */
export function baseUrlFromRequest(req: Request): string {
  const url = new URL(req.url);
  const forwardedHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const forwardedProto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");

  const configured = env.APP_URL.replace(/\/$/, "");
  const configuredIsLocalhost = /localhost|127\.0\.0\.1/.test(configured);

  if (forwardedHost && configuredIsLocalhost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  return configured;
}

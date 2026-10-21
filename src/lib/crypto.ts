import crypto from "node:crypto";

import { env } from "./env";

const ALGORITHM = "aes-256-gcm";

/** Derives a stable 32-byte key from the configured secret material. */
function keyMaterial(): Buffer {
  return crypto.createHash("sha256").update(env.ENCRYPTION_KEY).digest();
}

export type EncryptedPayload = { ciphertext: string; iv: string; tag: string };

/** AES-256-GCM encryption for OAuth tokens at rest. */
export function encrypt(plainText: string): EncryptedPayload {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, keyMaterial(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function decrypt(payload: { ciphertext: string; iv: string; tag: string }): string {
  const decipher = crypto.createDecipheriv(ALGORITHM, keyMaterial(), Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** Salted scrypt password hashing (no native build step required). */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [scheme, salt, digest] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !digest) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(digest, "hex");
  if (expected.length !== derived.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

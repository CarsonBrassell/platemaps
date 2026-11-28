import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Sealing Apple refresh tokens before they are stored. Server-only.
 *
 * The token is kept for one purpose — telling Apple to revoke it when the
 * account is deleted or the sign-in is disconnected — and until then it is a
 * live credential for that person's Apple authorization. A dumped table
 * should hand over nothing usable, the same standard `sessions.token` is held
 * to; a hash would do that too, but a hash cannot be sent back to Apple.
 *
 * AES-256-GCM with a fresh 12-byte IV per value; the key is
 * `OAUTH_TOKEN_ENC_KEY`, 32 random bytes in base64. Stored as
 * `v1.<base64url(iv | tag | ciphertext)>` — the prefix is there so a later
 * key rotation has somewhere to say which key sealed a row.
 */

const PREFIX = "v1.";

/** The key, or null when the variable is missing or is not exactly 32 bytes. */
export function tokenEncKey(): Buffer | null {
  const raw = process.env.OAUTH_TOKEN_ENC_KEY?.trim();
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  return key.length === 32 ? key : null;
}

/** Null when there is no key — the caller stores nothing rather than plaintext. */
export function seal(plain: string): string | null {
  const key = tokenEncKey();
  if (!key) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

/** Null for anything that does not open: wrong key, truncated, tampered. Never throws. */
export function open(sealed: string): string | null {
  const key = tokenEncKey();
  if (!key || !sealed.startsWith(PREFIX)) return null;
  try {
    const raw = Buffer.from(sealed.slice(PREFIX.length), "base64url");
    if (raw.length < 12 + 16 + 1) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

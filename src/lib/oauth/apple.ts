import { createPrivateKey, sign, type KeyObject } from "node:crypto";
import type { RevocableToken } from "@/lib/db";
import { open } from "@/lib/oauth/secretBox";

/**
 * The server's own conversations with Apple: signing the client secret,
 * trading a one-time authorization code for a refresh token, and revoking
 * that token. Server-only.
 *
 * ## Why any of this exists
 *
 * Verifying an Apple sign-in needs none of it — the identity token is checked
 * against Apple's public keys (`./idToken`). This is here for the other
 * direction. Apple's account-deletion guidance says an app that offers Sign
 * in with Apple must *revoke* the authorization when the account is deleted,
 * and revocation takes a refresh token, which only exists if the
 * authorization code was exchanged within its five minutes of life. So the
 * code is exchanged at every native Apple sign-in and the token is kept,
 * sealed, until it is needed.
 *
 * ## Configuration
 *
 *   APPLE_SIGNIN_KEY_ID        the 10-character id of a .p8 key with "Sign in
 *                              with Apple" ticked. A separate key from the push
 *                              key, so rotating one never breaks the other.
 *   APPLE_SIGNIN_PRIVATE_KEY   the .p8 file's contents (PEM). Real newlines or
 *                              `\n`-escaped, same as APNS_AUTH_KEY.
 *   APPLE_SIGNIN_TEAM_ID       optional; falls back to APNS_TEAM_ID.
 *
 * **Nothing here throws to its caller.** A failed exchange means sign-in
 * proceeds with no stored token; a failed revoke is logged. Neither is worth
 * refusing a person their account over, and neither ever logs a token.
 */

const TOKEN_URL = "https://appleid.apple.com/auth/token";
const REVOKE_URL = "https://appleid.apple.com/auth/revoke";
const AUDIENCE = "https://appleid.apple.com";
const TIMEOUT_MS = 5000;

type AppleKey = { teamId: string; keyId: string; key: KeyObject };

/** Read fresh each time: `readiness()` caches the verdict, and a parse is cheap. */
function appleKey(): AppleKey | null {
  const teamId = (process.env.APPLE_SIGNIN_TEAM_ID ?? process.env.APNS_TEAM_ID)?.trim();
  const keyId = process.env.APPLE_SIGNIN_KEY_ID?.trim();
  const rawKey = process.env.APPLE_SIGNIN_PRIVATE_KEY;
  if (!teamId || !keyId || !rawKey) return null;
  try {
    const key = createPrivateKey(rawKey.replace(/\\n/g, "\n").trim());
    // ES256 is P-256 or nothing; an RSA key pasted here would sign happily and
    // be refused by Apple on every call.
    if (key.asymmetricKeyType !== "ec") return null;
    return { teamId, keyId, key };
  } catch {
    return null;
  }
}

const base64url = (input: string | Buffer) => Buffer.from(input).toString("base64url");

/**
 * The "client secret" Apple wants is not a stored secret but a short-lived
 * ES256 JWT we sign: issuer the team, subject the client id, five minutes.
 * Signed the way lib/push.ts signs its provider token.
 *
 * `clientId` is the audience the identity token was verified against (the
 * bundle id for the native app). Apple refuses an exchange whose client id is
 * not the one the code was issued to, which is why it is passed in rather
 * than assumed. Null when the key is missing or unreadable.
 */
export function appleClientSecret(clientId: string): string | null {
  const config = appleKey();
  if (!config) return null;
  try {
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: "ES256", kid: config.keyId }));
    const claims = base64url(
      JSON.stringify({ iss: config.teamId, iat: now, exp: now + 300, aud: AUDIENCE, sub: clientId })
    );
    const signingInput = `${header}.${claims}`;
    // JOSE wants the raw r||s signature, not DER — that is what ieee-p1363 is.
    const signature = sign("sha256", Buffer.from(signingInput), {
      key: config.key,
      dsaEncoding: "ieee-p1363",
    });
    return `${signingInput}.${base64url(signature)}`;
  } catch {
    return null;
  }
}

async function postForm(url: string, form: Record<string, string>): Promise<Response | null> {
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return null;
  }
}

/**
 * Trade the one-time authorization code for a refresh token. Returns the raw
 * token (the caller seals it) or null on any failure.
 */
export async function exchangeAppleCode(code: string, clientId: string): Promise<string | null> {
  const secret = appleClientSecret(clientId);
  if (!secret) return null;
  const res = await postForm(TOKEN_URL, {
    client_id: clientId,
    client_secret: secret,
    code,
    grant_type: "authorization_code",
  });
  if (!res || !res.ok) {
    // The status only. Apple's error body can echo request fields.
    console.error(`apple code exchange failed: ${res ? res.status : "no response"}`);
    return null;
  }
  try {
    const data = (await res.json()) as { refresh_token?: unknown };
    return typeof data.refresh_token === "string" && data.refresh_token ? data.refresh_token : null;
  } catch {
    return null;
  }
}

/**
 * Tell Apple this authorization is over. Takes the sealed token as stored.
 * Best effort: callers run it in `after()` and never wait on the answer.
 */
export async function revokeAppleToken(refreshTokenEnc: string, clientId: string): Promise<void> {
  const token = open(refreshTokenEnc);
  const secret = appleClientSecret(clientId);
  if (!token || !secret) {
    console.error("apple revoke skipped: stored token or signing key unusable");
    return;
  }
  const res = await postForm(REVOKE_URL, {
    client_id: clientId,
    client_secret: secret,
    token,
    token_type_hint: "refresh_token",
  });
  if (!res || !res.ok) {
    console.error(`apple revoke failed: ${res ? res.status : "no response"}`);
  }
}

/**
 * Revoke whatever in `rows` is an Apple row with a stored token. Google rows
 * pass through untouched — nothing of Google's is stored to revoke.
 */
export async function revokeStoredTokens(rows: readonly RevocableToken[]): Promise<void> {
  for (const row of rows) {
    if (row.provider !== "apple" || !row.refreshTokenEnc || !row.clientId) continue;
    await revokeAppleToken(row.refreshTokenEnc, row.clientId);
  }
}

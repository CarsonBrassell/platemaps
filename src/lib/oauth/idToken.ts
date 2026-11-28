import { createHash, createPublicKey, verify, type JsonWebKey, type KeyObject } from "node:crypto";
import type { OAuthProvider } from "@/lib/db";
import { normalizeEmail } from "@/lib/emailAddress";
import { PROVIDERS } from "@/lib/oauth/providers";

/**
 * Checking an ID token from Apple or Google. Server-only.
 *
 * An ID token is a short signed note from the provider: "this is user number
 * X, for your app, issued just now". Everything the sign-in decides rests on
 * this file believing only real ones, so every check below is required and
 * each failure is a refusal — there is no "mostly valid".
 *
 * ## Why no library
 *
 * The same answer `lib/push.ts` gives for APNs: it is one RSA verify and a
 * dozen comparisons on Node's own `crypto`, and a JWT package's flexibility
 * (many algorithms, `none`, key-type confusion) is exactly the surface this
 * wants not to have. One algorithm is accepted, by name.
 *
 * ## What is checked, in order
 *
 * 1. Size and shape — capped at 8 KB before anything is decoded.
 * 2. `alg` is exactly `RS256`. Not "whatever the header says": a token that
 *    picks its own algorithm picks `none`.
 * 3. The signature, against the provider's published key for the header's
 *    `kid`, fetched over HTTPS from a fixed URL. No key, no sign-in.
 * 4. `iss` is the provider.
 * 5. `aud` is the ONE audience this entry point expects (see
 *    `expectedAudience`), and for Google `azp` is one of our own clients.
 * 6. Not expired, not issued in the future.
 * 7. `nonce` is the value this server issued to this browser seconds ago and
 *    has just deleted — so a token lifted from anywhere else, or replayed,
 *    names a nonce nobody is waiting for.
 *
 * Tokens are never logged, whole or in part.
 */

const MAX_TOKEN_BYTES = 8 * 1024;
const LEEWAY_SECONDS = 60;
const JWKS_TTL_MS = 60 * 60 * 1000;
/** An unknown `kid` may trigger a refetch, but not more than once a minute —
    otherwise a stream of tokens with invented kids is a free way to make this
    server hammer Apple and Google. */
const JWKS_REFETCH_MIN_MS = 60 * 1000;
const JWKS_TIMEOUT_MS = 5000;

export type IdTokenClaims = {
  /** The provider's permanent user number. The only thing an account is matched on. */
  sub: string;
  /** Normalised like every other address here, or null when the token has none. */
  email: string | null;
  /** Whether the provider vouches that `sub` controls `email` — see `emailIsVerified`. */
  emailVerified: boolean;
  /** An Apple relay address. */
  isPrivateEmail: boolean;
  /** The verified audience. Stored as the identity's client id; Apple exchange and revoke reuse it. */
  aud: string;
  /** Which client asked for the token, when the provider says. */
  azp: string | null;
  /** How the nonce was carried — see the note in `nonceForm`. */
  nonceForm: "equal" | "sha256-hex" | "sha256-base64url";
};

export type VerifyResult =
  | { ok: true; claims: IdTokenClaims }
  /** A fixed code for the server log. Never shown to the caller, never the token. */
  | { ok: false; reason: string };

type KeySet = { keys: Map<string, KeyObject>; fetchedAt: number; lastAttemptAt: number };
const keySets = new Map<OAuthProvider, KeySet>();

async function fetchKeys(provider: OAuthProvider): Promise<Map<string, KeyObject> | null> {
  try {
    const res = await fetch(PROVIDERS[provider].jwksUrl, {
      signal: AbortSignal.timeout(JWKS_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { keys?: unknown };
    if (!Array.isArray(data.keys)) return null;

    const keys = new Map<string, KeyObject>();
    for (const jwk of data.keys as Record<string, unknown>[]) {
      // RSA signing keys only. A key published for another purpose or another
      // algorithm is not one a token may be checked against.
      if (!jwk || jwk.kty !== "RSA" || typeof jwk.kid !== "string") continue;
      if (jwk.use !== undefined && jwk.use !== "sig") continue;
      if (jwk.alg !== undefined && jwk.alg !== "RS256") continue;
      try {
        keys.set(jwk.kid, createPublicKey({ key: jwk as JsonWebKey, format: "jwk" }));
      } catch {
        /* One unreadable key must not cost the rest of the set. */
      }
    }
    return keys.size > 0 ? keys : null;
  } catch {
    return null;
  }
}

/**
 * The provider's key for `kid`, or null. Fails closed: if the keys cannot be
 * fetched and the kid is not already cached, nothing verifies.
 */
async function keyFor(provider: OAuthProvider, kid: string): Promise<KeyObject | null> {
  const now = Date.now();
  const set = keySets.get(provider);

  if (set && now - set.fetchedAt < JWKS_TTL_MS) {
    const hit = set.keys.get(kid);
    if (hit) return hit;
    // Unknown kid on a fresh set: the provider may have rotated. Look again,
    // rate-limited.
    if (now - set.lastAttemptAt < JWKS_REFETCH_MIN_MS) return null;
  } else if (set && now - set.lastAttemptAt < JWKS_REFETCH_MIN_MS) {
    // Stale set and a refetch just failed: do not retry on every request, and
    // do not keep trusting keys past their hour.
    return null;
  }

  if (set) set.lastAttemptAt = now;
  const keys = await fetchKeys(provider);
  if (!keys) {
    if (!set) keySets.set(provider, { keys: new Map(), fetchedAt: 0, lastAttemptAt: now });
    return null;
  }
  keySets.set(provider, { keys, fetchedAt: now, lastAttemptAt: now });
  return keys.get(kid) ?? null;
}

function decodePart(part: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * How the token carries our nonce, or null if it does not.
 *
 * Exact equality is the expected form for both providers. The two hashed
 * forms are accepted because some native SDK paths hash the nonce before
 * handing it to the provider, and which one this plugin's does was read from
 * source, not seen on a device. All three bind the token to the same
 * server-issued value, so accepting them weakens nothing. After one real
 * sign-in per provider (set OAUTH_DEBUG_CLAIMS=1 and read the log line in the
 * native route), delete the branches that never fire.
 */
function nonceForm(claimed: unknown, expected: string): IdTokenClaims["nonceForm"] | null {
  if (typeof claimed !== "string" || claimed.length === 0) return null;
  if (claimed === expected) return "equal";
  const digest = createHash("sha256").update(expected).digest();
  if (claimed === digest.toString("hex")) return "sha256-hex";
  if (claimed === digest.toString("base64url")) return "sha256-base64url";
  return null;
}

const truthy = (value: unknown) => value === true || value === "true";

/**
 * Whether the provider's word on this address is worth anything.
 *
 * It decides two things later: whether a brand-new account starts with a
 * confirmed email, and whether this identity survives a password reset
 * (`evictUntrustedIdentities`). So it is deliberately narrower than the
 * token's own `email_verified`.
 *
 * Google sets `email_verified` on any Google account, including one made over
 * somebody else's non-Gmail address that Google merely once mailed. It is
 * only authoritative where Google *is* the mail host: gmail.com /
 * googlemail.com, or a Workspace domain (the `hd` claim). Apple's flag is
 * taken as given — its addresses are either an Apple ID's confirmed address
 * or a relay Apple itself operates.
 */
function emailIsVerified(provider: OAuthProvider, email: string, payload: Record<string, unknown>): boolean {
  if (!truthy(payload.email_verified)) return false;
  if (provider === "apple") return true;
  const domain = email.slice(email.lastIndexOf("@") + 1);
  if (domain === "gmail.com" || domain === "googlemail.com") return true;
  return typeof payload.hd === "string" && payload.hd.length > 0;
}

export async function verifyIdToken(
  token: string,
  opts: {
    provider: OAuthProvider;
    /** Exactly one. See `expectedAudience`. */
    expectedAudience: string;
    /** The nonce from the flow row that was just taken. */
    expectedNonce: string;
    /** Google only: the clients allowed to have requested the token. */
    allowedAzp?: readonly string[];
  }
): Promise<VerifyResult> {
  const fail = (reason: string): VerifyResult => ({ ok: false, reason });

  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_BYTES) {
    return fail("size");
  }
  // An empty expectation must never match an empty claim.
  if (!opts.expectedAudience || !opts.expectedNonce) return fail("unconfigured");

  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((p) => p.length === 0)) return fail("shape");
  const [rawHeader, rawPayload, rawSignature] = parts;

  const header = decodePart(rawHeader);
  if (!header) return fail("header");
  if (header.alg !== "RS256") return fail("alg");
  if (typeof header.kid !== "string" || header.kid.length === 0 || header.kid.length > 200) {
    return fail("kid");
  }

  const key = await keyFor(opts.provider, header.kid);
  if (!key) return fail("key");

  let signatureOk = false;
  try {
    signatureOk = verify(
      "RSA-SHA256",
      Buffer.from(`${rawHeader}.${rawPayload}`),
      key,
      Buffer.from(rawSignature, "base64url")
    );
  } catch {
    signatureOk = false;
  }
  if (!signatureOk) return fail("signature");

  // Nothing in the payload is read before this line.
  const payload = decodePart(rawPayload);
  if (!payload) return fail("payload");

  if (typeof payload.iss !== "string" || !PROVIDERS[opts.provider].issuers.includes(payload.iss)) {
    return fail("iss");
  }

  // A string, or an array holding only that string. An array with any other
  // member is a token also meant for someone else, and is refused.
  const aud = payload.aud;
  const audOk =
    aud === opts.expectedAudience ||
    (Array.isArray(aud) && aud.length === 1 && aud[0] === opts.expectedAudience);
  if (!audOk) return fail("aud");

  const azp = typeof payload.azp === "string" ? payload.azp : null;
  if (opts.allowedAzp && azp !== null && !opts.allowedAzp.includes(azp)) return fail("azp");

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp + LEEWAY_SECONDS < now) return fail("exp");
  if (typeof payload.iat !== "number" || payload.iat - LEEWAY_SECONDS > now) return fail("iat");

  if (typeof payload.sub !== "string" || payload.sub.length === 0 || payload.sub.length > 255) {
    return fail("sub");
  }

  const form = nonceForm(payload.nonce, opts.expectedNonce);
  if (!form) return fail("nonce");

  const rawEmail = typeof payload.email === "string" ? payload.email : "";
  const email = rawEmail && rawEmail.length <= 254 && rawEmail.includes("@") ? normalizeEmail(rawEmail) : null;

  return {
    ok: true,
    claims: {
      sub: payload.sub,
      email,
      emailVerified: email !== null && emailIsVerified(opts.provider, email, payload),
      isPrivateEmail: truthy(payload.is_private_email),
      aud: opts.expectedAudience,
      azp,
      nonceForm: form,
    },
  };
}

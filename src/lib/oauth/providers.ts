import type { OAuthMode, OAuthProvider } from "@/lib/db";
import { appUrl } from "@/lib/mail";
import { appleClientSecret } from "@/lib/oauth/apple";
import { APPLE_BUNDLE_ID, GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from "@/lib/oauth/publicIds";
import { tokenEncKey } from "@/lib/oauth/secretBox";

/**
 * Who the providers are, what a token from each must say, and whether this
 * deployment is actually able to use them. Server-only.
 */

export const PROVIDERS: Record<
  OAuthProvider,
  { issuers: readonly string[]; jwksUrl: string; authorizeUrl: string; tokenUrl: string }
> = {
  google: {
    // Google documents both spellings of its issuer.
    issuers: ["https://accounts.google.com", "accounts.google.com"],
    jwksUrl: "https://www.googleapis.com/oauth2/v3/certs",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
  },
  apple: {
    issuers: ["https://appleid.apple.com"],
    jwksUrl: "https://appleid.apple.com/auth/keys",
    authorizeUrl: "https://appleid.apple.com/auth/authorize",
    tokenUrl: "https://appleid.apple.com/auth/token",
  },
};

export function isProvider(value: unknown): value is OAuthProvider {
  return value === "google" || value === "apple";
}

/**
 * The ONE audience a token arriving through this entry point may carry, or
 * null when that entry point is not configured.
 *
 * One value per (provider, mode), never a pooled list. A pooled list would
 * let a token minted for the website be replayed at the native endpoint —
 * which has no `state` and no PKCE behind it — and the other way round.
 *
 * Google's iOS SDK, given a server client id, mints its token for the *Web*
 * client, so both Google modes expect that one; `allowedAzp` is what tells
 * the two apart. Apple's native token names the bundle id. Apple on the
 * website is not in v1 (`APPLE_SERVICES_ID` is read so v1.1 is one switch).
 */
export function expectedAudience(provider: OAuthProvider, mode: OAuthMode): string | null {
  if (provider === "google") return GOOGLE_WEB_CLIENT_ID || null;
  if (mode === "native") return APPLE_BUNDLE_ID;
  return process.env.APPLE_SERVICES_ID?.trim() || null;
}

/**
 * Which clients may have *requested* a Google token (`azp`). The audience says
 * who the token is for; this says who asked for it, and only our own two
 * clients may.
 */
export function allowedAzp(provider: OAuthProvider): readonly string[] | undefined {
  if (provider !== "google") return undefined;
  return [GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID].filter(Boolean);
}

/** Where Google sends the browser back. From `appUrl()`, never the Host header. */
export function googleRedirectUri(): string {
  return `${appUrl()}/api/auth/oauth/google/callback`;
}

export type Readiness = {
  /** Website "Continue with Google". */
  webGoogle: boolean;
  /**
   * The in-app pair. One flag for both buttons on purpose: App Store guideline
   * 4.8 wants Apple offered wherever Google is, and a dead Apple button beside
   * a working Google one is its own rejection. Both or neither.
   */
  nativePair: boolean;
};

const OFF: Readiness = { webGoogle: false, nativePair: false };

function compute(): Readiness {
  // http is tolerated only for a developer's own machine. Google refuses a
  // non-https redirect anywhere else, and the flow cookie is Secure in
  // production.
  const base = appUrl();
  const reachable =
    base.startsWith("https://") ||
    (process.env.NODE_ENV !== "production" && base.startsWith("http://localhost"));

  const webGoogle =
    process.env.OAUTH_WEB_ENABLED === "1" &&
    !!GOOGLE_WEB_CLIENT_ID &&
    !!process.env.GOOGLE_CLIENT_SECRET?.trim() &&
    reachable;

  const googleNative = !!GOOGLE_WEB_CLIENT_ID && !!GOOGLE_IOS_CLIENT_ID;

  /* Not "are the variables set" but "does signing actually work": the key is
     parsed and a real client secret is signed with it. A .p8 pasted with a
     line missing is set, and useless — and the way anyone would find out is a
     reviewer tapping Continue with Apple. The encryption key is part of the
     same test because an Apple sign-in whose refresh token cannot be sealed
     is one that can never be revoked on deletion. */
  const appleNative =
    process.env.OAUTH_NATIVE_ENABLED === "1" &&
    googleNative &&
    tokenEncKey() !== null &&
    appleClientSecret(APPLE_BUNDLE_ID) !== null;

  return { webGoogle, nativePair: appleNative };
}

let cached: { at: number; value: Readiness } | null = null;
const CACHE_MS = 60_000;

/**
 * Whether each entry point can work right now. **The server decides which
 * buttons exist** — there are no NEXT_PUBLIC flags, because a hand-set public
 * flag can disagree with the key actually installed and this cannot.
 *
 * With nothing configured every field is false, which is the shipped state:
 * no button is drawn and every OAuth route refuses.
 *
 * Cached for a minute per instance; the answer changes only on a deploy or an
 * env edit, and the Apple half signs a JWT to find out.
 */
export function readiness(): Readiness {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) return cached.value;
  let value: Readiness;
  try {
    value = compute();
  } catch {
    value = OFF;
  }
  cached = { at: now, value };
  return value;
}

/** Whether a flow for this provider through this mode may start at all. */
export function isReady(provider: OAuthProvider, mode: OAuthMode): boolean {
  const ready = readiness();
  if (mode === "native") return ready.nativePair;
  // Apple on the website is v1.1.
  return provider === "google" && ready.webGoogle;
}

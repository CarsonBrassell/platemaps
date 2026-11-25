import { after } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import {
  createPendingSignup,
  createSession,
  deletePendingSignup,
  getIdentity,
  getUserByEmail,
  linkIdentity,
  stampSessionReauth,
  touchIdentity,
  type IdentityInput,
  type OAuthFlow,
  type OAuthProvider,
  type ReauthPurpose,
  type User,
} from "@/lib/db";
import { sendSecurityNotice } from "@/lib/mail";
import { exchangeAppleCode, revokeStoredTokens } from "@/lib/oauth/apple";
import type { OAuthErrorReason } from "@/lib/oauth/errorCodes";
import { PENDING_COOKIE, issueFlowCookie, readFlowCookie } from "@/lib/oauth/flowCookies";
import type { IdTokenClaims } from "@/lib/oauth/idToken";
import { seal } from "@/lib/oauth/secretBox";
import { SESSION_COOKIE, getCurrentUser, setSessionCookie } from "@/lib/session";

/**
 * What happens once a provider token has been verified. Shared by the native
 * route and the website callback so the two entry points cannot drift into
 * different account rules. Server-only; call from a Route Handler.
 *
 * ## The account rule, in full
 *
 * 1. A provider sign-in reaches an account ONLY through an identity row with
 *    the same `(provider, subject)`.
 * 2. Email never finds or attaches an account. Addresses here are mostly
 *    unverified — signup never made anyone prove theirs — so "same email,
 *    same person" would hand your Google sign-in to whoever registered under
 *    your address first.
 * 3. A new person whose address is already on an account gets nothing made
 *    and nothing linked; they are told to log in to that account and connect
 *    from Settings.
 * 4. Connecting needs a live session, a *confirmed* account email, and a
 *    re-authentication, and the flow row is pinned to that user from start to
 *    finish (`flow.userId`).
 *
 * By the time this runs the flow row has been taken (single use) and the
 * token's signature, audience and nonce have been checked. Nothing here
 * re-reads anything from the request body.
 */

/** The subset of `OAUTH_ERRORS` this function can produce. */
export type OAuthErrorCode = Extract<
  OAuthErrorReason,
  | "email_in_use"
  | "identity_in_use"
  | "provider_already_linked"
  | "session_mismatch"
  | "verify_email_first"
  | "not_linked"
>;

export type OAuthOutcome =
  | { status: "signed_in"; user: User }
  | { status: "needs_signup"; provider: OAuthProvider; email: string | null }
  | { status: "linked" }
  | { status: "reauthed"; purpose: ReauthPurpose }
  | { status: "error"; code: OAuthErrorCode };

/**
 * `sam@example.com` → `s•••@example.com`. The finish screen shows which
 * address the account will get; it has no need of the whole thing, and the
 * pending cookie alone should not be enough to read it back out.
 */
export function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  return `${email[0]}•••${email.slice(at)}`;
}

/** The same three calls the password login ends in — see auth/login. */
async function issueSession(userId: string): Promise<void> {
  const token = randomUUID();
  await createSession(token, userId);
  await setSessionCookie(token);
}

export async function completeOAuth(input: {
  flow: OAuthFlow;
  claims: IdTokenClaims;
  /** Apple's one-time authorization code, native flow only. */
  appleCode?: string | null;
}): Promise<OAuthOutcome> {
  const { flow, claims } = input;

  /* Apple first, before any decision: the code lives five minutes and is the
     only way to ever get a refresh token, which is the only way to revoke.
     The client id is the audience just verified, never a guess. A failed
     exchange is not a failed sign-in — see lib/oauth/apple.ts. */
  let refreshTokenEnc: string | null = null;
  if (flow.provider === "apple" && input.appleCode) {
    const refreshToken = await exchangeAppleCode(input.appleCode, claims.aud);
    if (refreshToken) refreshTokenEnc = seal(refreshToken);
  }

  const identity: IdentityInput = {
    provider: flow.provider,
    subject: claims.sub,
    email: claims.email,
    emailVerified: claims.emailVerified,
    emailIsPrivate: claims.isPrivateEmail,
    clientId: claims.aud,
    refreshTokenEnc,
  };

  /** Revoke the token just obtained, after the response. Only ever called
      when this subject has no identity row: revoking ends the person's whole
      authorization for the app, which would break a connected account's own
      stored token. */
  const revokeFresh = () => {
    if (!refreshTokenEnc) return;
    after(() => revokeStoredTokens([{ provider: flow.provider, refreshTokenEnc, clientId: claims.aud }]));
  };

  const existing = await getIdentity(flow.provider, claims.sub);

  if (flow.intent === "signin") {
    if (existing) {
      await touchIdentity(identity);
      await issueSession(existing.user.id);
      return { status: "signed_in", user: existing.user };
    }

    /* The one place an address is looked up, and it is to REFUSE, never to
       select: nothing is created and nothing is attached. Checked again at
       finish, since ten minutes pass in between. */
    if (claims.email && (await getUserByEmail(claims.email))) {
      revokeFresh();
      return { status: "error", code: "email_in_use" };
    }

    // One pending sign-up per browser. Whatever was waiting is replaced, and
    // its Apple token revoked so the abandoned attempt leaves nothing behind.
    const previous = await readFlowCookie(PENDING_COOKIE);
    if (previous) {
      const dropped = await deletePendingSignup(previous);
      if (dropped) after(() => revokeStoredTokens([dropped]));
    }
    const tokenHash = await issueFlowCookie(PENDING_COOKIE);
    await createPendingSignup(tokenHash, { ...identity, nextPath: flow.nextPath });
    return { status: "needs_signup", provider: flow.provider, email: claims.email };
  }

  /* link and reauth both act on an account, so both need the person at the
     keyboard to still be the one the flow row was created for. Without the
     pin, a flow started by A could be finished in a browser signed in as B
     and attach A's chosen identity to B. */
  const current = await getCurrentUser();
  if (!current || !flow.userId || current.id !== flow.userId) {
    if (!existing) revokeFresh();
    return { status: "error", code: "session_mismatch" };
  }

  if (flow.intent === "link") {
    // Re-checked here, not only at begin: the flow row is ten minutes old.
    if (!current.emailVerifiedAt) {
      if (!existing) revokeFresh();
      return { status: "error", code: "verify_email_first" };
    }
    if (existing) {
      if (existing.user.id !== current.id) return { status: "error", code: "identity_in_use" };
      // Already theirs: connecting it again is a no-op that succeeds.
      await touchIdentity(identity);
      return { status: "linked" };
    }
    if (!(await linkIdentity(current.id, identity))) {
      // Lost to a unique index: the account already has another identity for
      // this provider (one per provider in v1).
      revokeFresh();
      return { status: "error", code: "provider_already_linked" };
    }
    after(async () => {
      const send = await sendSecurityNotice(current.email, current.name, "linked", flow.provider);
      if (!send.ok && send.reason === "failed") {
        console.error(`sign-in method notice failed for ${current.id}: ${send.detail}`);
      }
    });
    return { status: "linked" };
  }

  /* reauth. The identity must ALREADY be this account's own — confirming with
     some other Google account proves nothing about this one. */
  if (!existing || existing.user.id !== current.id) {
    if (!existing) revokeFresh();
    return { status: "error", code: "not_linked" };
  }
  if (!flow.purpose) return { status: "error", code: "session_mismatch" };

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionToken) return { status: "error", code: "session_mismatch" };

  await stampSessionReauth(sessionToken, current.id, flow.purpose);
  // Also the moment a missing or stale Apple refresh token gets repaired.
  await touchIdentity(identity);
  return { status: "reauthed", purpose: flow.purpose };
}

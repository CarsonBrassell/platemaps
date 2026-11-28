import { NextRequest, NextResponse, after } from "next/server";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import {
  createOAuthFlow,
  deletePendingSignup,
  pruneExpiredOAuth,
  type OAuthIntent,
  type OAuthMode,
  type ReauthPurpose,
} from "@/lib/db";
import { appUrl } from "@/lib/mail";
import { clientIp } from "@/lib/loginThrottle";
import { isSameOriginRequest } from "@/lib/originCheck";
import { limitOrReject } from "@/lib/rateLimit";
import { confirmIdentity } from "@/lib/reauth";
import { getCurrentUser, SESSION_COOKIE } from "@/lib/session";
import { safeNext } from "@/lib/signInGate";
import { hashToken, newToken } from "@/lib/tokens";
import { revokeStoredTokens } from "@/lib/oauth/apple";
import { OAUTH_ERRORS, type OAuthErrorReason } from "@/lib/oauth/errorCodes";
import { FLOW_COOKIE, PENDING_COOKIE, issueFlowCookie, readFlowCookie } from "@/lib/oauth/flowCookies";
import { PROVIDERS, googleRedirectUri, isProvider, isReady } from "@/lib/oauth/providers";
import { GOOGLE_WEB_CLIENT_ID } from "@/lib/oauth/publicIds";

/** Where a flow may land afterwards. A fixed list, so `returnTo` can never be
    a redirect to anywhere else; `next` goes through `safeNext` separately. */
const RETURN_TO = new Set(["/account", "/m/account", "/account/settings", "/m/account/settings"]);

const PURPOSES = new Set<ReauthPurpose>(["delete", "email", "password", "link"]);

const refuse = (code: OAuthErrorReason, status: number) =>
  NextResponse.json({ error: OAUTH_ERRORS[code], code }, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Start an Apple or Google sign-in. One route for the app and the website.
 *
 * It answers `{ nonce }` for the app (the page hands it to the native sheet)
 * or `{ url }` for the website (the page navigates there). Either way it has
 * first written a single-use row holding the nonce and set an httpOnly cookie
 * naming that row, and those two are what every later step is checked
 * against: a token that does not carry this nonce, or arrives without this
 * cookie, was not started here.
 *
 * **A POST, and same-origin only.** A GET start link could be embedded
 * anywhere, bouncing a visitor into a sign-in they did not ask for; and a
 * link flow has to carry the password, which does not belong in a URL.
 *
 * Three intents:
 * - `signin` — no session needed.
 * - `link` — connect a provider to the signed-in account. Needs a confirmed
 *   account email (otherwise somebody who registered under your address could
 *   attach their own Google to it — they cannot click your verification
 *   link) and a re-authentication. The row is pinned to this user.
 * - `reauth` — a password-less account confirming before one named action.
 *   Refused for an account that has a password: it must use the password.
 */
export async function POST(req: NextRequest) {
  // Ends in a session for whoever completes it, so it gets the login route's
  // guard — see lib/originCheck.ts.
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: "Bad request." }, { status: 403 });
  }

  const limited = await limitOrReject({
    scope: "oauth-begin:ip",
    key: clientIp(req),
    max: 30,
    windowMinutes: 15,
  });
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const { provider, mode, intent, purpose, returnTo, next, password } = body as Record<string, unknown>;

  if (
    !isProvider(provider) ||
    (mode !== "native" && mode !== "web") ||
    (intent !== "signin" && intent !== "link" && intent !== "reauth") ||
    typeof returnTo !== "string" ||
    !RETURN_TO.has(returnTo)
  ) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const flowMode: OAuthMode = mode;
  const flowIntent: OAuthIntent = intent;

  // Off unless this deployment can really finish what it starts. With nothing
  // configured this is where every request ends, before any table is touched.
  if (!isReady(provider, flowMode)) return refuse("unavailable", 400);

  /* The website flow comes back to appUrl()'s host, because that is the only
     redirect address Google has on file. Started from any other host (a
     preview deployment, a www alias) the flow cookie would be set on a host
     the callback never sees, and the visitor would return to an error. Refuse
     here instead, where it can be said plainly. */
  if (flowMode === "web") {
    let expectedHost = "";
    try {
      expectedHost = new URL(appUrl()).host;
    } catch {
      /* falls through to the refusal */
    }
    if (!expectedHost || req.headers.get("host") !== expectedHost) return refuse("unavailable", 400);
  }

  let userId: string | null = null;
  let flowPurpose: ReauthPurpose | null = null;

  if (flowIntent !== "signin") {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Sign in first." }, { status: 401 });
    }
    userId = user.id;

    if (flowIntent === "link") {
      if (!user.emailVerifiedAt) return refuse("verify_email_first", 409);

      // The password is checked here, so it is counted here — shared with the
      // password, delete and disconnect routes. See F11/F12.
      const guessLimited = await limitOrReject({
        scope: "account:reauth",
        key: user.id,
        max: 10,
        windowMinutes: 15,
        message: "Too many password attempts. Try again in a few minutes.",
      });
      if (guessLimited) return guessLimited;

      const cookieStore = await cookies();
      const confirmed = await confirmIdentity(
        user,
        cookieStore.get(SESSION_COOKIE)?.value,
        "link",
        password
      );
      if (confirmed === "wrong_password") {
        return NextResponse.json({ error: "That password isn't right." }, { status: 401 });
      }
      if (confirmed === "reauth_required") return refuse("reauth_required", 401);
    } else {
      if (typeof purpose !== "string" || !PURPOSES.has(purpose as ReauthPurpose)) {
        return NextResponse.json({ error: "Bad request." }, { status: 400 });
      }
      // A provider confirmation is weaker than a password and must never
      // stand in for one. See lib/reauth.ts.
      if (user.passwordHash !== null) {
        return NextResponse.json({ error: "Enter your password instead." }, { status: 400 });
      }
      flowPurpose = purpose as ReauthPurpose;
    }
  }

  /* Starting over abandons whatever this browser had waiting on the finish
     screen, and is also when expired rows get swept. Apple tokens from both
     are revoked after the response, so an abandoned sign-up does not leave
     PlateMaps in someone's "Sign in with Apple" list. */
  const pendingHash = await readFlowCookie(PENDING_COOKIE);
  const dropped = pendingHash ? await deletePendingSignup(pendingHash) : null;
  const expired = await pruneExpiredOAuth().catch(() => []);
  const toRevoke = dropped ? [dropped, ...expired] : expired;
  if (toRevoke.length > 0) after(() => revokeStoredTokens(toRevoke));

  const nonce = newToken();
  /* `state` is its own random value, not the cookie's: it travels in a URL —
     browser history, Google's logs — and the cookie secret never should. The
     row keeps only its hash. PKCE's verifier stays in the row; Google is sent
     its SHA-256, and only the browser that holds the cookie for this row can
     make the server reveal the verifier at the exchange. */
  const state = flowMode === "web" ? newToken() : null;
  const codeVerifier = flowMode === "web" ? randomBytes(32).toString("base64url") : null;

  const tokenHash = await issueFlowCookie(FLOW_COOKIE);
  await createOAuthFlow(tokenHash, {
    provider,
    mode: flowMode,
    intent: flowIntent,
    purpose: flowPurpose,
    nonce,
    codeVerifier,
    stateHash: state ? hashToken(state) : null,
    userId,
    returnTo,
    nextPath: safeNext(typeof next === "string" ? next : null),
  });

  if (flowMode === "native") {
    return NextResponse.json({ nonce }, { headers: { "Cache-Control": "no-store" } });
  }

  // isReady() has already refused Apple on the website, so this is Google.
  const url = new URL(PROVIDERS.google.authorizeUrl);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: GOOGLE_WEB_CLIENT_ID,
    redirect_uri: googleRedirectUri(),
    // An id and an address, nothing else. No profile, no name, no picture.
    scope: "openid email",
    state: state ?? "",
    nonce,
    code_challenge: createHash("sha256").update(codeVerifier ?? "").digest("base64url"),
    code_challenge_method: "S256",
    // Always show the chooser: a re-auth that sailed through on whichever
    // Google account happened to be active would confirm nothing.
    prompt: "select_account",
  }).toString();

  return NextResponse.json({ url: url.toString() }, { headers: { "Cache-Control": "no-store" } });
}

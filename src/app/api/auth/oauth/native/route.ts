import { NextRequest, NextResponse } from "next/server";
import { accountJson } from "@/lib/account";
import { takeOAuthFlow } from "@/lib/db";
import { clientIp } from "@/lib/loginThrottle";
import { isSameOriginRequest } from "@/lib/originCheck";
import { limitOrReject } from "@/lib/rateLimit";
import { completeOAuth, maskEmail } from "@/lib/oauth/complete";
import { OAUTH_ERRORS, type OAuthErrorReason } from "@/lib/oauth/errorCodes";
import { FLOW_COOKIE, clearFlowCookie, readFlowCookie } from "@/lib/oauth/flowCookies";
import { verifyIdToken } from "@/lib/oauth/idToken";
import { allowedAzp, expectedAudience, isProvider, isReady } from "@/lib/oauth/providers";

const NO_STORE = { "Cache-Control": "no-store" };

const refuse = (code: OAuthErrorReason, status: number) =>
  NextResponse.json({ error: OAUTH_ERRORS[code], code }, { status, headers: NO_STORE });

/**
 * Finish a sign-in that happened in the iOS app's native Apple / Google sheet.
 *
 * The page posts the ID token the plugin handed it. **Nothing about that
 * token is believed because of where it came from** — it arrives through page
 * JavaScript, which is the least trusted place in the system. What makes it
 * acceptable is all of:
 *
 * - the httpOnly flow cookie `begin` set in this same browser, naming a row
 *   that is deleted the moment it is read here (single use: a second post of
 *   the same token finds no row);
 * - the token's signature, issuer and expiry (`verifyIdToken`);
 * - its audience being exactly the one the *native* entry point expects — a
 *   token minted for the website is refused here, because this route has no
 *   `state` or PKCE behind it and must not be a way round the one that does;
 * - its nonce being the one in the row just deleted.
 *
 * What happens to a verified identity is `completeOAuth`'s business and is
 * the same as on the website.
 */
export async function POST(req: NextRequest) {
  // Can end in setSessionCookie, so it gets the login route's guard — see
  // lib/originCheck.ts. The Capacitor shell loads the real site, so its
  // requests carry the site's own Origin.
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: "Bad request." }, { status: 403 });
  }

  const limited = await limitOrReject({
    scope: "oauth-native:ip",
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
  const { provider, idToken, authorizationCode } = body as Record<string, unknown>;

  if (!isProvider(provider) || typeof idToken !== "string" || idToken.length === 0) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (!isReady(provider, "native")) return refuse("unavailable", 400);

  // Taken before the token is even looked at: whatever happens next, this
  // attempt is spent.
  const tokenHash = await readFlowCookie(FLOW_COOKIE);
  const flow = tokenHash ? await takeOAuthFlow(tokenHash) : null;
  await clearFlowCookie(FLOW_COOKIE);
  if (!flow) return refuse("expired", 400);

  // A row begun for the website, or for the other provider, is not this
  // attempt's row. It stays spent.
  if (flow.mode !== "native" || flow.provider !== provider) return refuse("expired", 400);

  const audience = expectedAudience(provider, "native");
  if (!audience) return refuse("unavailable", 400);

  const verified = await verifyIdToken(idToken, {
    provider,
    expectedAudience: audience,
    expectedNonce: flow.nonce,
    allowedAzp: allowedAzp(provider),
  });
  if (!verified.ok) {
    // The reason is one fixed word. The token is never logged.
    console.error(`oauth native: ${provider} token refused (${verified.reason})`);
    return refuse("invalid_token", 401);
  }

  /* For the one device test per provider the rollout asks for: which form the
     nonce arrived in, and the public aud/azp. Off unless asked for, and none
     of the three is a secret. Remove with the unused nonce branches. */
  if (process.env.OAUTH_DEBUG_CLAIMS === "1") {
    console.info(
      `oauth native: ${provider} nonce=${verified.claims.nonceForm} aud=${verified.claims.aud} azp=${verified.claims.azp ?? "-"}`
    );
  }

  // Apple's authorization code is opaque and short; the cap only stops a
  // megabyte being forwarded to Apple.
  const appleCode =
    provider === "apple" && typeof authorizationCode === "string" && authorizationCode.length <= 2048
      ? authorizationCode
      : null;

  const outcome = await completeOAuth({ flow, claims: verified.claims, appleCode });

  switch (outcome.status) {
    case "signed_in":
      return NextResponse.json(
        { status: "signed_in", account: accountJson(outcome.user) },
        { headers: NO_STORE }
      );
    case "needs_signup":
      return NextResponse.json(
        {
          status: "needs_signup",
          provider: outcome.provider,
          email: maskEmail(outcome.email),
          needsEmail: outcome.email === null,
        },
        { headers: NO_STORE }
      );
    case "linked":
      return NextResponse.json({ status: "linked" }, { headers: NO_STORE });
    case "reauthed":
      return NextResponse.json({ status: "reauthed", purpose: outcome.purpose }, { headers: NO_STORE });
    default:
      return refuse(outcome.code, outcome.code === "session_mismatch" ? 401 : 409);
  }
}

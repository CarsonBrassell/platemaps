import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getOAuthFlow, takeOAuthFlow } from "@/lib/db";
import { appUrl } from "@/lib/mail";
import { clientIp } from "@/lib/loginThrottle";
import { limitOrReject } from "@/lib/rateLimit";
import { hashToken } from "@/lib/tokens";
import { completeOAuth } from "@/lib/oauth/complete";
import type { OAuthErrorReason } from "@/lib/oauth/errorCodes";
import { FLOW_COOKIE, clearFlowCookie, readFlowCookie } from "@/lib/oauth/flowCookies";
import { verifyIdToken } from "@/lib/oauth/idToken";
import { PROVIDERS, allowedAzp, expectedAudience, googleRedirectUri, isReady } from "@/lib/oauth/providers";
import { GOOGLE_WEB_CLIENT_ID } from "@/lib/oauth/publicIds";

/**
 * Every way out of this route is a redirect built here.
 *
 * - The origin is `appUrl()`, never `request.url`: the Host header is the
 *   caller's to set, and a redirect built from it sends a freshly signed-in
 *   browser wherever the caller likes.
 * - `path` is the flow row's `return_to` (one of four fixed paths) or its
 *   `next_path` (already through `safeNext`), never a query parameter.
 * - The query carries fixed codes only. Nothing Google sent — not its
 *   `error`, not its `error_description` — is ever reflected.
 * - 303, so the browser arrives by GET, and `no-store`, because this response
 *   may be the one that sets the session cookie.
 */
function leave(path: string, params?: Record<string, string>) {
  const url = new URL(path, appUrl());
  for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);
  const res = NextResponse.redirect(url, 303);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

const fail = (path: string, reason: OAuthErrorReason) => leave(path, { oauth: "error", reason });

/** Server to server, with the client secret and the PKCE verifier. */
async function exchangeCode(code: string, codeVerifier: string): Promise<string | null> {
  const secret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!secret) return null;
  try {
    const res = await fetch(PROVIDERS.google.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: GOOGLE_WEB_CLIENT_ID,
        client_secret: secret,
        redirect_uri: googleRedirectUri(),
        code_verifier: codeVerifier,
      }).toString(),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      // The status only: the body can echo the code.
      console.error(`oauth callback: google code exchange failed (${res.status})`);
      return null;
    }
    const data = (await res.json()) as { id_token?: unknown };
    return typeof data.id_token === "string" ? data.id_token : null;
  } catch {
    return null;
  }
}

/**
 * Where Google sends the browser back after "Continue with Google" on the
 * website.
 *
 * A GET, arriving from another site, carrying a `code` anyone could have put
 * in a link — so on its own it proves nothing. Login CSRF is the attack: get
 * a victim's browser to complete *the attacker's* sign-in, and they are now
 * using an account the attacker can read. Three things together close it:
 *
 * 1. **The flow cookie.** httpOnly, set by `begin` in this browser. A link
 *    pasted into any other browser has no cookie and stops at step one.
 * 2. **`state`.** A separate random value that went to Google and came back;
 *    its hash must equal the one in the cookie's row. A callback URL minted
 *    in the attacker's browser carries the attacker's state, which is not
 *    the hash in the victim's row.
 * 3. **PKCE.** The code is only exchangeable with the verifier in that row.
 *
 * Then the row is deleted (single use — replaying the URL in the same browser
 * finds nothing), the code is exchanged server-to-server, and the ID token
 * gets the same checks as the native route with the *website's* audience.
 *
 * Arriving by GET is also why nothing else had to change: the CSP's
 * form-action, COOP and the proxy's cross-site write block are all about
 * POSTs and framing.
 */
export async function GET(req: NextRequest) {
  // Until a row says where this flow came from, the sign-in page is the only
  // sensible place to land.
  const FALLBACK = "/account";

  // Not a write by method, but it does bcrypt-free work on demand: a DB
  // round trip, a call to Google and an RSA verify. The limiter's own 429 is
  // JSON, and this is a page navigation: returned as it is, it would leave
  // the browser on a raw JSON page with no way back. So a tripped limit
  // leaves like every other refusal here, by redirect with a fixed code.
  const limited = await limitOrReject({
    scope: "oauth-callback:ip",
    key: clientIp(req),
    max: 30,
    windowMinutes: 15,
  });
  if (limited) return fail(FALLBACK, "busy");

  if (!isReady("google", "web")) return fail(FALLBACK, "unavailable");

  const tokenHash = await readFlowCookie(FLOW_COOKIE);
  const flow = tokenHash ? await getOAuthFlow(tokenHash) : null;
  if (!tokenHash || !flow) return fail(FALLBACK, "expired");

  /* state is compared BEFORE the row is spent. A cross-site page can make a
     victim's browser GET this URL with a made-up state; if that burned the
     row, any site could cancel a sign-in in flight. A wrong state leaves the
     row alone and ends here. */
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const presented = Buffer.from(hashToken(state), "hex");
  const stored = Buffer.from(flow.stateHash ?? "", "hex");
  if (stored.length !== presented.length || !timingSafeEqual(stored, presented)) {
    return fail(FALLBACK, "expired");
  }

  const taken = await takeOAuthFlow(tokenHash);
  await clearFlowCookie(FLOW_COOKIE);
  // Null means another request spent it between the read and here.
  if (!taken) return fail(flow.returnTo, "expired");

  const back = taken.returnTo;
  if (taken.mode !== "web" || taken.provider !== "google" || !taken.codeVerifier) {
    return fail(back, "expired");
  }

  // "Cancel" on Google's page comes back as ?error=access_denied. Whatever
  // the value, it becomes our own fixed word.
  if (req.nextUrl.searchParams.has("error")) return leave(back, { oauth: "cancelled" });

  const code = req.nextUrl.searchParams.get("code") ?? "";
  if (!code || code.length > 2048) return fail(back, "invalid_token");

  const audience = expectedAudience("google", "web");
  if (!audience) return fail(back, "unavailable");

  const idToken = await exchangeCode(code, taken.codeVerifier);
  if (!idToken) return fail(back, "invalid_token");

  const verified = await verifyIdToken(idToken, {
    provider: "google",
    expectedAudience: audience,
    expectedNonce: taken.nonce,
    allowedAzp: allowedAzp("google"),
  });
  if (!verified.ok) {
    console.error(`oauth callback: google token refused (${verified.reason})`);
    return fail(back, "invalid_token");
  }

  const outcome = await completeOAuth({ flow: taken, claims: verified.claims });

  switch (outcome.status) {
    case "signed_in":
      // The session cookie set inside completeOAuth rides on this redirect:
      // Next merges cookies() writes into whatever Response a Route Handler
      // returns.
      return leave(taken.nextPath ?? back);
    case "needs_signup":
      // `next` rides along the way it does on the sign-in page's own URL; it
      // came out of safeNext, and the page validates it again before use.
      return leave(back, taken.nextPath ? { oauth: "finish", next: taken.nextPath } : { oauth: "finish" });
    case "linked":
      return leave(back, { oauth: "linked" });
    case "reauthed":
      return leave(back, { oauth: "reauthed", for: outcome.purpose });
    default:
      return fail(back, outcome.code);
  }
}

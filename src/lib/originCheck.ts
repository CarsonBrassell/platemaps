import type { NextRequest } from "next/server";

/**
 * Rejects a cross-site POST to a session-issuing route.
 *
 * `req.json()` doesn't require an `application/json` Content-Type, so a
 * plain HTML `<form enctype="text/plain">` submitted from any other site
 * lands here as a normal top-level navigation, JSON body and all —
 * `SameSite=Lax` only blocks a cookie from being *sent* on a cross-site
 * request, not one from being *set* by the response. Checking `Origin` (and
 * falling back to `Referer` for the rare client that omits it) closes that
 * gap without asking every caller for a CSRF token.
 *
 * **The check is relative to the request's own `Host`, not a hardcoded
 * domain.** That covers the production domain, Vercel preview deployments
 * and a `PLATEMAPS_APP_URL` override in one rule instead of three.
 *
 * **The Capacitor iOS shell.** `capacitor.config.ts` points `server.url` at
 * a real `https://` PlateMaps host (see `SITE_URL` there), so the WKWebView
 * navigates to that URL directly and a fetch from inside it carries the same
 * `Origin` as any other browser tab on that domain — the host-relative check
 * above already allows it. `capacitor://localhost` and `https://localhost`
 * are allowed anyway, as a fixed safety net for Capacitor's default
 * bundled-`webDir` origins, in case that config ever stops pointing at a
 * remote URL.
 */
const CAPACITOR_ORIGINS = new Set(["capacitor://localhost", "https://localhost"]);

/** True when `req` looks like it originated from this app, not another site. */
export function isSameOriginRequest(req: NextRequest): boolean {
  const host = req.headers.get("host");
  if (!host) return false;

  const origin = req.headers.get("origin");
  if (origin) {
    if (CAPACITOR_ORIGINS.has(origin)) return true;
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }

  // No Origin header: fall back to Referer. Modern browsers send Origin on
  // every unsafe-method request, so an absent Origin alongside an absent (or
  // mismatched) Referer is treated as cross-site rather than given the
  // benefit of the doubt.
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (CAPACITOR_ORIGINS.has(refererUrl.origin)) return true;
      return refererUrl.host === host;
    } catch {
      return false;
    }
  }

  return false;
}

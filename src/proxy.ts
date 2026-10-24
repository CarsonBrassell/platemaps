import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isPublicPath, signInHrefFor } from "@/lib/signInGate";

/**
 * Sign-in gate, whole app.
 *
 * Calvin's decision, 2026-09-17: the app requires a signed-in session
 * everywhere. Before this, PlateMaps was browsable signed out — the sign-in
 * forms already existed at `/account` and `/m/account` for whoever chose to
 * use them, but nothing forced the choice. This is what forces it.
 *
 * **This checks cookie presence only, never the database.** Proxy (formerly
 * "middleware" — see `node_modules/next/dist/docs/.../proxy.md`) runs on
 * every matched request and cannot afford a query per request, so it only
 * asks "is there a `platemap_session` cookie at all". A present-but-stale or
 * forged cookie sails through here and is caught two layers deeper: every
 * route already calls `getCurrentUser()` (src/lib/session.ts), and
 * `src/components/RequireSignIn.tsx` bounces the client the moment
 * `/api/auth/me` answers `{ user: null }`. Those two layers are load-bearing,
 * not redundant — do not remove either one on the assumption this file makes
 * them unnecessary.
 *
 * Demo mode (2026-10-24): `OPEN_BROWSING` in src/lib/signInGate.ts opens
 * browsing to everyone; only posting, settings, friends and profiles still
 * redirect here. Flip it to false to restore the everywhere-gate.
 */

/** Excludes `_next/*` at the matcher level; the dot-suffix rule below catches
 *  the rest (favicon, manifest, robots.txt, the maplibre worker, logos). */
export const config = {
  matcher: ["/((?!_next/).*)"],
};

/** Must match `SESSION_COOKIE` in `src/lib/session.ts`. Not imported from
 *  there: that module also imports `next/headers`' `cookies()`, which is for
 *  Server Components and Route Handlers, not Proxy — pulling it in here is
 *  the kind of cross-runtime import the Next docs warn against. */
const SESSION_COOKIE_NAME = "platemap_session";

/** True for a static asset or well-known file — anything whose last path
 *  segment contains a dot (`favicon.ico`, `manifest.webmanifest`,
 *  `logo-192.webp`, the maplibre worker `.mjs`, etc). The matcher above only
 *  excludes `_next/*`; this in-code check covers everything under `public/`
 *  and top-level metadata files that path-to-regexp can't cleanly express
 *  alongside the rest of the rule. */
function isStaticAsset(pathname: string): boolean {
  const lastSegment = pathname.slice(pathname.lastIndexOf("/") + 1);
  return lastSegment.includes(".");
}

/** Phones only — iPads report a Mac user agent and stay on the web version,
 *  which is the point: a tablet has the room for it. */
const PHONE_UA = /\b(iPhone|iPod)\b|Android.+Mobile|Windows Phone/i;

/** Web pages that have a phone twin under /m. Prefix entries cover their
 *  `/[id]` children. Anything not listed (drafts, API) is left alone. */
const PHONE_TWIN_EXACT = new Set([
  "/", "/feed", "/account", "/account/settings", "/post", "/friends",
  "/terms", "/privacy", "/forgot-password", "/reset-password", "/verify-email",
]);
const PHONE_TWIN_PREFIXES = ["/restaurant/", "/u/"];

/** Calvin, 2026-10-24: one version on a phone. A phone opening platemaps.com
 *  (or any shared web link) lands on the /m phone app — the same screens the
 *  iOS app loads — instead of the desktop site squeezed onto a phone.
 *  Desktop keeps the web version. Query string rides along so reset and
 *  verify tokens survive the hop. */
function phoneTwinFor(request: NextRequest): string | null {
  const { pathname } = request.nextUrl;
  if (pathname === "/m" || pathname.startsWith("/m/")) return null;
  const ua = request.headers.get("user-agent") ?? "";
  if (!PHONE_UA.test(ua)) return null;
  const hasTwin =
    PHONE_TWIN_EXACT.has(pathname) ||
    PHONE_TWIN_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (!hasTwin) return null;
  return pathname === "/" ? "/m" : `/m${pathname}`;
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isStaticAsset(pathname)) return NextResponse.next();

  const twin = phoneTwinFor(request);
  if (twin) {
    const res = NextResponse.redirect(new URL(twin + search, request.url), 307);
    res.headers.set("Vary", "User-Agent");
    return res;
  }

  if (isPublicPath(pathname)) return NextResponse.next();

  const hasSession = request.cookies.has(SESSION_COOKIE_NAME);
  if (hasSession) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const dest = signInHrefFor(pathname, search);
  return NextResponse.redirect(new URL(dest, request.url), 307);
}

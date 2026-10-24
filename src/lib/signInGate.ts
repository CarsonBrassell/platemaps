/**
 * The one list of "does this path need a signed-in session" and the helpers
 * built on it. `src/proxy.ts` (server, every request) and
 * `src/components/RequireSignIn.tsx` (client, the fallback for a stale
 * cookie) both read this file rather than keeping their own copies — two
 * lists drift, and a path that drifts out of both is a hole.
 *
 * Dependency-free on purpose: the proxy runs before anything server-only is
 * safe to touch, so this file must not import `@/lib/db`, `next/headers`, or
 * anything else that assumes a request/render context. Plain strings and
 * pure functions only.
 */

/** Paths that never require a session, matched exactly. */
const PUBLIC_EXACT_PATHS = new Set<string>([
  "/account",
  "/m/account",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/terms",
  "/privacy",
  // Phone twins of the four pages above: the /m app links to these rather than
  // to the desktop site, and they must be just as reachable signed out.
  "/m/forgot-password",
  "/m/reset-password",
  "/m/verify-email",
  "/m/terms",
  "/m/privacy",
  // The email-link verifier is token-based and deliberately has no session —
  // see the doc comment on the route itself for why.
  "/api/account/email/verify",
]);

/** Path prefixes that never require a session, matched by `startsWith`. */
const PUBLIC_PREFIXES: readonly string[] = ["/api/auth/"];

/**
 * Demo mode, Calvin 2026-10-24: "make it so you dont have to sign in when you
 * open the app for now at least so i can send people a demo version ... if
 * they wana make posts thou they have to sign up."
 *
 * While true, everything is browsable signed out (map, feed, restaurants) and
 * only the paths in `SIGNED_IN_ONLY_PREFIXES` still bounce to sign-in. API
 * routes are not gated here at all in this mode: every route that writes or
 * reads private data already calls `getCurrentUser()` and answers 401 itself,
 * and the handful that don't (restaurants, discover, auth) are public reads.
 *
 * Set to false to go back to the 2026-09-17 rule: sign-in required everywhere.
 */
export const OPEN_BROWSING = true;

/** Still need a session in open-browsing mode: making posts, your own
 *  settings, friends, and user profiles (the profile pages need a viewer for
 *  the block check — see src/app/u/[id]/page.tsx). Matched as the exact path
 *  or the path followed by `/`. */
const SIGNED_IN_ONLY_PREFIXES: readonly string[] = [
  "/post",
  "/m/post",
  "/account/settings",
  "/m/account/settings",
  "/friends",
  "/m/friends",
  "/u",
  "/m/u",
];

/** True when `pathname` may be visited without a session cookie. */
export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT_PATHS.has(pathname)) return true;
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  if (!OPEN_BROWSING) return false;
  if (pathname.startsWith("/api/")) return true;
  return !SIGNED_IN_ONLY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Which sign-in screen a non-public path should bounce to. */
export function signInPathFor(pathname: string): "/account" | "/m/account" {
  return pathname === "/m" || pathname.startsWith("/m/") ? "/m/account" : "/account";
}

/**
 * The full sign-in href for a path that needs a session, carrying `next` so
 * the sign-in screen can return the visitor to where they were.
 */
export function signInHrefFor(pathname: string, search: string): string {
  const base = signInPathFor(pathname);
  const target = `${pathname}${search ?? ""}`;
  return `${base}?next=${encodeURIComponent(target)}`;
}

/**
 * Validates a `next` redirect target. Accepts only a same-origin absolute
 * path: must start with exactly one `/` (rejects `//…`, which a browser
 * reads as protocol-relative to a different host), must not contain a
 * backslash (some browsers normalize `\` to `/`, which is how `/\evil.com`
 * becomes protocol-relative too), must not carry a scheme (`javascript:`,
 * `data:`, …) anywhere after the leading slash, and must not contain any
 * whitespace or control character — the WHATWG URL parser silently strips
 * ASCII tab/CR/LF before parsing, so `/\t/evil.com` would otherwise sail
 * past every check above and resolve to `//evil.com` (protocol-relative).
 *
 * As a last line of defense, the candidate is also resolved against a fixed
 * dummy origin and required to still point at that same origin afterwards —
 * this catches any other parser quirk that turns a "safe-looking" string
 * into a different host without needing to enumerate every trick by name.
 * Returns the normalized `pathname + search + hash` when it passes, or
 * null.
 */
export function safeNext(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  if (/[\s\x00-\x1f\x7f]/.test(raw)) return null;
  if (raw[0] !== "/") return null;
  if (raw[1] === "/") return null;
  if (raw.includes("\\")) return null;
  // A scheme is letters/digits/+/-/. followed by a colon. Checked against
  // everything after the leading slash so "/javascript:alert(1)" is caught
  // without rejecting an ordinary path that happens to contain a colon deep
  // inside a query string.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw.slice(1))) return null;
  const DUMMY_ORIGIN = "http://safe-next.invalid";
  let resolved: URL;
  try {
    resolved = new URL(raw, DUMMY_ORIGIN);
  } catch {
    return null;
  }
  if (resolved.origin !== DUMMY_ORIGIN) return null;
  // The parser collapses dot segments, so "/..//evil.com" comes back with a
  // pathname of "//evil.com" — protocol-relative, and router.replace follows
  // it off-site. The raw[1] check above only sees the input; this sees the
  // output. See F13.
  if (resolved.pathname.startsWith("//")) return null;
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}

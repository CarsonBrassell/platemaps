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
  // The email-link verifier is token-based and deliberately has no session —
  // see the doc comment on the route itself for why.
  "/api/account/email/verify",
]);

/** Path prefixes that never require a session, matched by `startsWith`. */
const PUBLIC_PREFIXES: readonly string[] = ["/api/auth/"];

/** True when `pathname` may be visited without a session cookie. */
export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
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
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}

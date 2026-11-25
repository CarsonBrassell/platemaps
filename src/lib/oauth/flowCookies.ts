import { cookies } from "next/headers";
import { hashToken, newToken } from "@/lib/tokens";

/**
 * The two short-lived cookies a provider sign-in rides on. Server-only.
 *
 * Each holds a random token whose SHA-256 is the primary key of a row — the
 * same hash-in-the-table arrangement as sessions and password resets, so a
 * dumped table hands over nothing a browser could present.
 *
 * - `pm_oauth_flow` names the attempt in flight (`oauth_flows`): the nonce,
 *   and for the website the PKCE verifier and the hash of `state`. It is what
 *   proves the browser finishing a sign-in is the one that started it.
 * - `pm_oauth_pending` names a verified identity waiting on the finish screen
 *   (`oauth_pending_signups`).
 *
 * Both are httpOnly and scoped to `/api/auth/oauth`, so no page script and no
 * other route ever sees them. `sameSite: "lax"` for the reason
 * `setSessionCookie` gives, plus one of its own: Google returns the browser
 * here by a top-level GET from another site, which Lax sends a cookie on and
 * Strict would not. Neither value is ever placed in a URL.
 */

export const FLOW_COOKIE = "pm_oauth_flow";
export const PENDING_COOKIE = "pm_oauth_pending";

const TEN_MINUTES = 60 * 10;

const options = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/api/auth/oauth",
  secure: process.env.NODE_ENV === "production",
};

/** Mints a token, sets it as `name`, and returns its hash for the row. */
export async function issueFlowCookie(name: typeof FLOW_COOKIE | typeof PENDING_COOKIE): Promise<string> {
  const token = newToken();
  const cookieStore = await cookies();
  cookieStore.set(name, token, { ...options, maxAge: TEN_MINUTES });
  return hashToken(token);
}

/** The hash of whatever this browser presented as `name`, or null. */
export async function readFlowCookie(
  name: typeof FLOW_COOKIE | typeof PENDING_COOKIE
): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(name)?.value;
  // newToken() is 64 hex characters; anything else was not issued here.
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  return hashToken(token);
}

/** Path has to match the one it was set with, or the browser keeps it. */
export async function clearFlowCookie(name: typeof FLOW_COOKIE | typeof PENDING_COOKIE): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(name, "", { ...options, maxAge: 0 });
}

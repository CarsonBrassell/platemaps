import { cookies } from "next/headers";
import { getSessionUserId, getUserById, type User } from "@/lib/db";

export const SESSION_COOKIE = "platemap_session";

/**
 * 400 days — the ceiling browsers will honour on a `Set-Cookie` (Chrome and
 * the cookie RFC both clamp anything longer), so this is "as long as we are
 * allowed to ask for".
 *
 * It was 30 days, counted from the moment you signed in and never touched
 * again, so a daily user was signed out a month after signup no matter how
 * much they used the app. `sessions` rows have no expiry column at all — the
 * cookie is the entire clock — which is why lengthening it here is the whole
 * fix rather than half of one.
 */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 400;

/**
 * Writes the session cookie. Every route that hands out or renews a session
 * goes through here, so the flags can't drift between sign-up, log-in and the
 * renewal in `/api/auth/me` — three copies of this options object is exactly
 * how one of them ends up missing `secure`.
 *
 * `secure` is on everywhere except local development, where the dev server is
 * plain HTTP and a secure cookie would simply never be stored — you would be
 * unable to log in on localhost.
 *
 * `sameSite: "lax"` is deliberate and must not become "strict": the app is
 * loaded in an iOS WKWebView pointed at the site, and strict drops the cookie
 * on navigations that arrive from outside the origin.
 *
 * Callable only from a Route Handler or Server Function — Next cannot set a
 * cookie during Server Component rendering.
 */
export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const userId = await getSessionUserId(token);
  if (!userId) return null;

  return getUserById(userId);
}

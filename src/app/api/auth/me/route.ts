import { NextResponse } from "next/server";
import { accountJson } from "@/lib/account";
import { cookies } from "next/headers";
import { getSessionUserId, getUserById } from "@/lib/db";
import { SESSION_COOKIE, setSessionCookie } from "@/lib/session";

/**
 * Who the caller is, and the app's session heartbeat.
 *
 * `AuthProvider` calls this once on every mount, which makes it the natural
 * place to **renew the cookie**: every time you open the app, the expiry is
 * pushed back out to a fresh `SESSION_MAX_AGE`. Without this the cookie
 * counted down from the moment you signed in and nothing could reset it, so
 * an active user was signed out on a fixed schedule regardless of use. The
 * renewal is deliberately a side effect of a call that already happens rather
 * than a new endpoint the client has to remember to hit.
 *
 * Renewed only when the token actually resolves to a user. A stale token gets
 * `{ user: null }` and no `Set-Cookie`, so a dead session is allowed to die.
 * The token itself is not rotated — the `sessions` row is the identity and
 * rotating it here would sign you out of every other device on each app open.
 */
export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ user: null });

  const userId = await getSessionUserId(token);
  if (!userId) return NextResponse.json({ user: null });

  const user = await getUserById(userId);
  if (!user) return NextResponse.json({ user: null });

  await setSessionCookie(token);

  return NextResponse.json({ user: accountJson(user) });
}

import { NextRequest, NextResponse } from "next/server";
import { accountJson } from "@/lib/account";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { getUserByEmail, createSession } from "@/lib/db";
import { setSessionCookie } from "@/lib/session";
import {
  checkLoginAllowed,
  clearLoginFailures,
  clientIp,
  pruneLoginAttempts,
  recordLoginFailure,
} from "@/lib/loginThrottle";

/**
 * Sign in.
 *
 * **Throttled before the password is checked**, which is the whole point of the
 * ordering here: `bcrypt.compare` at cost factor 10 is ~50-100ms of deliberate
 * CPU, so a blocked caller must never reach it. Vercel bills function duration,
 * which made this the cheapest endpoint in the app to attack and the most
 * expensive one to serve. See `lib/loginThrottle.ts` for why the counter lives
 * in Postgres rather than in memory.
 *
 * **The 429 says nothing about whether the account exists.** It is returned on
 * the address alone, before any lookup, so it cannot be used to enumerate
 * users — the same care `/api/auth/forgot` takes with its silent throttle.
 */
export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  if (!email || !password) {
    return NextResponse.json({ error: "Fill in every field." }, { status: 400 });
  }

  const ip = clientIp(req);
  const verdict = await checkLoginAllowed(String(email), ip);
  if (verdict.blocked) {
    const minutes = Math.ceil(verdict.retryAfterSeconds / 60);
    return NextResponse.json(
      { error: `Too many sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` },
      { status: 429, headers: { "Retry-After": String(verdict.retryAfterSeconds) } },
    );
  }

  const user = await getUserByEmail(String(email));

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    /* A throttle that cannot write must not lock anybody out of their account,
       so a failure to record a failure is swallowed. The edge rule in the
       Vercel firewall is the backstop for the case where this is silently
       doing nothing. */
    await recordLoginFailure(String(email), ip).catch(() => {});
    return NextResponse.json(
      { error: "That email and password don't match an account." },
      { status: 401 }
    );
  }

  const token = randomUUID();
  await createSession(token, user.id);

  await setSessionCookie(token);

  /* Housekeeping, and neither is worth failing a good sign-in over: the
     throttle only ever reads inside its window, so leftovers are invisible to
     it either way. */
  await clearLoginFailures(String(email)).catch(() => {});
  await pruneLoginAttempts().catch(() => {});

  return NextResponse.json(accountJson(user));
}

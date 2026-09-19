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
import { MAX_PASSWORD_BYTES } from "@/lib/password";
import { isSameOriginRequest } from "@/lib/originCheck";

/**
 * A hash of a password nobody typed, generated once at module load rather
 * than per request — `bcryptjs` is deterministic enough on cost factor 10
 * that a constant hash still costs the same ~50-100ms to compare against, and
 * paying that hashing cost on every cold start would be its own small DoS
 * surface. Its only job is to give the "user doesn't exist" branch below the
 * same `bcrypt.compare` shape as the "user exists" branch — see the timing
 * note there.
 */
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing-parity", 10);

/**
 * Cuts a string down to its first `maxBytes` UTF-8 bytes, matching how
 * `bcrypt` itself only ever reads the first `MAX_PASSWORD_BYTES` of a
 * password (see the note on that constant in `lib/password.ts`). Uncapped,
 * a caller could hand `bcrypt.compare` a multi-megabyte string and spend
 * real CPU on it before the algorithm's own truncation ever kicks in — the
 * same duration-billing concern `loginThrottle.ts` exists for, just on the
 * input side instead of the attempt count.
 *
 * Trims off a trailing partial character rather than leaving a corrupt
 * replacement character in the compared string.
 */
function capToBytes(value: string, maxBytes: number): string {
  const encoded = new TextEncoder().encode(value);
  if (encoded.length <= maxBytes) return value;
  return new TextDecoder().decode(encoded.slice(0, maxBytes)).replace(/�+$/, "");
}

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
 *
 * **`bcrypt.compare` always runs, known account or not.** A missing user used
 * to skip straight to the 401, which made this endpoint answer "does this
 * email exist" through nothing but response latency — free of the throttle,
 * free of the uniform-response care `/api/auth/forgot` takes. Comparing
 * against `DUMMY_HASH` when there's no user keeps both branches paying the
 * same ~50-100ms, with the same 401 body either way.
 */
export async function POST(req: NextRequest) {
  // A cross-site <form enctype="text/plain"> can reach this route as a top-
  // level navigation without ever touching CORS, and SameSite=Lax does not
  // stop a cookie being *set* by that response — see lib/originCheck.ts.
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: "Bad request." }, { status: 403 });
  }

  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (!parsed || typeof parsed !== "object") {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const { email, password } = parsed as Record<string, unknown>;

  if (!email || !password || typeof password !== "string") {
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
  const cappedPassword = capToBytes(password, MAX_PASSWORD_BYTES);
  const passwordOk = await bcrypt.compare(cappedPassword, user ? user.passwordHash : DUMMY_HASH);

  if (!user || !passwordOk) {
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

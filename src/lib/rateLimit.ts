import { NextResponse } from "next/server";
import { sql } from "@/lib/sqlClient";

/**
 * A generic write-route limiter, next to the login-specific one in
 * `lib/loginThrottle.ts`.
 *
 * **Same reason it lives in Postgres and not a `Map`**: every serverless
 * invocation can land on a different instance and instances scale to zero, so
 * an in-process counter resets constantly — correct in `npm run dev`, silently
 * open in production. See the long note at the top of `loginThrottle.ts` for
 * the full argument; this file does not repeat it, it inherits it.
 *
 * **One table, many limits.** `login_attempts` is shaped around one specific
 * throttle (two keys, one fixed window); everything else in the app just
 * needs "at most N of these in M minutes" against an arbitrary key, so this
 * uses its own `rate_limit_hits (scope, key, at)` table instead of bending
 * `login_attempts` to fit. `scope` names the limit (e.g. `"signup:ip"`,
 * `"posts:user"`) and `key` names the caller inside it (an IP or a user id);
 * a window's count is grouped on the pair, so every route's counters live in
 * one table without colliding.
 *
 * **Fails open.** A route that cannot reach the counter must still serve real
 * users — the alternative is one flaky query taking down the whole write
 * path. `checkLimit` and `recordHit` therefore never throw into the caller;
 * `limitOrReject` treats a failed check as "not limited" the same way
 * `loginThrottle` swallows a failed `recordLoginFailure`.
 */

export interface RateLimitOptions {
  /** This route's own name for the counter, e.g. `"signup"` or `"posts"`. */
  scope: string;
  /** What's being limited — an IP, a user id, or another caller-chosen key. */
  key: string;
  /** How many hits are allowed inside the window before the next one is rejected. */
  max: number;
  /** The window's length, in minutes. */
  windowMinutes: number;
  /** Overrides the default 429 body's `error` string. */
  message?: string;
}

interface Verdict {
  blocked: boolean;
  retryAfterSeconds: number;
}

async function checkLimit(opts: RateLimitOptions): Promise<Verdict> {
  const rows = await sql`
    SELECT count(*)::int AS hits, max(at) AS last_at
    FROM rate_limit_hits
    WHERE scope = ${opts.scope} AND key = ${opts.key}
      AND at > now() - (${opts.windowMinutes} || ' minutes')::interval
  `;
  const row = rows[0];
  const hits = Number(row?.hits ?? 0);
  if (hits < opts.max) return { blocked: false, retryAfterSeconds: 0 };

  /* Counted from the most recent hit, not the oldest — same reasoning as
     loginThrottle: someone hammering a limited route stays limited rather
     than the window sliding out from under them while they wait. */
  const lastAt = row?.last_at ? Date.parse(String(row.last_at)) : Date.now();
  const elapsedSeconds = Math.floor((Date.now() - lastAt) / 1000);
  return {
    blocked: true,
    retryAfterSeconds: Math.max(1, opts.windowMinutes * 60 - elapsedSeconds),
  };
}

/** Records one hit. Prunes its own window roughly one write in twenty, which
    keeps the table from growing unbounded without doubling every request's
    write cost — the same "opportunistic, not scheduled" housekeeping
    `pruneLoginAttempts` describes, just probabilistic instead of tied to a
    specific route's success path (this one has no single "success" moment
    shared by every caller). */
async function recordHit(scope: string, key: string, windowMinutes: number): Promise<void> {
  await sql`INSERT INTO rate_limit_hits (scope, key) VALUES (${scope}, ${key})`;
  if (Math.random() < 0.05) {
    await sql`
      DELETE FROM rate_limit_hits
      WHERE scope = ${scope} AND at < now() - (${windowMinutes} || ' minutes')::interval
    `;
  }
}

/**
 * Checks and records one attempt against a limit, in one call.
 *
 * Returns a ready-to-return 429 `NextResponse` (with `Retry-After` set) when
 * the caller is over the limit, or `null` when the request should proceed.
 * The typical call site is the first line of a route handler after auth:
 *
 * ```ts
 * const limited = await limitOrReject({ scope: "posts:user", key: user.id, max: 20, windowMinutes: 60 });
 * if (limited) return limited;
 * ```
 *
 * A failure to reach the counter — read or write — is swallowed and treated
 * as "allowed": see the module doc for why a rate limiter must fail open.
 */
export async function limitOrReject(opts: RateLimitOptions): Promise<NextResponse | null> {
  let verdict: Verdict;
  try {
    verdict = await checkLimit(opts);
  } catch {
    return null;
  }

  if (verdict.blocked) {
    return NextResponse.json(
      { error: opts.message ?? "Too many requests. Try again later." },
      { status: 429, headers: { "Retry-After": String(verdict.retryAfterSeconds) } },
    );
  }

  recordHit(opts.scope, opts.key, opts.windowMinutes).catch(() => {
    /* A throttle that cannot write must not block a request it just allowed. */
  });
  return null;
}

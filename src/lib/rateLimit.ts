import { NextResponse } from "next/server";
import { clientIp } from "@/lib/loginThrottle";
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
 * path. `limitOrReject` treats a failed `checkAndRecord` as "not limited" the
 * same way `loginThrottle` swallows a failed `recordLoginFailure`.
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

/**
 * Records this hit, then counts the window, as two statements. The order and
 * the split are the whole design.
 *
 * Counting first lets every concurrent request read the same total and pass,
 * so the cap only binds traffic slow enough to arrive one at a time. Putting
 * both in one statement (a CTE) looks atomic and has the same hole: a statement
 * cannot see its own insert, or anyone's that isn't committed when it starts,
 * so a burst of a hundred all counted zero.
 *
 * Committed first and counted after, the k-th insert to land always counts at
 * least k, so at most `max` requests can pass however they are timed. It costs
 * a second round trip, which is the price of the limit meaning anything.
 */
async function checkAndRecord(opts: RateLimitOptions): Promise<Verdict> {
  await sql`INSERT INTO rate_limit_hits (scope, key) VALUES (${opts.scope}, ${opts.key})`;
  const rows = await sql`
    SELECT count(*)::int AS hits, max(at) AS last_at
    FROM rate_limit_hits
    WHERE scope = ${opts.scope} AND key = ${opts.key}
      AND at > now() - (${opts.windowMinutes} || ' minutes')::interval
  `;
  const row = rows[0];
  const hits = Number(row?.hits ?? 0);
  if (hits <= opts.max) return { blocked: false, retryAfterSeconds: 0 };

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

/** Opportunistic housekeeping, unrelated to the atomicity of the check
    above: prunes this scope's expired rows roughly one call in twenty, which
    keeps the table from growing unbounded without doubling every request's
    write cost. Fire-and-forget — a failed prune must not affect the caller. */
function pruneOccasionally(scope: string, windowMinutes: number): void {
  if (Math.random() < 0.05) {
    sql`
      DELETE FROM rate_limit_hits
      WHERE scope = ${scope} AND at < now() - (${windowMinutes} || ' minutes')::interval
    `.catch(() => {});
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
    verdict = await checkAndRecord(opts);
  } catch {
    return null;
  }

  pruneOccasionally(opts.scope, opts.windowMinutes);

  if (verdict.blocked) {
    return NextResponse.json(
      { error: opts.message ?? "Too many requests. Try again later." },
      { status: 429, headers: { "Retry-After": String(verdict.retryAfterSeconds) } },
    );
  }

  return null;
}

/**
 * The limit on Discover's "For me" POST, which ranks every place in the corpus
 * against the viewer's history and so costs real CPU, unlike the plain query.
 *
 * Signed in, it is counted per user under its own `forme:user` scope (120 per
 * 10 minutes). It is deliberately not the `taste:user` counter that
 * `/api/account/taste` spends on writes: a tuning session is a run of
 * love/skip/been taps, each one a write and then a For me re-read, so one
 * shared allowance of 120 ran dry after about 60 taps, with a 429 on the very
 * request that was meant to show the result. Separate counters give each route
 * its own 120. Signed out there is no user to count, so it is counted per IP
 * under `forme:ip`, with the same numbers -- a visitor clicking through filters
 * makes a request per click, and the limit is there to stop a loop, not a
 * person. `OPEN_BROWSING` makes the signed-out path public, which is why it
 * needs a counter at all.
 *
 * With no IP to count (neither proxy header present, which is local dev and
 * nothing Vercel serves) the call is let through: `clientIp` would answer
 * `"unknown"` for all of them, and one shared bucket would lock everyone out
 * the moment it filled.
 *
 * The 429 is private and uncacheable like every other answer from this path.
 * Use as `limitOrReject` is used: `const limited = await limitForMe(req, user);
 * if (limited) return limited;`.
 */
export async function limitForMe(
  req: Request,
  user: { id: string } | null,
): Promise<NextResponse | null> {
  let opts: RateLimitOptions;
  if (user) {
    opts = { scope: "forme:user", key: user.id, max: 120, windowMinutes: 10 };
  } else {
    const ip = clientIp(req);
    if (ip === "unknown") return null;
    opts = { scope: "forme:ip", key: ip, max: 120, windowMinutes: 10 };
  }
  const limited = await limitOrReject(opts);
  limited?.headers.set("Cache-Control", "private, no-store");
  return limited;
}

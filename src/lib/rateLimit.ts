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
 * path. `limitOrReject` treats a failed `checkAndRecord` as "not limited" the
 * same way `loginThrottle` swallows a failed `recordLoginFailure`.
 *
 * **Except where the limit is the protection itself.** `limitOrReject` has a
 * second form that takes an array of limits and `{ failClosed: true }`. It is
 * used by `/api/contacts/match` and the `/api/account/phone/*` routes, and by
 * nothing else. Those routes answer "does this address belong to a member"
 * and send paid text messages, so a counter that cannot be read must stop the
 * request (503) rather than wave it through: an attacker who could make the
 * counter fail would otherwise get unlimited lookups, or unlimited spend.
 * The array form also looks before it writes — see `checkAll` — so a refused
 * attempt costs the caller nothing. Every other route keeps the single-object
 * form, whose behaviour is unchanged.
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

/** The longest window any limit in the app uses, in days. Nothing in
    `rate_limit_hits` is worth keeping past it, whatever its scope. A limit
    with a longer window must raise this in the same change. */
const LONGEST_WINDOW_DAYS = 30;

/** Opportunistic housekeeping, unrelated to the atomicity of the check
    above: prunes this scope's expired rows roughly one call in twenty, which
    keeps the table from growing unbounded without doubling every request's
    write cost. Fire-and-forget — a failed prune must not affect the caller.

    `windowMinutes` MUST be the scope's own full window. The delete is by
    scope, not by key, so a shorter window passed here throws away rows that
    a longer limit on the same scope is still counting, for every caller. */
function pruneOccasionally(scope: string, windowMinutes: number): void {
  if (Math.random() < 0.05) {
    sql`
      DELETE FROM rate_limit_hits
      WHERE scope = ${scope} AND at < now() - (${windowMinutes} || ' minutes')::interval
    `.catch(() => {});
    /* And every scope's rows past the longest window. A scope is otherwise
       only swept when that same scope is hit again, so a quiet one (the
       per-number phone counter, whose key is a keyed hash of a phone number)
       would keep its rows for as long as it stayed quiet. The privacy policy
       says these counters last at most 30 days; this is what makes it true
       on any limiter traffic at all. */
    sql`
      DELETE FROM rate_limit_hits
      WHERE at < now() - (${LONGEST_WINDOW_DAYS} || ' days')::interval
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
export async function limitOrReject(opts: RateLimitOptions): Promise<NextResponse | null>;
/**
 * Several limits as one decision — see `checkAll`. Nothing is recorded unless
 * every limit has room, and with `failClosed` an unreachable counter is a 503
 * instead of a pass.
 */
export async function limitOrReject(
  checks: RateLimitOptions[],
  behaviour?: LimitBehaviour,
): Promise<NextResponse | null>;
export async function limitOrReject(
  opts: RateLimitOptions | RateLimitOptions[],
  behaviour?: LimitBehaviour,
): Promise<NextResponse | null> {
  if (Array.isArray(opts)) return limitAllOrReject(opts, behaviour);

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

/* ---------- The array form: several limits, one decision ---------- */

export interface LimitBehaviour {
  /**
   * What an unreachable counter means. Off (the default) it means "allowed",
   * like the single form. On, it means 503 — for the routes where the limit is
   * the only thing between a stranger and an enumeration or a bill.
   */
  failClosed?: boolean;
}

type GroupVerdict =
  | { blocked: false }
  | { blocked: true; scope: string; message?: string; retryAfterSeconds: number };

/** Hits inside the window, and when the oldest of them was made. */
async function peek(check: RateLimitOptions): Promise<{ hits: number; firstAt: number | null }> {
  const rows = await sql`
    SELECT count(*)::int AS hits, min(at) AS first_at
    FROM rate_limit_hits
    WHERE scope = ${check.scope} AND key = ${check.key}
      AND at > now() - (${check.windowMinutes} || ' minutes')::interval
  `;
  const row = rows[0];
  const firstAt = row?.first_at ? Date.parse(String(row.first_at)) : NaN;
  return { hits: Number(row?.hits ?? 0), firstAt: Number.isNaN(firstAt) ? null : firstAt };
}

/**
 * Seconds until a full window has room again: when its OLDEST hit ages out.
 *
 * The single form counts from the newest hit, so hammering keeps the caller
 * locked. That is right there, because every attempt is recorded. Here a
 * refused attempt records nothing, so the oldest hit is the honest answer and
 * the number only ever shrinks while the caller waits.
 */
function secondsUntilRoom(check: RateLimitOptions, firstAt: number | null): number {
  if (firstAt === null) return 1;
  return Math.max(1, Math.ceil((firstAt + check.windowMinutes * 60_000 - Date.now()) / 1000));
}

/** The full limit a caller should be told about: the one that clears last. */
function slowestToClear(
  checks: RateLimitOptions[],
  seen: { hits: number; firstAt: number | null }[],
  isFull: (hits: number, max: number) => boolean,
): GroupVerdict {
  let worst: GroupVerdict = { blocked: false };
  checks.forEach((check, i) => {
    if (!isFull(seen[i].hits, check.max)) return;
    const retryAfterSeconds = secondsUntilRoom(check, seen[i].firstAt);
    if (!worst.blocked || retryAfterSeconds > worst.retryAfterSeconds) {
      worst = { blocked: true, scope: check.scope, message: check.message, retryAfterSeconds };
    }
  });
  return worst;
}

/**
 * Look at every limit, and only if all have room record one hit on each.
 *
 * **Why look first here, when `checkAndRecord` explains why not to.** Chaining
 * single limiters records as it goes: a request stopped by its third limit has
 * already spent a hit on the first two, and a retry while blocked both spends
 * more and pushes the wait out. On a route with a quota of three a day that
 * punishes exactly the honest person who tapped twice. So this reads all of
 * them, and a request that any one refuses writes nothing.
 *
 * **The burst guarantee is kept by the second half.** Looking first alone has
 * the hole `checkAndRecord` describes: a hundred simultaneous requests all
 * read "room" together. So after the look, this still inserts and then counts
 * again, in that order, and refuses if any count came out over its max. The
 * k-th insert to land counts at least k, exactly as in the single form.
 *
 * A request that loses that second count takes its own rows back out, so a
 * double tap that collides does not burn the quota it never got to use. That
 * cannot let extra requests through: a request only passes when the count
 * that includes its own row is within the max, and the rows of requests that
 * passed are never removed. The same goes for a re-count that cannot be read:
 * the request is about to be refused (or, failing open, was never counted on),
 * so its rows come out before the error travels up.
 *
 * **A lost re-count is told to retry in a second, not in a window.** Reaching
 * the re-count means the first look found room on every limit, so being over
 * now can only come from requests that landed at the same moment — and some
 * or all of those are taking their rows back out too. The window-based wait
 * would tell a double tap on a daily limit to come back tomorrow when a retry
 * a second later would pass. If the others really did fill the limit, that
 * retry gets the truthful wait from the first look.
 */
async function checkAll(checks: RateLimitOptions[]): Promise<GroupVerdict> {
  const before = await Promise.all(checks.map(peek));
  const full = slowestToClear(checks, before, (hits, max) => hits >= max);
  if (full.blocked) return full;

  // One statement, so the hit lands on every limit or on none of them.
  const inserted = await sql`
    INSERT INTO rate_limit_hits (scope, key)
    SELECT * FROM unnest(${checks.map((c) => c.scope)}::text[], ${checks.map((c) => c.key)}::text[])
    RETURNING id
  `;

  const ids = inserted.map((r) => String(r.id));
  const takeBack = async () => {
    try {
      await sql`DELETE FROM rate_limit_hits WHERE id = ANY(${ids}::bigint[])`;
    } catch {
      /* The rows stay and count against the caller. Stricter, never looser. */
    }
  };

  let after: { hits: number; firstAt: number | null }[];
  try {
    after = await Promise.all(checks.map(peek));
  } catch (error) {
    await takeBack();
    throw error;
  }
  const over = slowestToClear(checks, after, (hits, max) => hits > max);
  if (!over.blocked) return over;

  await takeBack();
  return { ...over, retryAfterSeconds: 1 };
}

async function limitAllOrReject(
  checks: RateLimitOptions[],
  behaviour: LimitBehaviour = {},
): Promise<NextResponse | null> {
  if (checks.length === 0) return null;

  let verdict: GroupVerdict;
  try {
    verdict = await checkAll(checks);
  } catch {
    if (!behaviour.failClosed) return null;
    return limiterUnavailable();
  }

  for (const check of checks) pruneOccasionally(check.scope, check.windowMinutes);

  if (!verdict.blocked) return null;

  // `scope` lets the screen say "today" or "this month" instead of "later".
  return NextResponse.json(
    {
      error: verdict.message ?? "Too many requests. Try again later.",
      code: "rate-limited",
      scope: verdict.scope,
    },
    { status: 429, headers: { "Retry-After": String(verdict.retryAfterSeconds) } },
  );
}

/** The fail-closed answer, shared with routes that read a counter themselves. */
export function limiterUnavailable(): NextResponse {
  return NextResponse.json(
    { error: "Try again in a moment.", code: "limiter-unavailable" },
    { status: 503, headers: { "Retry-After": "5" } },
  );
}

/**
 * How many hits a counter holds in its window. Read only.
 *
 * Throws when the table cannot be reached — the caller decides what that
 * means, and for the callers that exist it means stop.
 *
 * `windowMinutes` is only how far back to COUNT, and may be shorter than the
 * scope's limit ("did this account ask for a code in the last half hour" on a
 * 30-day counter). It is therefore never used to prune. A counter that is not
 * fed through `limitOrReject` has nothing else sweeping it, so its callers
 * pass `pruneWindowMinutes` — the scope's FULL window, never a shorter one;
 * see `pruneOccasionally` for what a short one destroys.
 */
export async function countHits(
  scope: string,
  key: string,
  windowMinutes: number,
  pruneWindowMinutes?: number,
): Promise<number> {
  const rows = await sql`
    SELECT count(*)::int AS hits
    FROM rate_limit_hits
    WHERE scope = ${scope} AND key = ${key}
      AND at > now() - (${windowMinutes} || ' minutes')::interval
  `;
  if (pruneWindowMinutes !== undefined) pruneOccasionally(scope, pruneWindowMinutes);
  return Number(rows[0]?.hits ?? 0);
}

/**
 * Adds `n` hits to a counter at once, for totals that are not "one per
 * request" (how many contact matches were handed out today). The rows hold a
 * scope, a key and a time like every other row here, and nothing else.
 */
export async function recordHits(scope: string, key: string, n: number): Promise<void> {
  const count = Math.floor(n);
  if (!(count >= 1)) return;
  await sql`
    INSERT INTO rate_limit_hits (scope, key)
    SELECT ${scope}::text, ${key}::text FROM generate_series(1, ${count}::int)
  `;
}

/**
 * Gives back the most recent hit on one counter. For a quota that was charged
 * for something that then provably did not happen (a text the provider
 * refused to send). Only ever one row, and only the caller's own key, so it
 * can never make a limit looser than "that attempt did not count".
 */
export async function refundHit(scope: string, key: string): Promise<void> {
  await sql`
    DELETE FROM rate_limit_hits
    WHERE id = (
      SELECT id FROM rate_limit_hits
      WHERE scope = ${scope} AND key = ${key}
      ORDER BY at DESC
      LIMIT 1
    )
  `;
}

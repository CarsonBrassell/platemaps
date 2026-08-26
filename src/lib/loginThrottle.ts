/* Which driver this is depends on DATABASE_URL — see lib/sqlClient.
   Importing it directly, the way lib/db.ts does, is what makes this module
   server-only. */
import { sql } from "@/lib/sqlClient";

/**
 * The sign-in throttle. Server-only, like `lib/db.ts`, which it borrows the
 * connection from.
 *
 * **Why this is in Postgres and not a `Map`.** Every serverless invocation may
 * land on a different instance and instances scale to zero, so an in-process
 * counter resets constantly — it works perfectly in `npm run dev`, where there
 * is one long-lived process, and silently limits nothing in production. That
 * failure is invisible: the code looks right, the tests pass locally, and the
 * endpoint stays wide open. The email throttle in `lib/emailVerification.ts`
 * already reaches for the database for the same reason; this follows it rather
 * than inventing a second way of doing throttles.
 *
 * **Why the login route specifically.** `bcrypt.compare` at cost factor 10 is
 * ~50-100ms of deliberate CPU, and it sat on the one unauthenticated endpoint
 * in the app with no attempt counter at all. That is two problems from one
 * hole: unlimited password guesses against a known address, and — since Vercel
 * bills function *duration* — a very efficient way for a stranger to spend our
 * money. A Vercel firewall rule caps this at the edge too; this is the half
 * that keeps working if the plan changes, the app moves off Vercel, or the
 * attacker rotates IPs.
 *
 * **Two keys, deliberately.** Locking on email alone lets one attacker with a
 * botnet grind an account from a thousand addresses. Locking on IP alone locks
 * out a whole coffee shop or a carrier NAT the moment one person fat-fingers a
 * password. So each is counted separately and either can trip, with the
 * per-email ceiling tighter than the per-IP one.
 *
 * **Only failures are recorded.** A successful sign-in clears the email's
 * history, so someone who mistypes twice and then gets it right is not carrying
 * a strike into next week.
 */

/** How far back a failure still counts against you. */
const WINDOW_MINUTES = 15;

/**
 * Failed attempts allowed per window.
 *
 * Email is the tighter of the two because it is the one an attacker targets: a
 * real person who has forgotten their password tries three or four times and
 * then uses the reset link. IP is looser because it is shared — one household,
 * one office, one carrier NAT — and locking it out punishes bystanders.
 */
const MAX_PER_EMAIL = 8;
const MAX_PER_IP = 30;

export type ThrottleVerdict =
  | { blocked: false }
  | { blocked: true; retryAfterSeconds: number };

/**
 * The caller's address, as far as it can be trusted.
 *
 * `x-forwarded-for` is client-settable in general, but on Vercel the platform
 * overwrites it at the edge, so the leftmost entry is the real peer here. Do
 * not port this to a host that passes the header through untouched without
 * revisiting it — there, an attacker sets the header and gets a fresh bucket
 * per request.
 *
 * Falling back to a constant when there is no header is intentional: it means
 * an unidentifiable caller shares one bucket with every other unidentifiable
 * caller, which fails closed rather than handing out an unlimited one.
 */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Normalised so `Carson@x.com ` and `carson@x.com` share one bucket. */
const key = (email: string) => email.trim().toLowerCase();

/**
 * Whether this sign-in attempt should be allowed to reach bcrypt.
 *
 * Called *before* the password is checked — the point is to not spend the CPU,
 * so a blocked caller never reaches the compare.
 */
export async function checkLoginAllowed(email: string, ip: string): Promise<ThrottleVerdict> {
  const rows = await sql`
    SELECT
      count(*) FILTER (WHERE email = ${key(email)}) AS email_fails,
      count(*) FILTER (WHERE ip = ${ip}) AS ip_fails,
      max(attempted_at) FILTER (WHERE email = ${key(email)} OR ip = ${ip}) AS last_at
    FROM login_attempts
    WHERE attempted_at > now() - (${WINDOW_MINUTES} || ' minutes')::interval
      AND (email = ${key(email)} OR ip = ${ip})
  `;

  const row = rows[0];
  const emailFails = Number(row?.email_fails ?? 0);
  const ipFails = Number(row?.ip_fails ?? 0);
  if (emailFails < MAX_PER_EMAIL && ipFails < MAX_PER_IP) return { blocked: false };

  /* Counted from the most recent failure, not the oldest, so hammering a locked
     account keeps it locked rather than letting the window slide out from under
     the attacker while they wait. */
  const lastAt = row?.last_at ? Date.parse(String(row.last_at)) : Date.now();
  const elapsedSeconds = Math.floor((Date.now() - lastAt) / 1000);
  return {
    blocked: true,
    retryAfterSeconds: Math.max(1, WINDOW_MINUTES * 60 - elapsedSeconds),
  };
}

/** Records one failure. Never throws into the request path — see the route. */
export async function recordLoginFailure(email: string, ip: string): Promise<void> {
  await sql`
    INSERT INTO login_attempts (email, ip) VALUES (${key(email)}, ${ip})
  `;
}

/**
 * Wipes an address's failures after a correct password.
 *
 * Scoped to the email rather than the IP: the person who just proved who they
 * are has earned a clean slate, but the address they came from may be shared
 * with whoever was guessing, and that pressure should stay on.
 */
export async function clearLoginFailures(email: string): Promise<void> {
  await sql`DELETE FROM login_attempts WHERE email = ${key(email)}`;
}

/**
 * Drops rows that are past the window.
 *
 * Called opportunistically from the login route rather than on a schedule —
 * the table is only ever read through a `now() - interval` predicate, so stale
 * rows are already invisible to the throttle and this is housekeeping, not
 * correctness. There is no cron in this project and this does not justify one.
 */
export async function pruneLoginAttempts(): Promise<void> {
  await sql`
    DELETE FROM login_attempts
    WHERE attempted_at < now() - (${WINDOW_MINUTES} || ' minutes')::interval
  `;
}

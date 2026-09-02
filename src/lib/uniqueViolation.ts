/**
 * Turning a Postgres unique-constraint violation into an answer a person can
 * act on.
 *
 * **Why this exists rather than just checking first.** Signup already asks
 * `getUserByName` whether a username is free, and that check is correct — it is
 * how someone gets "That username is already taken" instead of a stack trace.
 * But a check followed by an insert is two statements, and two people can pass
 * the same check before either of them writes. Measured, not theorised: four
 * concurrent signups on one brand-new username returned **three HTTP 500s and
 * one success**. The unique index did its job and the data stayed clean; the
 * three losers just got an unhandled driver error instead of the same clear
 * message the sequential path gives them.
 *
 * So the pre-check stays (it is the common case and it costs one cheap query),
 * and this is the backstop that makes the race produce the same answer as the
 * queue. **The database is the authority on uniqueness** — the check is an
 * optimisation for the error message, never the thing enforcing it.
 *
 * The constraint names are the contract. They are the ones in
 * `scripts/migrate.mjs`; if an index is ever renamed there, rename it here too
 * or the violation falls through to a 500 again.
 */

/** Postgres class 23 integrity violation: `unique_violation`. */
const UNIQUE_VIOLATION = "23505";

/**
 * The constraint that was violated, or null if `error` is something else.
 *
 * Typed loosely on purpose: this receives whatever the driver threw, and the
 * point of the function is to decide whether that unknown is the one shape we
 * know how to answer.
 */
export function uniqueViolationConstraint(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as { code?: unknown; constraint?: unknown };
  if (candidate.code !== UNIQUE_VIOLATION) return null;
  return typeof candidate.constraint === "string" ? candidate.constraint : null;
}

/**
 * The message for a violated `users` constraint, or null if it isn't one of
 * ours — in which case the caller must rethrow rather than dress up an error it
 * does not understand as a friendly 409.
 *
 * These read identically to the pre-check messages in the signup route on
 * purpose: which of the two paths caught it is our business, not the visitor's.
 */
export function userConflictMessage(error: unknown): string | null {
  switch (uniqueViolationConstraint(error)) {
    case "idx_users_name_unique":
      return "That username is already taken.";
    case "users_email_key":
      return "An account with that email already exists.";
    default:
      return null;
  }
}

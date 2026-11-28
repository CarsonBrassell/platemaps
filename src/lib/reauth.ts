import bcrypt from "bcryptjs";
import { consumeSessionReauth, type ReauthPurpose, type User } from "@/lib/db";

/**
 * "Prove it is still you" for the actions a session alone must not authorize:
 * deleting the account, moving its email, setting its password, connecting a
 * sign-in method. Server-only.
 *
 * The existing routes explain why a session is not enough — the cookie lives
 * 400 days on a device that gets lent. This is the one place that decides
 * what *is* enough, so the four callers cannot disagree:
 *
 * - **The account has a password: the password, always.** A provider
 *   confirmation is NOT accepted in its place. Otherwise connecting Google
 *   would quietly downgrade every password-protected action to "is Google
 *   still signed in on this browser".
 * - **No password: a provider confirmation**, stamped on this session by a
 *   re-auth flow, for exactly this purpose, under three minutes old, spent
 *   here (`consumeSessionReauth` is one atomic statement, so it works once).
 *
 * Callers run their own limiter BEFORE calling this — a wrong password here
 * is a guess, and guesses have to be counted before bcrypt, not after.
 */
export type IdentityConfirmation = "ok" | "wrong_password" | "reauth_required";

export async function confirmIdentity(
  user: User,
  sessionToken: string | undefined,
  purpose: ReauthPurpose,
  password?: unknown
): Promise<IdentityConfirmation> {
  if (user.passwordHash !== null) {
    if (typeof password !== "string" || password.length === 0) return "wrong_password";
    return (await bcrypt.compare(password, user.passwordHash)) ? "ok" : "wrong_password";
  }

  if (!sessionToken) return "reauth_required";
  return (await consumeSessionReauth(sessionToken, purpose)) ? "ok" : "reauth_required";
}

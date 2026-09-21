import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import {
  updatePasswordHash,
  deleteOtherSessions,
  deleteEmailVerificationsForUser,
  setPendingEmail,
} from "@/lib/db";
import { getCurrentUser, SESSION_COOKIE } from "@/lib/session";
import { checkPassword } from "@/lib/password";
import { limitOrReject } from "@/lib/rateLimit";

/**
 * Change the password, current password required.
 *
 * The current password is asked for even though the caller already holds a
 * valid session, for the same reason `/api/account` asks before deleting: a
 * session cookie lives for 30 days on a device that gets lent and left
 * unlocked, and a password change is how someone would lock the real owner out
 * of their own account.
 *
 * **Every other session is ended on success**, which is the other half of the
 * same thought. The usual reason to change a password is that someone else
 * might have it; leaving their session alive would make the change decorative.
 * This device stays signed in — see deleteOtherSessions.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  // A malformed body lands on the same path as a wrong password: absent is not
  // correct. Same handling as the delete-account route, for consistency.
  let currentPassword: unknown;
  let newPassword: unknown;
  try {
    ({ currentPassword, newPassword } = await req.json());
  } catch {
    currentPassword = undefined;
    newPassword = undefined;
  }

  if (typeof currentPassword !== "string" || currentPassword.length === 0) {
    return NextResponse.json({ error: "Enter your current password." }, { status: 400 });
  }

  if (typeof newPassword !== "string" || newPassword.length === 0) {
    return NextResponse.json({ error: "Enter a new password." }, { status: 400 });
  }

  /* This route used to accept any non-empty string, matching a signup whose
     only rule was that a password existed — refusing to change a password the
     app had itself allowed would have locked people out of fixing it. Signup
     now applies the real rule, so this can too, and the direction is safe:
     accounts created under the old rule keep signing in with what they have,
     and the check only ever runs on a password being *set*. */
  const weak = checkPassword(newPassword, { name: user.name, email: user.email });
  if (weak) {
    return NextResponse.json({ error: weak }, { status: 400 });
  }

  /* The re-authentication is what a stolen session cannot pass on its own, so
     it has to be counted like the login form is — otherwise it is an oracle
     for guessing the password behind a cookie the attacker already holds.
     Keyed by user, shared with the delete route: ten tries in fifteen minutes
     is generous for a person and useless for a wordlist. See F11/F12. */
  const limited = await limitOrReject({
    scope: "account:reauth",
    key: user.id,
    max: 10,
    windowMinutes: 15,
    message: "Too many password attempts. Try again in a few minutes.",
  });
  if (limited) return limited;

  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return NextResponse.json({ error: "That password isn't right." }, { status: 401 });
  }

  if (await bcrypt.compare(newPassword, user.passwordHash)) {
    return NextResponse.json(
      { error: "That's already your password." },
      { status: 400 }
    );
  }

  // Same cost factor as signup and the seed script. Changing it here only
  // would leave two generations of hash in one table for no reason.
  await updatePasswordHash(user.id, await bcrypt.hash(newPassword, 10));

  // Same reasoning as /api/auth/reset: an attacker who parked a pending
  // email-change link (via /api/account/email) before the real owner
  // changed the password must not be able to redeem it afterward. See F33.
  await deleteEmailVerificationsForUser(user.id);
  await setPendingEmail(user.id, null);

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value ?? "";
  const endedElsewhere = await deleteOtherSessions(user.id, token);

  return NextResponse.json({ ok: true, endedElsewhere });
}

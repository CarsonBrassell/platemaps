import { NextResponse, after } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import {
  updatePasswordHash,
  deleteOtherSessions,
  deleteEmailVerificationsForUser,
  listIdentities,
  setPendingEmail,
} from "@/lib/db";
import { getCurrentUser, SESSION_COOKIE } from "@/lib/session";
import { checkPassword } from "@/lib/password";
import { limitOrReject } from "@/lib/rateLimit";
import { confirmIdentity } from "@/lib/reauth";
import { sendSecurityNotice } from "@/lib/mail";

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
 *
 * **Adding a first password.** An account made with Apple or Google has none,
 * so there is no current password to ask for. It confirms with its provider
 * instead (a single-use stamp for the purpose `password`, `lib/reauth.ts`),
 * and the address on file is told a password was added — on the website that
 * confirmation is a presence check, and a password is exactly what someone at
 * a borrowed browser would add to keep the account. An account that HAS a
 * password takes the unchanged path below and cannot use the provider route.
 *
 * **Connected sign-ins survive, and the answer says which.** See the note at
 * the bottom of the handler.
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

  const hasPassword = user.passwordHash !== null;

  if (hasPassword && (typeof currentPassword !== "string" || currentPassword.length === 0)) {
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

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value ?? "";

  const confirmed = await confirmIdentity(user, token, "password", currentPassword);
  if (confirmed === "wrong_password") {
    return NextResponse.json({ error: "That password isn't right." }, { status: 401 });
  }
  if (confirmed === "reauth_required") {
    return NextResponse.json(
      { error: "Confirm with Apple or Google to add a password.", code: "reauth_required" },
      { status: 401 }
    );
  }

  if (user.passwordHash !== null && (await bcrypt.compare(newPassword, user.passwordHash))) {
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

  const endedElsewhere = await deleteOtherSessions(user.id, token);

  if (!hasPassword) {
    after(async () => {
      const send = await sendSecurityNotice(user.email, user.name, "password_added");
      if (!send.ok && send.reason === "failed") {
        console.error(`password-added notice failed for ${user.id}: ${send.detail}`);
      }
    });
  }

  /* Which Apple / Google sign-ins can still get into this account. Unlike the
     reset link, this route does not remove them: on the add-a-first-password
     path the connected provider is the person's own and often would not pass
     the reset's "same address" test (a Hide My Email relay). But someone
     changing a password because another person knew it should be told that a
     sign-in connected with the old password still works, so the screen can
     point at Disconnect. Provider names only. */
  const connectedSignIns = (await listIdentities(user.id)).map((i) => i.provider);

  return NextResponse.json({ ok: true, endedElsewhere, connectedSignIns });
}

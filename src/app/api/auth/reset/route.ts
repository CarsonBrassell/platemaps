import { NextResponse, after } from "next/server";
import bcrypt from "bcryptjs";
import {
  deleteAllSessions,
  deleteEmailVerificationsForUser,
  deletePasswordReset,
  deletePasswordResetsForUser,
  evictUntrustedIdentities,
  getPasswordReset,
  getUserById,
  markEmailVerified,
  setPendingEmail,
  updatePasswordHash,
} from "@/lib/db";
import { checkPassword } from "@/lib/password";
import { clientIp } from "@/lib/loginThrottle";
import { limitOrReject } from "@/lib/rateLimit";
import { hashToken } from "@/lib/tokens";
import { revokeStoredTokens } from "@/lib/oauth/apple";

/**
 * Spend a reset link and set a new password.
 *
 * No session, and no old password — the token is the whole authority, which is
 * the point: the person using this route is by definition unable to sign in.
 * What keeps that safe is that the token only ever reached one place, the
 * address on the account.
 *
 * **Every session dies here, including any already signed in.** The usual
 * reason for a reset is that somebody else has the password, and a reset that
 * left their session alive would be decorative. This differs from
 * `/api/account/password`, which keeps the device you changed it on — there,
 * you proved you were already the account holder.
 *
 * Succeeding also marks the address verified. Reading a link sent to it is
 * exactly the proof `/verify-email` asks for, and an account that has just
 * demonstrated it can receive mail should not still be told to go and prove it.
 *
 * **Connected Apple/Google sign-ins that are not provably this inbox die too**
 * (`evictUntrustedIdentities`), for the same reason the sessions do. Without
 * it the reset would be decorative against anyone who had attached their own
 * Google to the account, or had made the account with their Apple ID and
 * typed this address into it: locked out by the new password, they would tap
 * Continue with Google and walk back in. An identity whose provider vouched
 * for this same address survives — same inbox, same person. The response
 * lists what was removed so the screen can say so.
 *
 * For an account that never had a password this sets its first one.
 */
export async function POST(req: Request) {
  const limited = await limitOrReject({
    scope: "reset:ip",
    key: clientIp(req),
    max: 20,
    windowMinutes: 60,
  });
  if (limited) return limited;

  let token: unknown;
  let password: unknown;
  try {
    ({ token, password } = await req.json());
  } catch {
    token = undefined;
    password = undefined;
  }

  if (typeof token !== "string" || token.length === 0) {
    return NextResponse.json(
      { error: "That link looks incomplete. Ask for a new one." },
      { status: 400 }
    );
  }

  // One message for missing, spent and expired — the three are the same fact
  // from the visitor's side, and telling a stranger which of them a guessed
  // token hit would say whether it was ever real.
  const dead = NextResponse.json(
    { error: "That link has expired or has already been used. Ask for a new one." },
    { status: 400 }
  );

  const tokenHash = hashToken(token);
  const reset = await getPasswordReset(tokenHash);
  if (!reset) return dead;

  if (Date.parse(reset.expiresAt) <= Date.now()) {
    await deletePasswordReset(tokenHash);
    return dead;
  }

  const user = await getUserById(reset.userId);
  if (!user) {
    await deletePasswordReset(tokenHash);
    return dead;
  }

  if (typeof password !== "string") {
    return NextResponse.json({ error: "Enter a new password." }, { status: 400 });
  }

  // Checked against the account's own name and address, which the token gave
  // us — the same rule signup and the change form apply.
  const problem = checkPassword(password, { name: user.name, email: user.email });
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  // An account with no password has nothing for the new one to repeat.
  if (user.passwordHash !== null && (await bcrypt.compare(password, user.passwordHash))) {
    return NextResponse.json({ error: "That's already your password." }, { status: 400 });
  }

  await updatePasswordHash(user.id, await bcrypt.hash(password, 10));

  // Order matters below. The token dies before the sessions do, so a request
  // that fails partway can never leave a spent link redeemable.
  await deletePasswordResetsForUser(user.id);
  await deleteAllSessions(user.id);

  // A password reset is the "someone else has my password" remedy, and a
  // pending email-change link mailed to an attacker-chosen address must not
  // survive it — otherwise the attacker, locked out of sign-in, can still
  // redeem that link and move users.email to their own address, recovering
  // the account through /api/auth/forgot afterward. See F33.
  await deleteEmailVerificationsForUser(user.id);
  await setPendingEmail(user.id, null);

  // After the sessions, and compared against the address the link was mailed
  // to. One rule whether or not that address was verified before this request.
  const removed = await evictUntrustedIdentities(user.id, user.email);
  // Apple is told after the response; a slow or failed revoke must not turn a
  // completed reset into an error.
  if (removed.length > 0) after(() => revokeStoredTokens(removed));

  if (!user.emailVerifiedAt) await markEmailVerified(user.id);

  return NextResponse.json({ ok: true, removedSignIns: removed.map((r) => r.provider) });
}

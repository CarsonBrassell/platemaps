import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { accountJson } from "@/lib/account";
import {
  deleteEmailVerificationsForUser,
  getUserByEmail,
  getUserById,
  setPendingEmail,
} from "@/lib/db";
import { describeSend, issueEmailVerification } from "@/lib/emailVerification";
import { getCurrentUser } from "@/lib/session";

/**
 * Deliberately permissive. This is not the check that matters — the mail is.
 * A regex that tries to be clever about what an address may contain reliably
 * rejects somebody's real address, and it can never establish the only fact
 * anyone cares about, which is whether a human reads it.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Ask to move the account to a different address.
 *
 * **Nothing about the account changes here.** The new address is parked in
 * `pending_email` and a link is mailed to it; `users.email` moves only when
 * that link comes back (see `confirmEmail`). That ordering is the entire
 * feature: an address you typed wrong is an address whose link you never
 * receive, so the mistake expires instead of locking you out.
 *
 * The current password is required, on the same reasoning as the password and
 * delete routes: a session cookie lives for 400 days on a device that gets
 * lent, and moving the address is how someone would take an account for good —
 * every recovery path there will ever be starts at the address on file.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  let email: unknown;
  let password: unknown;
  try {
    ({ email, password } = await req.json());
  } catch {
    email = undefined;
    password = undefined;
  }

  if (typeof password !== "string" || password.length === 0) {
    return NextResponse.json({ error: "Enter your current password." }, { status: 400 });
  }

  if (typeof email !== "string" || !EMAIL_PATTERN.test(email.trim())) {
    return NextResponse.json({ error: "That doesn't look like an email address." }, { status: 400 });
  }

  const next = email.trim();

  if (!(await bcrypt.compare(password, user.passwordHash))) {
    return NextResponse.json({ error: "That password isn't right." }, { status: 401 });
  }

  // Asking for the address you already have means one of three things, and the
  // difference is worth getting right rather than flattening into one error.
  const sameAsCurrent = next.toLowerCase() === user.email.toLowerCase();

  if (sameAsCurrent && user.emailVerifiedAt) {
    if (user.pendingEmail) {
      // Naming your own confirmed address while a change is in flight is how
      // somebody says "forget it" — typing the address you want to keep is a
      // more obvious way out than hunting for a cancel control.
      //
      // The outstanding links die with it. A cancel that left them live would
      // mean a change could still complete days later, from a click in an
      // inbox, after the account holder had already called it off.
      await deleteEmailVerificationsForUser(user.id);
      await setPendingEmail(user.id, null);
      const reverted = await getUserById(user.id);
      if (!reverted) return NextResponse.json({ error: "Account not found." }, { status: 404 });
      return NextResponse.json({ account: accountJson(reverted) });
    }

    return NextResponse.json({ error: "That's already your email." }, { status: 400 });
  }
  // Unconfirmed, the same address is instead the most natural way to say "send
  // that link again", and refusing it would refuse the one thing the row is for.

  if (!sameAsCurrent) {
    const taken = await getUserByEmail(next);
    if (taken && taken.id !== user.id) {
      // Deliberately explicit rather than a vague "check your inbox". The
      // account-enumeration this leaks is already leaked by signup, which says
      // the same thing, and a silent failure here means somebody sits waiting
      // for mail that was never going to come.
      return NextResponse.json({ error: "That email is already in use." }, { status: 409 });
    }
  }

  const issued = await issueEmailVerification(user, next);
  if (!issued.ok) {
    return NextResponse.json(
      { error: `Wait ${issued.retryAfterSeconds}s before asking for another link.` },
      { status: 429 }
    );
  }

  const verdict = describeSend(issued.send);
  if (!verdict.ok) {
    // Checked before anything is parked, so the sentence is true: the token row
    // is inert without a link, and the account still reads exactly as it did.
    return NextResponse.json({ error: verdict.error }, { status: 502 });
  }

  // Parked only once the mail is away. Written first, a send failure would
  // leave the row saying "check your inbox" about a letter that never existed.
  // Confirming the address already on file parks nothing — there is nothing
  // pending about it.
  if (!sameAsCurrent) await setPendingEmail(user.id, next);

  const fresh = await getUserById(user.id);
  if (!fresh) return NextResponse.json({ error: "Account not found." }, { status: 404 });

  return NextResponse.json({ account: accountJson(fresh), notice: verdict.notice });
}

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { deleteUser } from "@/lib/db";
import { getCurrentUser, SESSION_COOKIE } from "@/lib/session";

/**
 * Delete the signed-in account and everything it produced.
 *
 * This exists because App Store guideline 5.1.1(v) requires that an app which
 * lets you create an account also lets you delete it *from inside the app* —
 * a support email or a web-only form is an explicit rejection. It is also the
 * promise the privacy policy already makes ("If you delete your account, we
 * delete or anonymize your personal information"), which until now the product
 * had no way to keep.
 *
 * **The password is required even though the caller already holds a valid
 * session**, which is the one place this endpoint is deliberately less
 * convenient than the rest of the API. Sessions last 30 days and live in a
 * cookie on a device that gets lent, left unlocked, or handed to a friend to
 * look at a restaurant. Every other action that cookie authorizes is
 * recoverable; this one erases the account permanently. Re-authentication is
 * the difference between "someone got your phone" and "someone got your
 * phone and your account is gone."
 *
 * DELETE rather than POST because that is what it is, and the method itself
 * keeps this from ever being reachable by a form submission or a stray link.
 */
export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  // A malformed body is a client bug, not a reason to 500. It lands on the
  // same "wrong password" path below, since an absent password is not a
  // correct one.
  let password: unknown;
  try {
    ({ password } = await req.json());
  } catch {
    password = undefined;
  }

  if (typeof password !== "string" || password.length === 0) {
    return NextResponse.json(
      { error: "Enter your password to confirm." },
      { status: 400 }
    );
  }

  if (!(await bcrypt.compare(password, user.passwordHash))) {
    // Deliberately not "wrong password for this account" — the caller is
    // already authenticated, so there is nothing to enumerate, but the plainer
    // sentence is also the more useful one.
    return NextResponse.json({ error: "That password isn't right." }, { status: 401 });
  }

  await deleteUser(user.id);

  // The sessions row is already gone with the user (ON DELETE CASCADE), so the
  // cookie is dead server-side the moment the delete lands. Clearing it here
  // stops the browser from sending a token that can no longer resolve, which
  // would otherwise leave the client in a state where it looks signed in until
  // the next /api/auth/me.
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);

  return NextResponse.json({ ok: true });
}

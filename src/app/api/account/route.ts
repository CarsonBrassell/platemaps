import { NextResponse, after } from "next/server";
import { cookies } from "next/headers";
import { deleteUser, listIdentities, restaurantIdsPostedBy } from "@/lib/db";
import { invalidateRestaurantPage } from "@/lib/restaurantPage";
import { getCurrentUser, SESSION_COOKIE } from "@/lib/session";
import { limitOrReject } from "@/lib/rateLimit";
import { confirmIdentity } from "@/lib/reauth";
import { revokeStoredTokens } from "@/lib/oauth/apple";

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
 * **An account with no password** (made with Apple or Google) confirms with
 * that provider instead: a re-auth flow stamps this session for the purpose
 * `delete`, and `confirmIdentity` spends the stamp — one confirmation, one
 * deletion, three minutes. Without a fresh stamp the answer is 401 with
 * `code: "reauth_required"`, which the client reads as "show Confirm with
 * Apple/Google". An account WITH a password is never offered that route.
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

  if (user.passwordHash !== null && (typeof password !== "string" || password.length === 0)) {
    return NextResponse.json(
      { error: "Enter your password to confirm." },
      { status: 400 }
    );
  }

  // Same counter as the password-change route, and for the same reason: the
  // re-authentication only means something if it can't be guessed at speed
  // from behind a session the attacker already has. See F11/F12.
  const limited = await limitOrReject({
    scope: "account:reauth",
    key: user.id,
    max: 10,
    windowMinutes: 15,
    message: "Too many password attempts. Try again in a few minutes.",
  });
  if (limited) return limited;

  const cookieStore = await cookies();
  const confirmed = await confirmIdentity(
    user,
    cookieStore.get(SESSION_COOKIE)?.value,
    "delete",
    password
  );
  if (confirmed === "wrong_password") {
    // Deliberately not "wrong password for this account" — the caller is
    // already authenticated, so there is nothing to enumerate, but the plainer
    // sentence is also the more useful one.
    return NextResponse.json({ error: "That password isn't right." }, { status: 401 });
  }
  if (confirmed === "reauth_required") {
    return NextResponse.json(
      { error: "Confirm with Apple or Google to delete your account.", code: "reauth_required" },
      { status: 401 }
    );
  }

  // Read before the delete for the same reason as the restaurant ids below:
  // the identities cascade away with the user, and Apple's guidance is that
  // deleting the account revokes the authorization. Revoked after the
  // response — a slow Apple must not hold up, or fail, the deletion.
  const identities = await listIdentities(user.id);

  // Which restaurant pages this account's plates were on, read before the
  // rows go — after the delete there is nothing left to ask — and invalidated
  // after, so a regenerating page cannot race the delete and cache the old
  // count (lib/restaurantPage.ts).
  const postedAt = await restaurantIdsPostedBy(user.id);
  await deleteUser(user.id);
  for (const id of postedAt) invalidateRestaurantPage(id);
  after(() => revokeStoredTokens(identities));

  // The sessions row is already gone with the user (ON DELETE CASCADE), so the
  // cookie is dead server-side the moment the delete lands. Clearing it here
  // stops the browser from sending a token that can no longer resolve, which
  // would otherwise leave the client in a state where it looks signed in until
  // the next /api/auth/me.
  cookieStore.delete(SESSION_COOKIE);

  return NextResponse.json({ ok: true });
}

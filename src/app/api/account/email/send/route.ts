import { NextResponse } from "next/server";
import { describeSend, issueEmailVerification } from "@/lib/emailVerification";
import { getCurrentUser } from "@/lib/session";

/**
 * Send the verification link again, to whichever address is currently waiting
 * on one — the pending address if a change is in flight, otherwise the address
 * already on the account.
 *
 * No password, unlike `/api/account/email`. This route cannot move an account
 * anywhere: it re-mails a link to an address that is already on file, so the
 * worst a borrowed phone achieves with it is sending the real owner an email.
 * The password belongs on the route that chooses the address, and asking for
 * it on every one of them is how people stop reading the prompt on the route
 * where it matters.
 *
 * The address is never accepted from the request. Taking it from the session's
 * own row is what keeps that true — a body parameter here would turn a resend
 * button into the change-email route without the password.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const target = user.pendingEmail ?? user.email;

  if (!user.pendingEmail && user.emailVerifiedAt) {
    return NextResponse.json({ error: "That address is already confirmed." }, { status: 400 });
  }

  const issued = await issueEmailVerification(user, target);
  if (!issued.ok) {
    return NextResponse.json(
      { error: `Wait ${issued.retryAfterSeconds}s before asking for another link.` },
      { status: 429 }
    );
  }

  const verdict = describeSend(issued.send);
  if (!verdict.ok) {
    return NextResponse.json({ error: verdict.error }, { status: 502 });
  }

  return NextResponse.json({ ok: true, email: target, notice: verdict.notice });
}

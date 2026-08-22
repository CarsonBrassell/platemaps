import { NextResponse } from "next/server";
import { confirmEmail, deleteEmailVerification, getEmailVerification } from "@/lib/db";
import { hashToken } from "@/lib/tokens";

/**
 * Redeem a verification link.
 *
 * **No session required, on purpose.** A link opened in the mail app lands in
 * whatever browser that app prefers, which is routinely not the one holding
 * the session — demanding a sign-in here would strand exactly the person this
 * feature exists for, someone who cannot get into their account.
 *
 * The token is the whole authority, and it is a narrow one: it proves that
 * whoever holds it can read one particular address, and it buys nothing else.
 * **It does not sign anybody in.** An emailed link that returned a session
 * would be a login bypass with a 24-hour window, sitting in an inbox.
 *
 * POST rather than GET because links get fetched by things that are not
 * people — mail scanners and link previewers follow every URL in a message. A
 * token spent by a security scanner is a token the recipient finds already
 * used. The page at /verify-email posts on the visitor's behalf.
 */
export async function POST(req: Request) {
  let token: unknown;
  try {
    ({ token } = await req.json());
  } catch {
    token = undefined;
  }

  if (typeof token !== "string" || token.length === 0) {
    return NextResponse.json({ error: "That link is missing its token." }, { status: 400 });
  }

  const tokenHash = hashToken(token);
  const verification = await getEmailVerification(tokenHash);

  // One message for "never existed", "already used" and "expired". They are
  // the same fact from the visitor's side — this link won't work, ask for
  // another — and separating them would let a stranger with a guessed token
  // learn which guesses were once real.
  const dead = NextResponse.json(
    { error: "That link has expired or has already been used. Ask for a new one." },
    { status: 400 }
  );

  if (!verification) return dead;

  if (Date.parse(verification.expiresAt) <= Date.now()) {
    await deleteEmailVerification(tokenHash);
    return dead;
  }

  // Re-checked at the moment of the write, not when the mail was sent: two
  // accounts can hold live links to the same address, and only the first one
  // opened may have it. See confirmEmail.
  const confirmed = await confirmEmail(verification.userId, verification.email);
  if (!confirmed) {
    await deleteEmailVerification(tokenHash);
    return NextResponse.json(
      { error: "That email now belongs to another account." },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true, email: verification.email });
}

import { NextResponse } from "next/server";
import {
  createPasswordReset,
  getLastPasswordResetSentAt,
  getUserByEmail,
} from "@/lib/db";
import { describeSend } from "@/lib/emailVerification";
import { sendPasswordResetEmail } from "@/lib/mail";
import { hashToken, newToken } from "@/lib/tokens";

/** An hour. Shorter than a verification link, because this one rewrites a
    credential rather than confirming a fact, and a reset mail sitting unread
    in an inbox for a day is a day of exposure for no benefit. */
const RESET_TTL_MS = 60 * 60 * 1000;

/** Asking again inside this window re-uses nothing and sends nothing. */
const RESEND_INTERVAL_MS = 60 * 1000;

/**
 * "I forgot my password" — mails a reset link.
 *
 * **This route always answers the same way.** Known address or not, throttled
 * or not, mailer working or not, the response is `{ ok: true }`. Anyone can
 * type an address into this form, so any difference in the reply — a 404, a
 * slower response, a different message — is a free tool for checking whether
 * somebody has a PlateMaps account. The person who legitimately forgot their
 * password learns what they need from their inbox, not from this response.
 *
 * That is a deliberate inconsistency with `/api/auth/signup` and
 * `/api/account/email`, which both say plainly when an address is taken. They
 * have to: a signup that failed silently would be a broken signup. Here there
 * is nothing to tell the caller, so nothing is told.
 */
export async function POST(req: Request) {
  let email: unknown;
  try {
    ({ email } = await req.json());
  } catch {
    email = undefined;
  }

  // The single response, built once and returned from every path below.
  const ok = NextResponse.json({ ok: true });

  if (typeof email !== "string" || email.trim().length === 0) return ok;

  const user = await getUserByEmail(email.trim());
  if (!user) return ok;

  const lastSentAt = await getLastPasswordResetSentAt(user.id);
  if (lastSentAt && Date.now() - Date.parse(lastSentAt) < RESEND_INTERVAL_MS) {
    // Throttled, and silently — a 429 here would confirm the account exists,
    // which is exactly what the uniform response is protecting.
    return ok;
  }

  const token = newToken();
  await createPasswordReset({
    tokenHash: hashToken(token),
    userId: user.id,
    expiresAt: new Date(Date.now() + RESET_TTL_MS),
  });

  const send = await sendPasswordResetEmail(user.email, user.name, token);
  const verdict = describeSend(send);

  // Logged rather than returned, for the same reason. A send failure is real
  // and worth seeing in the server output; it is not worth telling an
  // anonymous caller that this particular address failed to receive mail.
  if (!verdict.ok) console.error(`password reset mail failed for ${user.id}: ${verdict.error}`);

  return ok;
}

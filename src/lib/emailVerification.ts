import {
  createEmailVerification,
  getLastEmailVerificationSentAt,
  type User,
} from "@/lib/db";
import { sendVerificationEmail, type SendResult } from "@/lib/mail";
import { hashToken, newToken } from "@/lib/tokens";

/**
 * Issuing verification tokens. Server-only, like `lib/db.ts`.
 *
 * Two routes need this — changing an address and re-sending the link for one
 * already asked for — and the throttle must not drift between them. The
 * hashing itself moved to `lib/tokens.ts`, which password resets share.
 */

/** A day. Long enough to survive a phone left on a table, short enough to matter. */
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/** How long before the same account may ask for another link. */
const RESEND_INTERVAL_MS = 60 * 1000;

export type IssueResult =
  | { ok: true; send: SendResult }
  /** Asked again too soon. */
  | { ok: false; reason: "throttled"; retryAfterSeconds: number };

/**
 * Mint a token for `email` and mail the link to it.
 *
 * The address is passed in rather than read off the user, because the whole
 * point of the pending-address design is that the target of this mail is
 * frequently *not* the account's current address yet.
 */
export async function issueEmailVerification(user: User, email: string): Promise<IssueResult> {
  const lastSentAt = await getLastEmailVerificationSentAt(user.id);
  if (lastSentAt) {
    const elapsed = Date.now() - Date.parse(lastSentAt);
    if (elapsed < RESEND_INTERVAL_MS) {
      return {
        ok: false,
        reason: "throttled",
        retryAfterSeconds: Math.ceil((RESEND_INTERVAL_MS - elapsed) / 1000),
      };
    }
  }

  const token = newToken();

  await createEmailVerification({
    tokenHash: hashToken(token),
    userId: user.id,
    email,
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
  });

  // Older tokens are deliberately left alive until one is redeemed. Someone who
  // asks twice because the first mail was slow should not find that the first
  // link — the one that actually arrived — has been killed by the second.
  return { ok: true, send: await sendVerificationEmail(email, token) };
}

export type SendVerdict =
  | { ok: true; notice?: string }
  | { ok: false; error: string };

/**
 * Whether a send counts as success, and what to say about it.
 *
 * Shared so both sending routes treat a missing mailer identically. The one
 * interesting case is development with no provider: the link is on the server
 * console, the flow genuinely works, and calling that a failure would make the
 * feature untestable — so it succeeds and carries a notice saying where the
 * link went. In production the same condition is an outage and reads as one.
 */
export function describeSend(send: SendResult): SendVerdict {
  if (send.ok) return { ok: true };

  if (send.reason === "unconfigured" && process.env.NODE_ENV !== "production") {
    return { ok: true, notice: "No mailer configured — the link is on the server console." };
  }

  return { ok: false, error: "We couldn't send the email. Nothing has changed — try again shortly." };
}

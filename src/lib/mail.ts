/**
 * Outbound mail — currently one letter, the address verification link.
 *
 * Server-only, in the same sense `lib/db.ts` is: it reads secrets off
 * `process.env` and must never be pulled into a client component.
 *
 * There is no mail provider in `package.json` and no key in `.env.local`, and
 * this file is deliberately shaped so that stays a one-line problem rather than
 * a reason not to build the feature. Set `RESEND_API_KEY` and `MAIL_FROM` and
 * mail goes out; leave them unset and `send` reports `"unconfigured"` instead
 * of pretending.
 *
 * The distinction matters more than it looks. A mailer that swallows its own
 * failure produces the worst possible version of this feature: an app that says
 * "check your inbox" to somebody whose inbox will never receive anything, about
 * the one address they need in order to get their account back.
 */

export type SendResult =
  | { ok: true }
  /** No provider configured. In development this is normal — see `deliver`. */
  | { ok: false; reason: "unconfigured" }
  | { ok: false; reason: "failed"; detail: string };

/**
 * Where this deployment lives, for building links that arrive in mail.
 *
 * **Never derived from the request's `Host` header**, which the caller
 * controls: a forged host turns a verification mail into a link that posts the
 * token to somebody else's server, and the mail is genuine, so it looks right.
 * An env var can be wrong, but it can't be wrong on demand.
 */
export function appUrl(): string {
  const configured = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");

  // Vercel supplies the production domain to the build and the runtime.
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}

async function deliver(to: string, subject: string, text: string): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;

  if (!key || !from) {
    // Development gets the letter on the server console, which makes the whole
    // flow testable with no account anywhere. Production gets nothing and says
    // so — the caller turns this into a visible error.
    if (process.env.NODE_ENV !== "production") {
      console.log(`\n--- mail to ${to} ---\n${subject}\n\n${text}\n---\n`);
    }
    return { ok: false, reason: "unconfigured" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, text }),
    });
    if (!res.ok) return { ok: false, reason: "failed", detail: `${res.status}` };
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: "failed", detail: String(error) };
  }
}

/**
 * The verification letter.
 *
 * Plain text, not HTML: it is two sentences and a URL, and a text part is the
 * one thing every client renders identically. It names the address being
 * confirmed, because the whole point of this mail is that it may have arrived
 * somewhere unintended — someone reading a confirmation for an address they
 * didn't ask about needs to be able to tell that at a glance.
 */
export function sendVerificationEmail(to: string, token: string): Promise<SendResult> {
  const link = `${appUrl()}/verify-email?token=${encodeURIComponent(token)}`;

  return deliver(
    to,
    "Confirm your PlateMaps email",
    [
      `Confirm ${to} as the address on your PlateMaps account:`,
      "",
      link,
      "",
      "The link works once and expires in 24 hours.",
      "If you didn't ask for this, ignore it — nothing changes until the link is opened.",
    ].join("\n")
  );
}

/**
 * The reset letter.
 *
 * It names the account, because this is the one mail here that gets sent to
 * people who did not ask for it — anybody can type an address into the forgot
 * form. Someone who receives this uninvited should be able to see at a glance
 * whose account it concerns, and be told plainly that ignoring it is enough.
 */
export function sendPasswordResetEmail(
  to: string,
  username: string,
  token: string
): Promise<SendResult> {
  const link = `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;

  return deliver(
    to,
    "Reset your PlateMaps password",
    [
      `Set a new password for the PlateMaps account @${username}:`,
      "",
      link,
      "",
      "The link works once and expires in one hour.",
      "If you didn't ask for this, ignore it. Your password stays as it is, and",
      "whoever asked cannot see this message.",
    ].join("\n")
  );
}

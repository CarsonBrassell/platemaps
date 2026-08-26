/**
 * What counts as a usable email address, in one place.
 *
 * Signup checked only that the field was non-empty, so `email: "asdf"` created
 * an account — one that can never verify, never reset its password, and never
 * be recovered, because every route out of that state mails a link. The
 * account is not broken until the person needs it, which is the worst moment
 * to find out.
 *
 * No module-scope imports, so the signup form can run this as you type and the
 * server can run it again on submit. The client call is a courtesy; the server
 * call is the one that decides.
 *
 * ## Why this pattern and not a stricter one
 *
 * There is no regular expression that matches RFC 5322 — the grammar allows
 * quoted strings, comments and nested folding whitespace, and the expressions
 * that try are famously longer than this entire file and still wrong. Worse,
 * every strict validator eventually rejects a real address someone actually
 * has: `+` tags, apostrophes in Irish surnames, and the newer long TLDs are
 * the usual casualties, and a signup that refuses a valid address is a lost
 * user with no way to argue.
 *
 * So this checks the shape that catches typos and nothing more: one `@`, a
 * local part, a dotted domain with a plausible TLD, no whitespace. **Delivery
 * is what actually proves an address**, and the app already has that — see
 * `lib/emailVerification.ts`. This is the cheap filter in front of it.
 */

/**
 * Deliberately permissive: one `@`, something before it, a dotted domain
 * after it, a TLD of at least two letters, no spaces anywhere.
 */
const SHAPE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[a-zA-Z]{2,}$/;

/** RFC 5321 caps the whole address at 254 octets, and the local part at 64. */
const MAX_LENGTH = 254;
const MAX_LOCAL = 64;

/** Null when the address is usable, otherwise the sentence to show. */
export function checkEmail(raw: string): string | null {
  const email = raw.trim();

  if (!email) return "Enter your email address.";
  if (email.length > MAX_LENGTH) return "That email address is too long.";
  if (!SHAPE.test(email)) return "That doesn't look like an email address.";
  if (email.split("@")[0].length > MAX_LOCAL) {
    return "That email address is too long.";
  }

  // Two dots in a row cannot appear in an unquoted address, and are almost
  // always a slipped finger rather than an intention.
  if (email.includes("..")) return "That doesn't look like an email address.";

  return null;
}

/**
 * The form an address is stored and compared in.
 *
 * Lowercased, because a person who signs up as `Sam@…` and later types
 * `sam@…` means the same mailbox, and an app that disagrees hands them a
 * "no account with that email" on a password reset. Trimmed because a pasted
 * address brings a space about as often as not.
 *
 * The local part of an address is *technically* case-sensitive per RFC 5321,
 * but no mail provider anyone signs up with treats it that way, and honouring
 * that would mean two accounts on what is really one mailbox.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

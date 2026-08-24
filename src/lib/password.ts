/**
 * What counts as an acceptable password, in one place.
 *
 * Four things set a password — signup, the change form, a reset link, and the
 * seed script — and before this they disagreed: signup's only rule was that a
 * password existed, and `/api/account/password` deliberately matched it rather
 * than inventing a stricter one, on the reasoning that refusing to change a
 * password the app itself had allowed would lock people out of fixing it. That
 * reasoning was right, and it is why the rule has to move to both ends at once
 * rather than being tightened on one of them.
 *
 * No module-scope imports, so client components can run the same check as you
 * type and the server can run it again on submit. The client copy is a
 * courtesy; the server call is the one that decides.
 *
 * **Deliberately not here: composition rules.** No required digit, symbol or
 * capital. They push people toward `Password1!` — which satisfies every rule
 * and is on the list below — and away from length, which is the only property
 * that actually costs an attacker anything. This follows NIST SP 800-63B:
 * length floor, blocklist, nothing else.
 */

/** Eight is the NIST floor for a human-chosen secret. */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * bcrypt hashes the first 72 **bytes** and silently ignores the rest, so
 * without a cap two different long passwords can share a hash and both open
 * the account. Counted in bytes, not characters — an emoji is four of them.
 */
export const MAX_PASSWORD_BYTES = 72;

/**
 * The passwords that get tried first, and the ones any length rule lets
 * through anyway. Not a security boundary — a real blocklist is millions of
 * entries — but it costs nothing and it catches the guesses that actually get
 * made. Compared case-insensitively.
 */
const COMMON = new Set([
  "password", "password1", "password12", "password123", "passw0rd", "p@ssword", "p@ssw0rd",
  "12345678", "123456789", "1234567890", "123123123", "111111111", "000000000",
  "qwertyui", "qwerty123", "qwertyuiop", "asdfghjk", "asdfghjkl", "1q2w3e4r", "1qaz2wsx",
  "iloveyou", "sunshine", "princess", "football", "baseball", "superman", "batman123",
  "monkey123", "dragon123", "letmein1", "letmein123", "welcome1", "welcome123",
  "abc12345", "abcd1234", "trustno1", "starwars", "whatever", "computer", "michael1",
  "platemaps", "platemap1",
]);

/**
 * Null when the password is acceptable, otherwise the sentence to show.
 *
 * `name` and `email` are the account's own, and are optional only because the
 * change form has them from context while signup is still typing them.
 */
export function checkPassword(
  password: string,
  identity: { name?: string; email?: string } = {}
): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) {
    return "That's too long — keep it under 72 characters.";
  }

  const lower = password.toLowerCase();

  if (COMMON.has(lower)) {
    return "That's one of the most common passwords there is. Pick another.";
  }

  // A password containing the username or the address it protects is one guess
  // for anyone who can see either — and both are visible on your profile.
  const name = identity.name?.trim().toLowerCase();
  if (name && name.length >= 3 && lower.includes(name)) {
    return "Don't put your username in your password.";
  }

  const local = identity.email?.trim().toLowerCase().split("@")[0];
  if (local && local.length >= 3 && lower.includes(local)) {
    return "Don't put your email address in your password.";
  }

  return null;
}

/** The one-line rule, for the hint under a password field. */
export const PASSWORD_HINT = `At least ${MIN_PASSWORD_LENGTH} characters. Longer beats complicated — a short phrase is stronger than a word with symbols in it.`;

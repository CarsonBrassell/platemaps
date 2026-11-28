import { checkEmail, normalizeEmail } from "@/lib/emailAddress";

/**
 * "Find friends from your contacts": the numbers, and the two cleaners.
 *
 * No Node-only imports, so the phone (which builds the upload and the invite
 * links) and the server (which decides) run the same code. The client pass is
 * a courtesy that keeps a real address book inside the caps; the server runs
 * every one of these again and is the one that counts.
 *
 * Every tunable number for the feature is in this file on purpose. They are
 * guesses made before there was any traffic, and changing one is a web deploy,
 * not an App Store build.
 */

/** Email addresses one check may carry, after duplicates are removed. */
export const MAX_EMAILS = 500;
/** What a starter account (see `contactsTier`) has checked out of its upload. */
export const STARTER_MAX_EMAILS = 200;
/** Phone numbers one check may carry (only callers with a verified phone). */
export const MAX_PHONES = 2000;
/** Longest single entry the server will look at. */
export const MAX_EMAIL_CHARS = 254;
export const MAX_PHONE_CHARS = 32;
/**
 * The whole request body. 500 x 254 + 2,000 x 32 plus JSON punctuation fits
 * under this, so a real address book trimmed to the caps can never be refused
 * for size.
 */
export const MAX_BODY_CHARS = 256_000;
/** Most people one check hands back. Never accompanied by a total. */
export const MAX_MATCHES = 50;
/** Younger than this, an account gets the starter allowance. */
export const STARTER_AGE_DAYS = 7;

const DAY = 24 * 60;

/**
 * Every limiter number for the match route, as `{ max, windowMinutes }`.
 *
 * `userDay` / `userMonth`: an established account. Three a day is enough
 * because the sheet keeps its last result and a refused attempt is not
 * counted; eight a month bounds what one patient account can test.
 * `starterUserDay` / `starterDay`: a new or `+`-alias account gets one check
 * a day, and ALL such accounts together share forty, so minting accounts does
 * not multiply what can be probed (40 x 200 addresses a day, in total).
 * `ipDay`: per IPv4 address or IPv6 /64 — loose enough for a dorm.
 * `globalHour` / `globalDay`: the ceiling whoever is asking.
 * `shownAlert` / `shownPause`: matches handed out in a day, across everyone.
 * At the first the owner is emailed once; at the second the route pauses.
 */
export const LIMITS = {
  userDay: { max: 3, windowMinutes: DAY },
  userMonth: { max: 8, windowMinutes: 30 * DAY },
  starterUserDay: { max: 1, windowMinutes: DAY },
  starterDay: { max: 40, windowMinutes: DAY },
  ipDay: { max: 200, windowMinutes: DAY },
  globalHour: { max: 150, windowMinutes: 60 },
  globalDay: { max: 600, windowMinutes: DAY },
  shownAlert: { max: 300, windowMinutes: DAY },
  shownPause: { max: 1000, windowMinutes: DAY },
} as const;

/**
 * The limiter numbers for texting a verification code. Each text costs money,
 * so these are the spending controls as much as the abuse ones.
 *
 * `newNumber`: distinct numbers one account may try in 30 days. `pair`: codes
 * to one number from one account in 30 days. `number`: codes to one number in
 * a day from anyone. `starterDay`: what all accounts younger than a week
 * share. `global`: the last line — about twelve dollars on the worst day.
 */
export const PHONE_LIMITS = {
  userHour: { max: 3, windowMinutes: 60 },
  userDay: { max: 5, windowMinutes: DAY },
  ipDay: { max: 10, windowMinutes: DAY },
  number: { max: 3, windowMinutes: DAY },
  pair: { max: 5, windowMinutes: 30 * DAY },
  newNumber: { max: 2, windowMinutes: 30 * DAY },
  starterDay: { max: 40, windowMinutes: DAY },
  global: { max: 200, windowMinutes: DAY },
  verifyUserHour: { max: 10, windowMinutes: 60 },
} as const;

/**
 * Whether an account is inside its first week.
 *
 * No creation date means the account is older than the column that records
 * one, so it counts as old. Unknown must never read as new here: "new" is the
 * restricted case, and an old account should not lose its allowance because
 * of a missing value. An unparseable date counts as new, the cautious side.
 */
export function accountIsYoung(createdAt: string | undefined, now = Date.now()): boolean {
  if (!createdAt) return false;
  const made = Date.parse(createdAt);
  if (Number.isNaN(made)) return true;
  return now - made < STARTER_AGE_DAYS * 24 * 60 * 60 * 1000;
}

export type ContactsTier = "standard" | "starter";

/**
 * Which allowance an account gets on the match route.
 *
 * A confirmed email is nearly free to an attacker — one inbox confirms any
 * number of `name+1@`, `name+2@` addresses — so two cheap signals put an
 * account on the small shared allowance instead: it is under a week old, or
 * its address uses a `+` tag. Plenty of honest people use `+` tags, which is
 * why this narrows the allowance rather than refusing them.
 */
export function contactsTier(user: { createdAt?: string; email: string }): ContactsTier {
  const local = user.email.split("@")[0] ?? "";
  return accountIsYoung(user.createdAt) || local.includes("+") ? "starter" : "standard";
}

/**
 * One address-book email in the form it is compared in, or null if it is not
 * an address. Same rules as signup (`checkEmail`) and the same folding as
 * stored addresses (`normalizeEmail`), so "is this that member" means one
 * thing everywhere.
 */
export function cleanContactEmail(raw: string): string | null {
  if (typeof raw !== "string" || raw.length > MAX_EMAIL_CHARS) return null;
  if (checkEmail(raw) !== null) return null;
  return normalizeEmail(raw);
}

/**
 * One address-book phone number reduced to digits and at most one leading
 * `+`, or null if what is left is not 7 to 15 digits.
 *
 * Cut at the first `,` `;` `x` `X` or `#` because that is where address books
 * put extensions and pauses ("(619) 555-0123 x5"). Everything else that is
 * not a digit goes too, and that is the security half: this string is pasted
 * into an `sms:` link, where a stray `&`, `?` or `,` from a contact field
 * could add recipients or replace the message.
 */
export function cleanContactPhone(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const head = raw.split(/[,;xX#]/)[0].trim();
  const digits = head.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return head.startsWith("+") ? `+${digits}` : digits;
}

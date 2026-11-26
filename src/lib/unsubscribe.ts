import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  findUserByUnsubscribeToken,
  getOrCreateUnsubscribeToken,
  isMarketingOptedOut,
  setMarketingOptOut,
} from "@/lib/db";
import { appUrl } from "@/lib/mail";

/**
 * Promotional-mail opt-out. Server-only, like `lib/db.ts`.
 *
 * **Why a stored token and not an HMAC.** The app has no server-side signing
 * secret (its env vars are provider keys and the database URL, none of which
 * should double as one), so each user gets a random 256-bit token the first
 * time a link is built. The token only ever lets its holder opt that one
 * account out of, or back into, promotional mail.
 *
 * Tokens never expire: a link in an old email has to keep working. Account
 * mail (verify, reset) ignores the opt-out entirely.
 */

/** 64 hex chars. Anything else is rejected before touching the database. */
const TOKEN_RE = /^[0-9a-f]{64}$/;

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Builds the link for a mail to `userId`. Mints the token on first use. */
export async function unsubscribeUrl(userId: string): Promise<string | null> {
  const token = await getOrCreateUnsubscribeToken(userId, randomBytes(32).toString("hex"));
  if (!token) return null;
  return `${appUrl()}/unsubscribe?token=${token}`;
}

/** Token to user, or null for anything malformed or unknown. */
export async function resolveUnsubscribeToken(
  token: unknown,
): Promise<{ userId: string; optedOut: boolean } | null> {
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return null;
  const found = await findUserByUnsubscribeToken(token);
  if (!found || !sameToken(found.token, token)) return null;
  return { userId: found.userId, optedOut: found.optedOut };
}

/** Opts the token's owner out. Idempotent. False when the token is not valid. */
export async function unsubscribeByToken(token: unknown): Promise<boolean> {
  const user = await resolveUnsubscribeToken(token);
  if (!user) return false;
  await setMarketingOptOut(user.userId, true);
  return true;
}

/** Undo: clears the opt-out. False when the token is not valid. */
export async function resubscribeByToken(token: unknown): Promise<boolean> {
  const user = await resolveUnsubscribeToken(token);
  if (!user) return false;
  await setMarketingOptOut(user.userId, false);
  return true;
}

/** For the future send script: skip anyone for whom this is true. */
export function isOptedOut(userId: string): Promise<boolean> {
  return isMarketingOptedOut(userId);
}

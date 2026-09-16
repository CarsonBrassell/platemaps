import { createHash, randomBytes } from "node:crypto";

/**
 * One-shot secrets sent by email — verification links and password resets.
 * Server-only, like `lib/db.ts`.
 *
 * Both tables store the **hash** and never the token itself. The raw value
 * exists in exactly one place, the sent mail, so a dumped table hands over
 * nothing usable. That only holds while every producer and consumer hashes
 * identically, which is why this is one function rather than one per feature —
 * a second copy that hashed differently would mint links nothing could redeem,
 * and the failure would look like an expiry bug.
 */

/**
 * SHA-256, unsalted and unstretched. For a password that would be
 * indefensible; here it is right. The input is 32 bytes of `randomBytes`, so
 * there is no dictionary to run and nothing to guess — the hash is protecting
 * against a leaked table, not against a weak secret.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** 256 bits, hex — safe in a URL without escaping. */
export function newToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Server-side lifetime for a `sessions` row, shared with the cookie's
 * max-age (`SESSION_MAX_AGE` in `lib/session.ts`) so the two clocks can't
 * drift apart. It lives here rather than in `session.ts` because
 * `session.ts` imports `lib/db.ts`, and `lib/db.ts` needs this constant too
 * — this is the leaf both of them can import without a cycle.
 */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 400;

import {
  BLOCKED_MESSAGE,
  RESERVED_USERNAME_MESSAGE,
  isReservedUsername,
  moderateUsername,
} from "@/lib/moderation";

/**
 * The rule for a username being chosen for a new account, for the Apple /
 * Google finish screen.
 *
 * The same three checks, in the same order, with the same sentences and
 * status codes as `auth/signup` — which keeps its own copy, as
 * `account/username` does and for the reason that route's comment gives. If
 * the pattern or a message changes, it changes in all three.
 *
 * Uniqueness is not here: that is a database question and the caller asks it.
 */
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,24}$/;

/** Null when the name may be used, otherwise the answer to send. */
export function checkNewUsername(name: unknown): { error: string; status: number } | null {
  if (typeof name !== "string" || !USERNAME_PATTERN.test(name)) {
    return {
      error: "Username must be 3-24 characters, letters, numbers and underscores only.",
      status: 400,
    };
  }

  /* Same stricter tier as a rename — a handle chosen at signup is the one
     everybody sees. See moderateUsername. */
  if (moderateUsername(name).action === "block") {
    return { error: BLOCKED_MESSAGE, status: 422 };
  }

  if (isReservedUsername(name)) {
    return { error: RESERVED_USERNAME_MESSAGE, status: 422 };
  }

  return null;
}

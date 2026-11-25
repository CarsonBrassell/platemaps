/**
 * Every way an Apple / Google sign-in can end badly, as a fixed code and the
 * one sentence shown for it.
 *
 * No imports, so the routes and the screens can both read it. The website
 * callback can only speak through a redirect, and it puts the CODE in the
 * URL (`?oauth=error&reason=email_in_use`), never a sentence and never
 * anything a provider sent: text that arrives in a query string and is then
 * rendered is how a link becomes a message in the app's own voice. The
 * screen looks the code up here; an unknown code gets the generic line.
 */
export const OAUTH_ERRORS = {
  unavailable: "That sign-in option isn't available right now.",
  expired: "That sign-in took too long or was already used. Try again.",
  invalid_token: "That sign-in couldn't be verified. Try again.",
  cancelled: "Sign-in was cancelled.",
  email_in_use:
    "That email already has a PlateMaps account. Log in with its password (or reset it), then connect this sign-in in Settings.",
  identity_in_use: "That Apple or Google account is already connected to a different PlateMaps account.",
  provider_already_linked: "This account already has a sign-in from that provider. Disconnect it first.",
  session_mismatch: "You were signed out, or signed in as someone else, part-way through. Try again.",
  verify_email_first: "Confirm your email first.",
  not_linked: "That isn't the Apple or Google account connected to this PlateMaps account.",
  reauth_required: "Confirm with Apple or Google first.",
  busy: "Too many tries. Wait a few minutes, then try again.",
} as const;

export type OAuthErrorReason = keyof typeof OAUTH_ERRORS;

/** The sentence for a code off a URL — which is untrusted, so it is looked up, never echoed. */
export function oauthErrorMessage(reason: string | null | undefined): string {
  if (reason && Object.prototype.hasOwnProperty.call(OAUTH_ERRORS, reason)) {
    return OAUTH_ERRORS[reason as OAuthErrorReason];
  }
  return "Something went wrong signing in. Try again.";
}

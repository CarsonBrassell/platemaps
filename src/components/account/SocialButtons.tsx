"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { oauthErrorMessage } from "@/lib/oauth/errorCodes";
import {
  forgetOAuthReturn,
  oauthReturn,
  socialAvailability,
  startOAuth,
  tidyOAuthReturn,
  type OAuthReturnTo,
  type SocialAvailability,
  type SocialProvider,
} from "@/lib/oauthClient";

/**
 * "Continue with Apple" / "Continue with Google", and the hook the two
 * sign-in screens share for everything around them.
 *
 * **Nothing here renders unless the server says a provider is ready.** With
 * no configuration `useSocialAvailability` settles on `mode: "none"` and
 * `SocialButtons` returns null — no button, no "or", no reserved space — so
 * the sign-in card is exactly the card it was before this existed.
 *
 * ## The one sanctioned break from the colour tokens
 *
 * These two buttons wear Apple's and Google's colours, not PlateMaps's, and
 * that is recorded in DESIGN.md as a named exception. Both companies publish
 * rules for a button carrying their mark (Apple: black or white with the
 * logo and "Continue with Apple"; Google: its neutral `#F2F2F2` fill, the
 * unaltered four-colour G, `#1F1F1F` text), and an App Store reviewer checks
 * the Apple one. Both lists of permitted titles are "Sign in with", "Sign up
 * with" and "Continue with" — so a pill carrying a mark here only ever reads
 * "Continue with …", in Settings and the delete panels too. Everything that is *ours* about them still follows the
 * system: full-width `rounded-full` pills, the 44px floor, no border, no
 * shadow, the system sans, the orange focus ring.
 *
 * They never take the orange. The card keeps exactly one primary action —
 * "Create account" / "Log in" — and these sit above it as alternatives.
 */

export const PROVIDER_NAME: Record<SocialProvider, string> = { apple: "Apple", google: "Google" };

/** What the finish screen needs to know about the person waiting on it. */
export type PendingSignup = {
  provider: SocialProvider;
  /** Already masked by the server (`j•••@gmail.com`), or null when the provider gave none. */
  email: string | null;
  needsEmail: boolean;
};

/**
 * Which sign-in options this page may offer; `null` until the server has
 * answered. Starts null on the server render and the first client frame
 * alike, so nothing here can cause a hydration mismatch.
 */
export function useSocialAvailability(): SocialAvailability | null {
  const [availability, setAvailability] = useState<SocialAvailability | null>(null);
  useEffect(() => {
    let cancelled = false;
    void socialAvailability().then((value) => {
      if (!cancelled) setAvailability(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return availability;
}

/**
 * The state both sign-in forms (desktop `/account`, phone `PhoneProfileAuth`)
 * keep around the buttons: whether a new person is waiting on the finish
 * screen, and what the website trip said when it came back.
 *
 * Everything it returns is inert while sign-in is not live, with one visible
 * exception. A hand-typed `?oauth=finish` or `?oauth=error` on an
 * unconfigured site shows no finish screen and no sentence — `finish` stays
 * null and `notice` stays empty until the server has said a provider is
 * ready — but `?oauth=finish` does set `settling`, so the card is held back
 * for the one config fetch it takes to find that out (it ends when the fetch
 * settles, including on failure).
 */
export function useSocialSignIn() {
  const availability = useSocialAvailability();
  const [returned] = useState(() => oauthReturn());
  /* "load": the website callback parked a new person and sent them here; the
     finish screen fetches its own summary. An object: the app's native flow
     already has the summary in hand. */
  const [pending, setPending] = useState<PendingSignup | "load" | null>(
    returned?.kind === "finish" ? "load" : null
  );

  useEffect(() => {
    tidyOAuthReturn();
    // Leaving the screen ends the return's relevance; see oauthReturn().
    return forgetOAuthReturn;
  }, []);

  const live = availability !== null && availability.mode !== "none";

  return {
    availability,
    /** Non-null while the finish screen should replace the form. */
    finish: live ? pending : null,
    /** True for the beat between landing on `?oauth=finish` and the server's answer, so the form does not flash first. */
    settling: availability === null && pending !== null,
    /** A fixed sentence for `?oauth=error&reason=…`; the raw value is never shown. */
    notice: live && returned?.kind === "error" ? oauthErrorMessage(returned.reason) : "",
    openFinish: (signup: PendingSignup) => setPending(signup),
    closeFinish: () => {
      setPending(null);
      forgetOAuthReturn();
    },
  };
}

/** Apple's logo. Drawn in `currentColor`, which the button sets to white. */
function AppleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="shrink-0">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  );
}

/** Google's "G", in its own four colours. Google's rules: never recoloured, never redrawn in one tone. */
function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" className="shrink-0">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

const PILL =
  "flex min-h-11 items-center justify-center gap-2.5 rounded-full px-4 font-medium transition-transform active:scale-[0.97] disabled:opacity-60 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";

/* The brand fills — see the header comment and DESIGN.md. Literal values on
   purpose: these are not tokens and must not drift with the palette. */
const BRAND: Record<SocialProvider, string> = {
  apple: "bg-black text-white",
  google: "bg-[#F2F2F2] text-[#1F1F1F]",
};

/**
 * One brand pill. Exported because Settings and the delete panels use the
 * same button to confirm or connect — same mark, same rules, same clothes,
 * so a confirmation never looks like a different company's button.
 *
 * **The title is fixed: "Continue with Apple" / "Continue with Google".**
 * There is deliberately no prop to change the verb. Neither company's button
 * rules list "Confirm with" or "Connect with" as a title for a button showing
 * its mark, and these buttons sit on the settings and account-deletion
 * screens App Review exercises. What the press is FOR is said by the sentence
 * above the button at each call site. A control that needs its own words
 * ("Disconnect Google") is an ordinary PlateMaps pill with no logo.
 */
export function ProviderButton({
  provider,
  onClick,
  disabled = false,
  size = "phone",
  fit = false,
  className = "",
}: {
  provider: SocialProvider;
  onClick: () => void;
  disabled?: boolean;
  /** Label size only: 15px where thumbs are, 14px on the desktop card. Both keep the 44px target. */
  size?: "phone" | "desktop";
  /** Content width, for a desktop settings row. Full width everywhere else. */
  fit?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${PILL} ${BRAND[provider]} ${size === "phone" ? "text-[15px]" : "text-sm"} ${
        fit ? "w-fit" : "w-full"
      } ${className}`}
    >
      {provider === "apple" ? <AppleLogo /> : <GoogleLogo />}
      Continue with {PROVIDER_NAME[provider]}
    </button>
  );
}

/**
 * The sign-in buttons and the small "or" under them. Sits above the email
 * fields on both sign-in cards.
 *
 * Returns null when nothing is on offer, including while the server has not
 * answered yet — a card that grows two buttons a moment after it appears is
 * a smaller sin than one that shows buttons it then has to take away.
 *
 * A known person is signed in here (`completeOAuth`), exactly as the password
 * form's `signIn` ends. A new person is handed up through `onNeedsSignup`,
 * because the finish screen replaces the whole card and only the parent can
 * do that.
 */
export function SocialButtons({
  availability,
  variant,
  returnTo,
  next,
  onNeedsSignup,
  initialError = "",
}: {
  availability: SocialAvailability | null;
  /** "page" and "sheet" are the phone card and the first-open sheet; "desktop" is `/account`. */
  variant: "page" | "sheet" | "desktop";
  returnTo: OAuthReturnTo;
  /** Where the visitor was headed, so the website trip can bring them back to it. */
  next?: string | null;
  onNeedsSignup: (signup: PendingSignup) => void;
  /** What the website trip said went wrong, already turned into a fixed sentence. */
  initialError?: string;
}) {
  const { completeOAuth } = useAuth();
  const [busy, setBusy] = useState<SocialProvider | null>(null);
  /* null: nothing has been tried from this card yet, so whatever the website
     trip said (`initialError`) is what shows. It cannot be copied into state
     at mount: the parent only learns that sentence after the availability
     fetch resolves, a tick after this component first renders, and a
     useState initial value is read once. "" (a new attempt started) is not
     null, so pressing a button clears the old sentence. */
  const [error, setError] = useState<string | null>(null);
  const shown = error ?? initialError;

  if (!availability || availability.mode === "none") return null;

  async function go(provider: SocialProvider) {
    setBusy(provider);
    setError("");
    const result = await startOAuth(provider, "signin", { returnTo, next });
    // The tab is leaving for Google: stay busy, so nothing can be tapped on
    // a page that is about to be replaced.
    if (result.status === "redirecting") return;
    setBusy(null);
    if (result.status === "signed_in") completeOAuth(result.account);
    else if (result.status === "needs_signup") {
      onNeedsSignup({ provider: result.provider, email: result.email, needsEmail: result.needsEmail });
    } else if (result.status === "error") setError(result.message);
    // "cancelled": the person closed the sheet. Saying so would be noise.
  }

  const size = variant === "desktop" ? "desktop" : "phone";

  return (
    <div className={variant === "desktop" ? "mb-5" : "mb-4"}>
      <div className="flex flex-col gap-2">
        {availability.providers.map((provider) => (
          <ProviderButton
            key={provider}
            provider={provider}
            size={size}
            disabled={busy !== null}
            onClick={() => void go(provider)}
          />
        ))}
      </div>

      {busy && (
        <p role="status" className="mt-2 text-center text-xs text-zinc-500">
          Opening {PROVIDER_NAME[busy]}…
        </p>
      )}
      {shown && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {shown}
        </p>
      )}

      {/* A word, not a rule with a word on it. DESIGN.md has no hairlines;
          what separates the two ways in is the space and this label. */}
      <p className="mono-label mt-4 text-center text-zinc-500">or</p>
    </div>
  );
}

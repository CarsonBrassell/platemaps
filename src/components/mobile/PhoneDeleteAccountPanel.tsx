"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryParams } from "@/lib/queryString";
import { useDeleteAccount } from "@/components/account/useDeleteAccount";
import { PROVIDER_NAME, ProviderButton } from "@/components/account/SocialButtons";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";

/**
 * Delete account, phone.
 *
 * The web panel's twin — same shared hook, deliberately different clothes.
 * Three things change on a handset:
 *
 * - Every control is full width and `min-h-11`, because these are thumb
 *   targets rather than mouse targets.
 * - The password field sets at 16px (`text-base`). Anything smaller makes iOS
 *   Safari zoom the viewport on focus, and a page that jumps as you tap into
 *   the field is a bad thing to do on the one screen where you want someone
 *   reading carefully. Same rule PhoneFeedSearch follows.
 * - Confirm sits **below** "Keep my account" rather than beside it, so the
 *   destructive button is not the one directly under a thumb resting at the
 *   bottom of the screen.
 *
 * Why this screen and not a modal: App Store review has to be able to *find*
 * it. A reviewer looks in the profile screen, and a flow buried behind a
 * dialog they never open reads as a missing flow.
 *
 * ## Why there is a fourth state here that the hook does not know about
 *
 * `useDeleteAccount` arms, re-authenticates and redirects, and that was taken
 * as three steps. On a handset it is closer to one and a half. Arming used to
 * render the consequences, the password field and the filled red button all at
 * once, and iOS offers the saved password as a single suggestion chip above
 * the keyboard — so a mis-tap on "Delete account" landed on a screen where a
 * live delete was two taps away, both of them in the place a thumb already
 * was. The password requirement is a check that it is *you*; it was never a
 * check that you *meant it*, and autofill is precisely what collapses the
 * difference.
 *
 * So `sure` splits the armed state in two. The gate asks the question in
 * plain words and offers nothing but an answer — no field to fill, and no
 * `type="submit"` in the subtree, so there is nothing on that screen that can
 * reach `confirm()` however it is tapped. Only after an explicit yes does the
 * password step exist at all.
 *
 * It is local state rather than a fourth thing on the hook because it answers
 * a question about *this* screen's ergonomics. The hook is deliberately the
 * home of what must never drift between the two panels — arming,
 * re-authentication, the redirect. A gate the web panel does not need does not
 * belong in there pretending to be shared.
 *
 * Red escalates across the three screens and never lies about what a tap does:
 * `text-red-700` on white for the two buttons that only advance, the filled
 * `bg-red-700` once and only on the button that actually fires. "Keep my
 * account" is never red, is the same full-width `min-h-11` target as the
 * button beside it, and comes first on both screens — backing out must never
 * be the harder thing to hit.
 */
export function PhoneDeleteAccountPanel() {
  const nav = useQueryParams().get("nav");
  const {
    armed,
    arm,
    disarm,
    password,
    setPassword,
    error,
    busy,
    confirm,
    passwordless,
    provider,
    providerLoading,
    confirmed,
    leavesPage,
  } = useDeleteAccount(nav ? `/m?nav=${nav}` : "/m", "/m/account/settings");

  /* Starts true only when the website trip to Google has just come back for
     this action: the person already answered "are you sure" before leaving,
     and landing them back on that question would read as the confirmation
     having failed. Always false otherwise. */
  const [sure, setSure] = useState(confirmed);

  /* An account made with Apple or Google has no password to ask for — see
     useDeleteAccount. False for every account with a password. */
  const mustLeaveFirst = passwordless && provider !== null && leavesPage && !confirmed;

  /* Back from confirming with Google, this panel is the reason for the trip
     and it sits at the very bottom of the screen. Bring it into view once,
     rather than landing somebody at the top of Settings to wonder whether
     anything happened. Never runs otherwise: `confirmed` starts false. */
  const panelRef = useRef<HTMLDivElement>(null);
  const cameBack = useRef(confirmed);
  useEffect(() => {
    if (cameBack.current) panelRef.current?.scrollIntoView({ block: "center" });
  }, []);

  // Backing out from either screen goes all the way to rest, not one screen
  // back. `disarm` is what clears the typed password, so this path has to run
  // through it rather than only dropping the gate.
  function keepAccount() {
    setSure(false);
    disarm();
  }

  return (
    <div ref={panelRef} className="mt-8 rounded-2xl bg-pm-grey-tint/40 p-4">
      <p className="mono-label mb-3 text-pm-grey-text">Delete account</p>

      {!armed ? (
        <>
          <p className="mb-3 text-sm text-zinc-600">
            Permanently deletes your account, your posts, your ratings and your comments.
          </p>
          <button
            type="button"
            onClick={arm}
            className={`min-h-11 w-full rounded-full bg-white px-4 text-sm font-medium text-red-700 transition-transform active:scale-[0.98] ${FOCUS}`}
          >
            Delete account
          </button>
        </>
      ) : !sure ? (
        <div>
          <p className="mb-2 text-sm font-semibold text-zinc-900">Are you sure?</p>
          {/* Spelled out rather than summarised as "this cannot be undone",
              which everyone has learned to tap past. The list is what actually
              goes, and this is the screen where it gets read — by the password
              step the decision is already made. */}
          <p className="mb-3 text-sm leading-relaxed text-zinc-700">
            This deletes your account and everything on it — your posts and the plates you
            rated, your comments, your saves and your friends. It cannot be undone, and there
            is no way to get any of it back.
          </p>

          <button
            type="button"
            onClick={keepAccount}
            className={`mb-2 min-h-11 w-full rounded-full bg-white px-4 text-sm font-medium text-zinc-700 transition-transform active:scale-[0.98] ${FOCUS}`}
          >
            Keep my account
          </button>
          <button
            type="button"
            onClick={() => setSure(true)}
            className={`min-h-11 w-full rounded-full bg-white px-4 text-sm font-medium text-red-700 transition-transform active:scale-[0.98] ${FOCUS}`}
          >
            Yes, delete my account
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void confirm();
          }}
        >
          {passwordless ? (
            <p className="mb-3 text-sm text-zinc-600">
              {providerLoading
                ? "One moment…"
                : provider === null
                  ? "This account has no password, and confirming with Apple or Google isn't available here. Delete it from the latest PlateMaps app, or log out and use Forgot password to set a password first."
                  : confirmed
                    ? `Confirmed with ${PROVIDER_NAME[provider]}. Last step: this deletes your account permanently.`
                    : `Last step. This account has no password, so confirm it's you with ${PROVIDER_NAME[provider]} to delete it permanently.`}
            </p>
          ) : (
          <>
          <p className="mb-3 text-sm text-zinc-600">
            Last step. Enter your password to delete your account permanently.
          </p>

          <label htmlFor="phone-delete-account-password" className="sr-only">
            Password
          </label>
          <input
            id="phone-delete-account-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            className={`mb-3 min-h-11 w-full rounded-full bg-white px-4 text-base text-zinc-900 outline-none disabled:opacity-50 ${FOCUS}`}
          />
          </>
          )}

          {error && (
            <p role="alert" className="mb-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={keepAccount}
            disabled={busy}
            className={`mb-2 min-h-11 w-full rounded-full bg-white px-4 text-sm font-medium text-zinc-700 transition-transform active:scale-[0.98] disabled:opacity-50 ${FOCUS}`}
          >
            Keep my account
          </button>
          {mustLeaveFirst && provider ? (
            /* On the website the confirmation is a trip to Google and back.
               It wears Google's button, not the filled red: this press
               deletes nothing, and red never lies about what a tap does. */
            <ProviderButton
              provider={provider}
              disabled={busy}
              onClick={() => void confirm()}
            />
          ) : (
          <button
            type="submit"
            disabled={busy || (passwordless ? provider === null && !confirmed : password.length === 0)}
            className={`min-h-11 w-full rounded-full bg-red-700 px-4 text-sm font-medium text-white transition-transform active:scale-[0.98] disabled:opacity-50 ${FOCUS}`}
          >
            {busy
              ? "Deleting…"
              : passwordless && provider && !confirmed
                ? `Confirm with ${PROVIDER_NAME[provider]} and delete`
                : "Delete my account"}
          </button>
          )}
        </form>
      )}
    </div>
  );
}

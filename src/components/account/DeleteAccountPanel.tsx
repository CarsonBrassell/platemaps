"use client";

import { useEffect, useRef } from "react";
import { useDeleteAccount } from "@/components/account/useDeleteAccount";
import { PROVIDER_NAME, ProviderButton } from "@/components/account/SocialButtons";

/**
 * Delete account, web.
 *
 * Required by App Store guideline 5.1.1(v) — an app that creates accounts has
 * to delete them from inside itself — and by the privacy policy, which has
 * been promising this since it shipped.
 *
 * Shares `ProfileSettingsPanel`'s shell (mono-label over a tinted card) rather
 * than inventing a red-bordered "danger zone", because this *is* a setting and
 * the design system has no outline treatment: grouping here is a tone change,
 * never a border. Red does one job and only after you have asked for it — the
 * resting state is a quiet grey-tint button, and `red-700` (DESIGN.md's one
 * destructive colour) appears on the confirm button and nowhere else.
 *
 * Sits last on the account page for the ordinary reason: you scroll past
 * everything you might have wanted instead before you reach the end.
 */
export function DeleteAccountPanel() {
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
  } = useDeleteAccount("/", "/account/settings");

  /* An account made with Apple or Google has no password to ask for. What
     stands in its place depends on where this is running — see
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

  return (
    <div ref={panelRef} className="mb-6 rounded-xl bg-pm-grey-tint/40 p-4">
      <p className="mono-label mb-3 text-zinc-500">Delete account</p>

      {!armed ? (
        <>
          <p className="mb-3 text-sm text-zinc-600">
            Permanently deletes your account, your posts, your ratings and your comments.
          </p>
          <button
            type="button"
            onClick={arm}
            className="min-h-11 rounded-full bg-white px-4 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            Delete account
          </button>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void confirm();
          }}
        >
          {/* Spelled out rather than summarised as "this cannot be undone",
              which everyone has learned to click past. The list is what
              actually goes. */}
          <p className="mb-2 text-sm text-zinc-700">
            This deletes your account and everything on it — your posts and the plates you
            rated, your comments, your saves and your friends. It cannot be undone, and there
            is no way to get any of it back.
          </p>
          {passwordless ? (
            <p className="mb-3 text-sm text-zinc-600">
              {providerLoading
                ? "One moment…"
                : provider === null
                  ? "This account has no password, and confirming with Apple or Google isn't available here. Delete it from the latest PlateMaps app, or log out and use Forgot password to set a password first."
                  : confirmed
                    ? `Confirmed with ${PROVIDER_NAME[provider]}. This is the last step.`
                    : `This account has no password, so confirm it's you with ${PROVIDER_NAME[provider]}.`}
            </p>
          ) : (
          <>
          <p className="mb-3 text-sm text-zinc-600">
            Enter your password to confirm.
          </p>

          <label htmlFor="delete-account-password" className="sr-only">
            Password
          </label>
          <input
            id="delete-account-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            /* autoFocus is right for once: the button that revealed this row
               is gone, so focus would otherwise be on nothing and a keyboard
               user would have to hunt for the field they just asked for. */
            autoFocus
            className="mb-3 min-h-11 w-full rounded-full bg-white px-4 text-base md:text-sm text-zinc-900 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange disabled:opacity-50"
          />
          </>
          )}

          {error && (
            <p role="alert" className="mb-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {mustLeaveFirst && provider ? (
              /* On the website the confirmation is a trip to Google and back.
                 It wears Google's button, not the red one: this press deletes
                 nothing, and red is kept for the press that does. */
              <ProviderButton
                provider={provider}
                size="desktop"
                fit
                disabled={busy}
                onClick={() => void confirm()}
              />
            ) : (
            <button
              type="submit"
              disabled={
                busy || (passwordless ? provider === null && !confirmed : password.length === 0)
              }
              className="min-h-11 rounded-full bg-red-700 px-4 text-sm font-medium text-white transition-all hover:bg-red-800 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange disabled:opacity-50"
            >
              {busy
                ? "Deleting…"
                : passwordless && provider && !confirmed
                  ? `Confirm with ${PROVIDER_NAME[provider]} and delete`
                  : "Delete my account"}
            </button>
            )}
            <button
              type="button"
              onClick={disarm}
              disabled={busy}
              className="min-h-11 rounded-full bg-white px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange disabled:opacity-50"
            >
              Keep my account
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

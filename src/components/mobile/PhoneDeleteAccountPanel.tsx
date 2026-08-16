"use client";

import { useSearchParams } from "next/navigation";
import { useDeleteAccount } from "@/components/account/useDeleteAccount";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";

/**
 * Delete account, phone.
 *
 * The web panel's twin — same three-step flow, same shared hook, deliberately
 * different clothes. Three things change on a handset:
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
 */
export function PhoneDeleteAccountPanel() {
  const nav = useSearchParams().get("nav");
  const { armed, arm, disarm, password, setPassword, error, busy, confirm } =
    useDeleteAccount(nav ? `/m?nav=${nav}` : "/m");

  return (
    <div className="mt-8 rounded-2xl bg-pm-grey-tint/40 p-4">
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
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void confirm();
          }}
        >
          <p className="mb-2 text-sm leading-relaxed text-zinc-700">
            This deletes your account and everything on it — your posts and the plates you
            rated, your comments, your saves and your friends. It cannot be undone, and there
            is no way to get any of it back.
          </p>
          <p className="mb-3 text-sm text-zinc-600">Enter your password to confirm.</p>

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

          {error && (
            <p role="alert" className="mb-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={disarm}
            disabled={busy}
            className={`mb-2 min-h-11 w-full rounded-full bg-white px-4 text-sm font-medium text-zinc-700 transition-transform active:scale-[0.98] disabled:opacity-50 ${FOCUS}`}
          >
            Keep my account
          </button>
          <button
            type="submit"
            disabled={busy || password.length === 0}
            className={`min-h-11 w-full rounded-full bg-red-700 px-4 text-sm font-medium text-white transition-transform active:scale-[0.98] disabled:opacity-50 ${FOCUS}`}
          >
            {busy ? "Deleting…" : "Delete my account"}
          </button>
        </form>
      )}
    </div>
  );
}

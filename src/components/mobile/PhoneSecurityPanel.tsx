"use client";

import { useAccountSecurity, devicesEndedLabel } from "@/components/account/useAccountSecurity";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";

/* text-[16px] on every input, not text-sm: iOS zooms the whole viewport on
   focus for anything under 16px, and the page never zooms back out. */
const INPUT = `mb-2 min-h-11 w-full rounded-full bg-white px-4 text-[16px] text-zinc-900 outline-none disabled:opacity-50 ${FOCUS}`;

const BUTTON = `min-h-11 w-full rounded-full bg-white px-4 text-sm font-medium text-zinc-700 transition-all active:scale-[0.98] disabled:opacity-50 ${FOCUS}`;

/**
 * The phone half of `SecurityPanel` — same four actions, same shared hook, laid
 * out for a handset: full-width targets stacked rather than a row of buttons,
 * and 16px inputs so focusing one doesn't zoom the viewport.
 *
 * Two components rather than one responsive one, the same trade
 * `PhoneDeleteAccountPanel` makes. What isn't written twice is the part with
 * consequences — `useAccountSecurity` owns that.
 */
export function PhoneSecurityPanel() {
  const { username, password, devices } = useAccountSecurity();

  return (
    <div className="mb-6 rounded-xl bg-pm-grey-tint/40 p-3.5">
      <p className="mono-label mb-3 text-zinc-500">Account</p>

      {/* --- Username ---------------------------------------------------- */}
      <label htmlFor="phone-username" className="mb-1 block text-sm font-medium text-zinc-700">
        Username
      </label>
      <p className="mb-2 text-xs leading-snug text-zinc-500">
        3-24 characters, letters, numbers and underscores. Changing it frees your old one
        for someone else.
      </p>
      <input
        id="phone-username"
        value={username.value}
        onChange={(e) => username.set(e.target.value)}
        disabled={username.busy}
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        className={INPUT}
      />
      <button
        type="button"
        onClick={() => void username.save()}
        disabled={username.busy || !username.dirty}
        className={`${BUTTON} mb-1`}
      >
        {username.busy ? "Saving…" : "Save username"}
      </button>
      {username.saved && <p className="mb-3 text-xs text-zinc-500">Saved.</p>}
      {username.error && (
        <p role="alert" className="mb-3 text-xs text-red-700">
          {username.error}
        </p>
      )}
      {!username.saved && !username.error && <div className="mb-3" />}

      {/* --- Password ---------------------------------------------------- */}
      {!password.armed ? (
        <div className="mb-3">
          <button type="button" onClick={password.arm} className={BUTTON}>
            Change password
          </button>
          {password.done !== null && (
            <p className="mt-2 text-xs leading-snug text-zinc-500">
              Password changed. {devicesEndedLabel(password.done)}
            </p>
          )}
        </div>
      ) : (
        <form
          className="mb-3"
          onSubmit={(e) => {
            e.preventDefault();
            void password.save();
          }}
        >
          <label
            htmlFor="phone-current-password"
            className="mb-1 block text-sm font-medium text-zinc-700"
          >
            Current password
          </label>
          <input
            id="phone-current-password"
            type="password"
            autoComplete="current-password"
            value={password.current}
            onChange={(e) => password.setCurrent(e.target.value)}
            disabled={password.busy}
            autoFocus
            className={INPUT}
          />
          <label
            htmlFor="phone-new-password"
            className="mb-1 block text-sm font-medium text-zinc-700"
          >
            New password
          </label>
          <input
            id="phone-new-password"
            type="password"
            autoComplete="new-password"
            value={password.next}
            onChange={(e) => password.setNext(e.target.value)}
            disabled={password.busy}
            className={INPUT}
          />
          <p className="mb-2 text-xs leading-snug text-zinc-500">
            Saving this signs you out everywhere else. This phone stays signed in.
          </p>
          {password.error && (
            <p role="alert" className="mb-2 text-xs text-red-700">
              {password.error}
            </p>
          )}
          <button
            type="submit"
            disabled={password.busy || !password.current || !password.next}
            className={`${BUTTON} mb-2`}
          >
            {password.busy ? "Saving…" : "Save password"}
          </button>
          <button
            type="button"
            onClick={password.disarm}
            disabled={password.busy}
            className={BUTTON}
          >
            Cancel
          </button>
        </form>
      )}

      {/* --- Other devices ----------------------------------------------- */}
      <div className="mb-3">
        <button
          type="button"
          onClick={() => void devices.end()}
          disabled={devices.busy}
          className={BUTTON}
        >
          {devices.busy ? "Signing out…" : "Sign out other devices"}
        </button>
        {devices.done !== null && (
          <p className="mt-2 text-xs text-zinc-500">{devicesEndedLabel(devices.done)}</p>
        )}
        {devices.error && (
          <p role="alert" className="mt-2 text-xs text-red-700">
            {devices.error}
          </p>
        )}
      </div>

      {/* --- Export ------------------------------------------------------- */}
      <a href="/api/account/export" download className={`block text-center ${BUTTON}`}>
        Download my data
      </a>
      <p className="mt-2 text-xs leading-snug text-zinc-500">
        Your posts, comments, saves, points and friends as a JSON file. Photos aren&apos;t
        included.
      </p>
    </div>
  );
}

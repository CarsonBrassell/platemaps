"use client";

import { useAccountSecurity, devicesEndedLabel } from "@/components/account/useAccountSecurity";

const INPUT =
  "mb-2 min-h-11 w-full rounded-full bg-white px-4 text-sm text-zinc-900 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange disabled:opacity-50";

const BUTTON =
  "min-h-11 rounded-full bg-white px-4 text-sm font-medium text-zinc-700 transition-all hover:bg-zinc-100 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange disabled:opacity-50";

/**
 * Username, password, other devices and the data export — the four things you
 * do *to* the account rather than settings that change what it shows.
 *
 * Shares `ProfileSettingsPanel`'s shell (mono-label over a tinted card) for the
 * same reason `DeleteAccountPanel` does: grouping in this design system is a
 * tone change, never a border, and a "security" section that invented its own
 * outline treatment would be the only one on the page.
 *
 * Sits above the delete panel, which stays last. These are all reversible;
 * that one isn't.
 */
export function SecurityPanel() {
  const { username, password, devices } = useAccountSecurity();

  return (
    <div className="mb-6 rounded-xl bg-pm-grey-tint/40 p-4">
      <p className="mono-label mb-3 text-zinc-500">Account</p>

      {/* --- Username ---------------------------------------------------- */}
      <label htmlFor="account-username" className="mb-1 block text-sm font-medium text-zinc-700">
        Username
      </label>
      <p className="mb-2 text-xs text-zinc-500">
        3-24 characters, letters, numbers and underscores. Changing it frees your old
        username for someone else to take.
      </p>
      <input
        id="account-username"
        value={username.value}
        onChange={(e) => username.set(e.target.value)}
        disabled={username.busy}
        autoComplete="username"
        className={INPUT}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void username.save()}
          disabled={username.busy || !username.dirty}
          className={BUTTON}
        >
          {username.busy ? "Saving…" : "Save username"}
        </button>
        {username.saved && <span className="text-xs text-zinc-500">Saved.</span>}
        {username.error && (
          <span role="alert" className="text-xs text-red-700">
            {username.error}
          </span>
        )}
      </div>

      {/* --- Password ---------------------------------------------------- */}
      {!password.armed ? (
        <div className="mb-4">
          <button type="button" onClick={password.arm} className={BUTTON}>
            Change password
          </button>
          {password.done !== null && (
            <p className="mt-2 text-xs text-zinc-500">
              Password changed. {devicesEndedLabel(password.done)}
            </p>
          )}
        </div>
      ) : (
        <form
          className="mb-4"
          onSubmit={(e) => {
            e.preventDefault();
            void password.save();
          }}
        >
          <label htmlFor="current-password" className="mb-1 block text-sm font-medium text-zinc-700">
            Current password
          </label>
          <input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={password.current}
            onChange={(e) => password.setCurrent(e.target.value)}
            disabled={password.busy}
            autoFocus
            className={INPUT}
          />
          <label htmlFor="new-password" className="mb-1 block text-sm font-medium text-zinc-700">
            New password
          </label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={password.next}
            onChange={(e) => password.setNext(e.target.value)}
            disabled={password.busy}
            className={INPUT}
          />
          {/* Said before they submit, not after. Someone changing a password
              because a device was lost needs to know this is the thing that
              actually kicks that device out. */}
          <p className="mb-2 text-xs text-zinc-500">
            Saving this signs you out everywhere else. This device stays signed in.
          </p>
          {password.error && (
            <p role="alert" className="mb-2 text-xs text-red-700">
              {password.error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={password.busy || !password.current || !password.next}
              className={BUTTON}
            >
              {password.busy ? "Saving…" : "Save password"}
            </button>
            <button type="button" onClick={password.disarm} disabled={password.busy} className={BUTTON}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* --- Other devices ----------------------------------------------- */}
      <div className="mb-4">
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
      {/* A plain link, not a fetch: the browser's own download handling is the
          whole feature, and the route already sends Content-Disposition. */}
      <a href="/api/account/export" download className={`inline-flex items-center ${BUTTON}`}>
        Download my data
      </a>
      <p className="mt-2 text-xs text-zinc-500">
        Your posts, comments, saves, points and friends as a JSON file. Photos aren&apos;t
        included.
      </p>
    </div>
  );
}

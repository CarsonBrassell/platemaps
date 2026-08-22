"use client";

import { useEffect } from "react";
import {
  LedgerActionRow,
  LedgerRow,
  LedgerSection,
  useLedgerRows,
  type LedgerVariant,
} from "@/components/account/ledger";
import { useAccountSecurity, devicesEndedLabel } from "@/components/account/useAccountSecurity";
import { useAuth } from "@/lib/auth";

/**
 * The things you do *to* the account rather than settings that change what it
 * shows — email, username, password, other devices, and the data export — as
 * ledger rows.
 *
 * Replaces `SecurityPanel` and `PhoneSecurityPanel`, which were two components
 * because the layouts differed: a row of buttons against a stack of full-width
 * ones. In the ledger both are a row that opens, so the difference collapses to
 * type size and where the action sits, and that is a variant. `useAccountSecurity`
 * still owns everything with consequences, exactly as it did before.
 *
 * The password row is its own disclosure now, which is what `armed` used to do
 * by hand. Closing the row clears both fields — a form holding two passwords is
 * the kind of thing that ends up in a screenshot.
 */
export function AccountLedger({ variant = "web" }: { variant?: LedgerVariant }) {
  const { account } = useAuth();
  const { email, username, password, devices } = useAccountSecurity();
  const rows = useLedgerRows();

  const emailOpen = rows.isOpen("email");
  const usernameOpen = rows.isOpen("username");
  const passwordOpen = rows.isOpen("password");

  const pending = account?.pendingEmail;
  const unverified = account !== null && !account.emailVerified;

  /**
   * What the row says without being opened.
   *
   * "Unverified" is the only alert-toned value in the ledger, and it earns it:
   * every account that existed before this shipped reads that way, truthfully,
   * because nobody ever proved anything. It is not a scold — it is the one
   * fact on this screen that can quietly cost somebody their account.
   */
  const emailState: {
    label: string;
    tone: "muted" | "alert";
    description: string;
  } = pending
    ? {
        label: "Pending",
        tone: "muted",
        description:
          "A link is waiting to be opened. Your address doesn't change until it is — so a typo just expires instead of locking you out.",
      }
    : unverified
      ? {
          label: "Unverified",
          tone: "alert",
          description:
            "Nobody has checked that you can read this address, and it's the only way back into your account if you're ever locked out. Confirming takes one click.",
        }
      : {
          label: "Verified",
          tone: "muted",
          description:
            "Changing it sends a link to the new address. Nothing moves until you open that link.",
        };

  useEffect(() => {
    // Same reasoning as the password row below: leaving another row closes
    // this one without passing through onToggle.
    if (!emailOpen) email.disarm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailOpen]);

  useEffect(() => {
    // Opening another row closes this one without going through onToggle, so
    // the clearing lives here rather than in the handler. Depending on
    // `password.disarm` would re-run this on every keystroke and wipe the form.
    if (!passwordOpen) password.disarm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passwordOpen]);

  // After the hooks, never before. Signed out there is no ledger to draw, and
  // guessing at a verification state while the account loads would flash
  // "Verified" at somebody whose address isn't.
  if (!account) return null;

  const input =
    /* text-base on the phone: iOS zooms the viewport for anything under 16px
       and never zooms back out. */
    `min-h-11 w-full rounded-full bg-pm-grey-tint/60 px-4 text-zinc-900 outline-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange disabled:opacity-50 ${
      variant === "phone" ? "text-base" : "text-sm"
    }`;

  const button = `min-h-11 rounded-full bg-pm-grey-tint px-4 text-sm font-medium text-zinc-700 transition-all hover:bg-pm-grey-tint/70 active:scale-[0.98] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${
    variant === "phone" ? "w-full" : ""
  }`;

  return (
    <LedgerSection label="Account">
      {/* --- Email ---------------------------------------------------------
          First, because it outranks everything under it: a username can be
          changed back and a password can be reset, and both of those go
          through this address. It is the only row here whose value can be
          wrong in a way you cannot fix from inside the account. */}
      <LedgerRow
        label="Email"
        state={emailState.label}
        stateTone={emailState.tone}
        description={emailState.description}
        variant={variant}
        open={emailOpen}
        onToggle={() => rows.toggle("email")}
      >
        {/* The address on file, stated plainly. The input below is what you
            want it to become, which is not the same fact. */}
        <p className="mb-3 font-mono text-[13px] tracking-[0.02em] text-zinc-800">
          {account?.email}
        </p>

        {unverified && !pending && (
          <button type="button" onClick={() => void email.resend()} disabled={email.busy} className={`${button} mb-3`}>
            {email.busy ? "Sending…" : "Send me a confirmation link"}
          </button>
        )}

        {pending && (
          <div className="mb-3">
            <p className="mb-2 text-xs leading-snug text-zinc-500">
              Waiting on{" "}
              <span className="font-mono text-[12px] tracking-[0.02em] text-zinc-800">
                {pending}
              </span>
              . Type your current address below to call it off.
            </p>
            <button type="button" onClick={() => void email.resend()} disabled={email.busy} className={button}>
              {email.busy ? "Sending…" : "Send the link again"}
            </button>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void email.save();
          }}
        >
          <input
            type="email"
            aria-label="New email address"
            placeholder="New email address"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            value={email.value}
            onChange={(e) => email.set(e.target.value)}
            disabled={email.busy}
            className={`${input} mb-2`}
          />
          <input
            type="password"
            aria-label="Current password"
            placeholder="Current password"
            autoComplete="current-password"
            value={email.password}
            onChange={(e) => email.setPassword(e.target.value)}
            disabled={email.busy}
            className={`${input} mb-2`}
          />
          {email.error && (
            <p role="alert" className="mb-2 text-xs text-red-700">
              {email.error}
            </p>
          )}
          {email.sent && (
            <p className="mb-2 text-xs leading-snug text-zinc-500">
              Link sent to{" "}
              <span className="font-mono text-[12px] tracking-[0.02em] text-zinc-800">
                {email.sent}
              </span>
              . It works once and expires in 24 hours.
              {email.notice && ` ${email.notice}`}
            </p>
          )}
          <button
            type="submit"
            disabled={email.busy || !email.dirty || !email.password}
            className={button}
          >
            {email.busy ? "Sending…" : "Send link to the new address"}
          </button>
        </form>
      </LedgerRow>

      {/* --- Username ------------------------------------------------------ */}
      <LedgerRow
        label="Username"
        state={username.value || "—"}
        description="3-24 characters, letters, numbers and underscores. Changing it frees your old username for someone else to take."
        variant={variant}
        open={usernameOpen}
        onToggle={() => rows.toggle("username")}
      >
        <input
          aria-label="Username"
          value={username.value}
          onChange={(e) => username.set(e.target.value)}
          disabled={username.busy}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          className={`${input} mb-2`}
        />
        <div className={variant === "phone" ? "" : "flex flex-wrap items-center gap-2"}>
          <button
            type="button"
            onClick={() => void username.save()}
            disabled={username.busy || !username.dirty}
            className={button}
          >
            {username.busy ? "Saving…" : "Save username"}
          </button>
          {username.saved && (
            <p className={`text-xs text-zinc-500 ${variant === "phone" ? "mt-2" : ""}`}>Saved.</p>
          )}
          {username.error && (
            <p role="alert" className={`text-xs text-red-700 ${variant === "phone" ? "mt-2" : ""}`}>
              {username.error}
            </p>
          )}
        </div>
      </LedgerRow>

      {/* --- Password ------------------------------------------------------ */}
      <LedgerRow
        label="Password"
        state="••••••••"
        description="Saving a new one signs you out everywhere else. This device stays signed in."
        variant={variant}
        open={passwordOpen}
        onToggle={() => rows.toggle("password")}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void password.save();
          }}
        >
          <input
            type="password"
            aria-label="Current password"
            placeholder="Current password"
            autoComplete="current-password"
            value={password.current}
            onChange={(e) => password.setCurrent(e.target.value)}
            disabled={password.busy}
            className={`${input} mb-2`}
          />
          <input
            type="password"
            aria-label="New password"
            placeholder="New password"
            autoComplete="new-password"
            value={password.next}
            onChange={(e) => password.setNext(e.target.value)}
            disabled={password.busy}
            className={`${input} mb-2`}
          />
          {password.error && (
            <p role="alert" className="mb-2 text-xs text-red-700">
              {password.error}
            </p>
          )}
          {password.done !== null && (
            <p className="mb-2 text-xs text-zinc-500">
              Password changed. {devicesEndedLabel(password.done)}
            </p>
          )}
          <button
            type="submit"
            disabled={password.busy || !password.current || !password.next}
            className={button}
          >
            {password.busy ? "Saving…" : "Save password"}
          </button>
        </form>
      </LedgerRow>

      {/* --- Other devices -------------------------------------------------
          No state to report: the sessions table isn't surfaced anywhere, so
          this row can't honestly say how many there are. It stays an action
          until there's a device list to count. */}
      <LedgerActionRow
        label="Other devices"
        variant={variant}
        description={
          devices.error
            ? devices.error
            : devices.done !== null
              ? devicesEndedLabel(devices.done)
              : "Ends every session except this one."
        }
        action={
          <button
            type="button"
            onClick={() => void devices.end()}
            disabled={devices.busy}
            className={button}
          >
            {devices.busy ? "Signing out…" : "Sign out other devices"}
          </button>
        }
      />

      {/* --- Export --------------------------------------------------------
          A plain link, not a fetch: the browser's own download handling is the
          whole feature, and the route already sends Content-Disposition. */}
      <LedgerActionRow
        label="Your data"
        variant={variant}
        description="Your posts, comments, saves, points and friends as a JSON file. Photos aren't included."
        action={
          <a
            href="/api/account/export"
            download
            className={`inline-flex items-center justify-center ${button}`}
          >
            Download my data
          </a>
        }
      />
    </LedgerSection>
  );
}

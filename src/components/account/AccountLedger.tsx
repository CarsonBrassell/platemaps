"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  LedgerActionRow,
  LedgerRow,
  LedgerSection,
  useLedgerRows,
  type LedgerVariant,
} from "@/components/account/ledger";
import { useAccountSecurity, devicesEndedLabel } from "@/components/account/useAccountSecurity";
import { PhoneNumberRow } from "@/components/account/PhoneNumberRow";
import { useAuth } from "@/lib/auth";
import { oauthReturn, type ReauthPurpose, type SocialProvider } from "@/lib/oauthClient";
import { PROVIDER_NAME, ProviderButton } from "@/components/account/SocialButtons";

/**
 * Which row to open on arrival: the one a website confirmation was for.
 * Somebody who confirmed with Google from inside the Password row and came
 * back to a closed ledger would have to find their place again.
 */
function rowForReturn(): string | null {
  const returned = oauthReturn();
  if (returned?.kind !== "reauthed") return null;
  if (returned.purpose === "email" || returned.purpose === "password") return returned.purpose;
  return null;
}

/** Said wherever a password-less account has nothing to confirm with from here. */
const NO_CONFIRM_HERE =
  "This account has no password, and confirming with Apple or Google isn't available here. Use the latest PlateMaps app, or log out and use Forgot password to set a password.";

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
 *
 * **Sign-in methods** is a second section under this one, and it is drawn
 * only when the server offers Apple / Google here or the account already
 * signs in with one (`signIn.visible`). On an unconfigured site it does not
 * exist, and the Email and Password rows are exactly as they were: every
 * `passwordless` branch below needs `account.hasPassword === false`, which
 * only an Apple / Google sign-up can produce.
 */
export function AccountLedger({ variant = "web" }: { variant?: LedgerVariant }) {
  const { account } = useAuth();
  const { email, username, password, devices, passwordless, signIn } = useAccountSecurity(
    variant === "phone" ? "/m/account/settings" : "/account/settings"
  );
  const rows = useLedgerRows();
  /* The row a website confirmation was for, opened once the account is known
     and only for an account with no password — the only kind that can have
     made that trip. Decided here rather than as the rows' initial state for
     two reasons: on a fresh page load the account is not in hand yet, and a
     hand-typed or stale `?oauth=reauthed&for=password` must not open anything
     on an ordinary account (or on a site where none of this is configured).
     Adjusted during render, React's documented way to react to a prop
     arriving without an effect. */
  const [returnRow, setReturnRow] = useState(rowForReturn);
  if (returnRow && account) {
    setReturnRow(null);
    if (account.hasPassword === false) rows.open(returnRow);
  }
  /* The website's confirm-with-Google button, per row. Its own busy and
     error because it is not a form submit and the page usually leaves. */
  const [confirming, setConfirming] = useState<ReauthPurpose | null>(null);
  const [confirmError, setConfirmError] = useState("");

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

  const methodOpen = signIn.providers.some((provider) => rows.isOpen(`method-${provider}`));
  useEffect(() => {
    // Same again: a typed password does not outlive its row.
    if (!methodOpen) signIn.clearPassword();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [methodOpen]);

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

  /**
   * What stands where the "Current password" field would, for an account
   * that has none. Returns null when the form itself should show: either the
   * app (the confirmation is a sheet the submit button opens) or the website
   * after the trip to Google has come back for this purpose.
   */
  function confirmFirst(purpose: "email" | "password"): ReactNode {
    if (!passwordless.active) return null;
    if (passwordless.loading) {
      return <p className="text-xs text-zinc-500">One moment…</p>;
    }
    const provider = passwordless.provider;
    if (!provider) {
      return <p className="text-xs leading-snug text-zinc-500">{NO_CONFIRM_HERE}</p>;
    }
    if (!passwordless.leavesPage || passwordless.confirmedFor === purpose) return null;
    return (
      <>
        <p className="mb-3 text-xs leading-snug text-zinc-500">
          This account has no password, so confirm it&rsquo;s you with {PROVIDER_NAME[provider]}{" "}
          first. You&rsquo;ll come straight back here.
        </p>
        {confirmError && confirming === null && (
          <p role="alert" className="mb-2 text-xs text-red-700">
            {confirmError}
          </p>
        )}
        <ProviderButton
          provider={provider}
          size={variant === "phone" ? "phone" : "desktop"}
          fit={variant !== "phone"}
          disabled={confirming !== null}
          onClick={() => {
            setConfirming(purpose);
            setConfirmError("");
            void passwordless.confirm(purpose).then((message) => {
              // Only reached when the page did not leave.
              setConfirmError(message);
              setConfirming(null);
            });
          }}
        />
      </>
    );
  }

  /** The submit label for a password-less form: says a sheet is coming, when one is. */
  const confirmVerb = (purpose: ReauthPurpose, plain: string) =>
    passwordless.active && passwordless.provider && passwordless.confirmedFor !== purpose
      ? `Confirm with ${PROVIDER_NAME[passwordless.provider]} and ${plain.charAt(0).toLowerCase()}${plain.slice(1)}`
      : plain;

  const emailGate = confirmFirst("email");
  const passwordGate = confirmFirst("password");

  const connected = (provider: SocialProvider) =>
    signIn.identities?.find((identity) => identity.provider === provider) ?? null;

  return (
    <>
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

        {emailGate ?? (
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
          {/* No password field for an account that has none; the provider
              confirmation stands in for it — see `confirmFirst`. */}
          {!passwordless.active && (
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
          )}
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
            disabled={email.busy || !email.dirty || (!passwordless.active && !email.password)}
            className={button}
          >
            {email.busy ? "Sending…" : confirmVerb("email", "Send link to the new address")}
          </button>
        </form>
        )}
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
        state={passwordless.active ? "None" : "••••••••"}
        description={
          passwordless.active
            ? "This account signs in with Apple or Google and has no password. Adding one lets you log in with your email as well, and is needed before a sign-in method can be disconnected."
            : "Saving a new one signs you out everywhere else. This device stays signed in."
        }
        variant={variant}
        open={passwordOpen}
        onToggle={() => rows.toggle("password")}
      >
        {passwordGate ?? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void password.save();
          }}
        >
          {!passwordless.active && (
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
          )}
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
          {/* A password change ends sessions but leaves connected sign-ins
              alone. Someone changing it because another person knew it needs
              to hear that, with the place to act on it. */}
          {password.stillConnected && (
            <p role="status" className="mb-2 text-xs leading-snug text-zinc-500">
              {password.stillConnected}
            </p>
          )}
          <button
            type="submit"
            disabled={password.busy || (!passwordless.active && !password.current) || !password.next}
            className={button}
          >
            {password.busy
              ? "Saving…"
              : passwordless.active
                ? confirmVerb("password", "Add password")
                : "Save password"}
          </button>
        </form>
        )}
      </LedgerRow>

      {/* --- Phone number --------------------------------------------------
          Not drawn unless the server says a phone can be verified here
          (the texting service and the hashing key are both configured), or
          a number is already on file and must stay removable. */}
      {(account.phoneVerifyAvailable === true || account.phoneLast4 !== undefined) && (
        <PhoneNumberRow
          variant={variant}
          open={rows.isOpen("phone")}
          onToggle={() => rows.toggle("phone")}
        />
      )}

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

    {/* --- Sign-in methods ---------------------------------------------------
        Not drawn at all unless Apple / Google sign-in is switched on for
        where this page is running, or this account already depends on it.

        Connect needs a confirmed email and the password; Disconnect needs a
        password to exist, so nobody can remove their last way in. Both are
        enforced by the server — these rows only decline to offer what it
        would refuse. */}
    {signIn.visible && (
      <>
        {signIn.error && (
          <p role="alert" className="mb-2 text-xs leading-snug text-red-700">
            {signIn.error}
          </p>
        )}
        {signIn.note && (
          <p role="status" className="mb-2 text-xs leading-snug text-zinc-500">
            {signIn.note}
          </p>
        )}
        <LedgerSection label="Sign-in methods">
          {signIn.providers.map((provider) => {
            const name = PROVIDER_NAME[provider];
            const identity = connected(provider);
            const busy = signIn.busy !== null;
            const key = `method-${provider}`;
            const size = variant === "phone" ? "phone" : "desktop";
            const fit = variant !== "phone";

            let body: ReactNode;
            if (signIn.identities === null) {
              body = <p className="text-xs text-zinc-500">One moment…</p>;
            } else if (identity) {
              body = (
                <>
                  {identity.email && (
                    <p className="mb-3 font-mono text-[13px] tracking-[0.02em] text-zinc-800">
                      {identity.email}
                    </p>
                  )}
                  {passwordless.active ? (
                    /* The last-way-in rule, stated instead of a dead button. */
                    <p className="text-xs leading-snug text-zinc-500">
                      Add a password to disconnect. Without one, this is how you get into the
                      account.
                    </p>
                  ) : (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void signIn.disconnect(provider);
                      }}
                    >
                      <input
                        type="password"
                        aria-label="Current password"
                        placeholder="Current password"
                        autoComplete="current-password"
                        value={signIn.password}
                        onChange={(e) => signIn.setPassword(e.target.value)}
                        disabled={busy}
                        className={`${input} mb-2`}
                      />
                      <button type="submit" disabled={busy || !signIn.password} className={button}>
                        {signIn.busy === provider ? "Disconnecting…" : `Disconnect ${name}`}
                      </button>
                    </form>
                  )}
                </>
              );
            } else if (!signIn.canConnectHere(provider)) {
              body = (
                <p className="text-xs leading-snug text-zinc-500">
                  {name} sign-in can only be connected in the PlateMaps app for now.
                </p>
              );
            } else if (unverified) {
              /* The rule that stops somebody who registered under your address
                 from attaching their own Google to it: they cannot open your
                 inbox. Offered as the next step rather than as a refusal. */
              body = (
                <>
                  <p className="mb-3 text-xs leading-snug text-zinc-500">
                    Confirm your email first. Connecting a sign-in method needs an address
                    we know you can read.
                  </p>
                  <button
                    type="button"
                    onClick={() => void email.resend()}
                    disabled={email.busy}
                    className={button}
                  >
                    {email.busy ? "Sending…" : "Send me a confirmation link"}
                  </button>
                  {email.sent && (
                    <p className="mt-2 text-xs leading-snug text-zinc-500">
                      Link sent to{" "}
                      <span className="font-mono text-[12px] tracking-[0.02em] text-zinc-800">
                        {email.sent}
                      </span>
                      .
                    </p>
                  )}
                  {email.error && (
                    <p role="alert" className="mt-2 text-xs text-red-700">
                      {email.error}
                    </p>
                  )}
                </>
              );
            } else if (passwordless.active) {
              body = passwordless.provider ? (
                <>
                  <p className="mb-3 text-xs leading-snug text-zinc-500">
                    You&rsquo;ll confirm with {PROVIDER_NAME[passwordless.provider]} first, then
                    choose the {name} account to connect.
                  </p>
                  <ProviderButton
                    provider={provider}
                    size={size}
                    fit={fit}
                    disabled={busy}
                    onClick={() => void signIn.connect(provider)}
                  />
                </>
              ) : (
                <p className="text-xs leading-snug text-zinc-500">{NO_CONFIRM_HERE}</p>
              );
            } else {
              body = (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void signIn.connect(provider);
                  }}
                >
                  <input
                    type="password"
                    aria-label="Current password"
                    placeholder="Current password"
                    autoComplete="current-password"
                    value={signIn.password}
                    onChange={(e) => signIn.setPassword(e.target.value)}
                    disabled={busy}
                    className={`${input} mb-2`}
                  />
                  <ProviderButton
                    provider={provider}
                    size={size}
                    fit={fit}
                    disabled={busy || !signIn.password}
                    onClick={() => void signIn.connect(provider)}
                  />
                </form>
              );
            }

            return (
              <LedgerRow
                key={provider}
                label={name}
                state={signIn.identities === null ? undefined : identity ? "Connected" : "Not connected"}
                description={
                  identity
                    ? `You can sign in with ${name}. We keep the email address and an ID from ${name}, nothing else.`
                    : `Add ${name} as another way to sign in. Nothing is ever posted to ${name}.`
                }
                variant={variant}
                open={rows.isOpen(key)}
                onToggle={() => rows.toggle(key)}
              >
                {body}
              </LedgerRow>
            );
          })}
        </LedgerSection>
      </>
    )}
    </>
  );
}

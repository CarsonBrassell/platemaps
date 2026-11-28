"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { oauthErrorMessage } from "@/lib/oauth/errorCodes";
import {
  forgetOAuthReturn,
  loadIdentities,
  oauthReturn,
  startOAuth,
  tidyOAuthReturn,
  type LinkedIdentity,
  type OAuthReturnTo,
  type ReauthPurpose,
  type SocialProvider,
} from "@/lib/oauthClient";
import { PROVIDER_NAME, useSocialAvailability } from "@/components/account/SocialButtons";

/** Every provider a row can exist for, in the order the rows are drawn. */
const ALL_PROVIDERS: readonly SocialProvider[] = ["apple", "google"];

/** How one "confirm it's you with Apple / Google" attempt ended. */
type Confirmation =
  | { ok: true }
  /** `left`: the tab is on its way to Google and this page is finished. */
  | { ok: false; left: boolean; error: string };

/**
 * The three account-security forms, shared by the web panel and the phone one.
 *
 * Same split as `useDeleteAccount`: the two panels look nothing alike and stay
 * two components, but what must not be written twice is the part with
 * consequences — which field re-authenticates, what gets cleared afterwards,
 * and what the success sentence says. A drift between two copies of a settings
 * toggle is cosmetic; a drift between two copies of "your password changed"
 * tells somebody they're safe when they aren't.
 *
 * Each form owns its own busy and error state. They're independent — saving a
 * username while a password save is in flight is fine and shouldn't grey the
 * other one out.
 *
 * ## Accounts with no password
 *
 * An account made with Apple or Google has no password to re-authenticate
 * with (`account.hasPassword === false`). For those, the email and password
 * forms confirm with the provider instead: one confirmation, for one named
 * action, good for three minutes and spent on use — the server enforces all
 * of that, this only drives it. In the app the confirmation is a sheet and
 * the form carries straight on; on the website it is a trip to Google and
 * back, so the form is offered only after returning (`confirmedFor`).
 *
 * None of this is reachable on an unconfigured site: every account there has
 * a password, `signIn.visible` is false, and no identities are ever fetched.
 */
export function useAccountSecurity(returnTo: OAuthReturnTo = "/account/settings") {
  const {
    account,
    changeUsername,
    changeEmail,
    resendVerification,
    changePassword,
    signOutOtherDevices,
  } = useAuth();

  // --- Apple / Google ------------------------------------------------------
  const availability = useSocialAvailability();
  /* What the website trip said on the way back, if this page load is one. */
  const [returned] = useState(() => oauthReturn());
  useEffect(() => {
    tidyOAuthReturn();
    // Leaving the screen ends the return's relevance; see oauthReturn().
    return forgetOAuthReturn;
  }, []);

  /* Strictly `=== false`: an account object from before this field existed
     must read as "has a password", which is what every such account does. */
  const passwordless = account?.hasPassword === false;
  const offered = availability !== null && availability.mode !== "none";
  const offeredProviders: readonly SocialProvider[] =
    availability !== null && availability.mode !== "none" ? availability.providers : [];
  /* The website flow leaves the page; the app's does not. */
  const leavesPage = availability?.mode === "web";
  const accountId = account?.id ?? null;
  /* Only ask what is connected when there is a reason to show it. */
  const wantsIdentities = accountId !== null && (offered || passwordless);

  const [identities, setIdentities] = useState<LinkedIdentity[] | null>(null);
  useEffect(() => {
    if (!wantsIdentities) return;
    let cancelled = false;
    void loadIdentities().then((rows) => {
      if (!cancelled && rows) setIdentities(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [wantsIdentities, accountId]);

  /* The provider a password-less account confirms with: one it has connected
     and that works where this page is running. Null for an Apple-only account
     on the website, where there is nothing to confirm with yet. */
  const confirmProvider =
    identities?.find((identity) => offeredProviders.includes(identity.provider))?.provider ?? null;

  /* A confirmation the website trip just brought back. Single use on the
     server; dropped here the moment a form spends or loses it. `delete` is
     the delete panel's and is read there (useDeleteAccount). */
  const [confirmedFor, setConfirmedFor] = useState<ReauthPurpose | null>(
    returned?.kind === "reauthed" ? returned.purpose : null
  );
  function spendConfirmation() {
    setConfirmedFor(null);
    forgetOAuthReturn();
  }

  async function confirmWithProvider(purpose: ReauthPurpose): Promise<Confirmation> {
    if (!confirmProvider) {
      return { ok: false, left: false, error: "Confirming with Apple or Google isn't available here." };
    }
    const result = await startOAuth(confirmProvider, "reauth", { purpose, returnTo });
    if (result.status === "reauthed") return { ok: true };
    if (result.status === "redirecting") return { ok: false, left: true, error: "" };
    return { ok: false, left: false, error: result.status === "error" ? result.message : "" };
  }

  const [methodPassword, setMethodPassword] = useState("");
  const [methodBusy, setMethodBusy] = useState<SocialProvider | null>(null);
  const [methodError, setMethodError] = useState(
    returned?.kind === "error" ? oauthErrorMessage(returned.reason) : ""
  );
  const [methodNote, setMethodNote] = useState(
    returned?.kind === "linked" ? "Connected. We sent a notice to your email." : ""
  );

  async function reloadIdentities() {
    const rows = await loadIdentities();
    if (rows) setIdentities(rows);
  }

  /**
   * Connect a provider to this account. With a password, the password is the
   * proof and travels in the one request that starts the flow. Without one,
   * the proof is a confirmation with the provider already connected — then
   * the new provider's own sheet. That second path only exists in the app:
   * on the website the one provider on offer is, for a password-less account,
   * either already connected or not the one it could confirm with.
   */
  async function connectProvider(provider: SocialProvider) {
    setMethodBusy(provider);
    setMethodError("");
    setMethodNote("");

    if (passwordless) {
      const confirmed = await confirmWithProvider("link");
      if (!confirmed.ok) {
        if (confirmed.left) return;
        setMethodError(confirmed.error);
        setMethodBusy(null);
        return;
      }
    }

    const result = await startOAuth(provider, "link", {
      returnTo,
      password: passwordless ? undefined : methodPassword,
    });
    // Never kept past the one request it was typed for.
    setMethodPassword("");
    if (result.status === "redirecting") return;
    if (result.status === "linked") {
      await reloadIdentities();
      setMethodNote(`${PROVIDER_NAME[provider]} connected. We sent a notice to your email.`);
    } else if (result.status === "error") setMethodError(result.message);
    setMethodBusy(null);
  }

  /** Only ever offered when the account has a password; the server refuses otherwise. */
  async function disconnectProvider(provider: SocialProvider) {
    setMethodBusy(provider);
    setMethodError("");
    setMethodNote("");
    try {
      const res = await fetch("/api/account/identities", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, password: methodPassword }),
      });
      setMethodPassword("");
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: unknown } | null;
        setMethodError(typeof data?.error === "string" ? data.error : "Something went wrong.");
      } else {
        await reloadIdentities();
        setMethodNote(`${PROVIDER_NAME[provider]} disconnected.`);
      }
    } catch {
      setMethodPassword("");
      setMethodError("Couldn't reach the server. Check your connection and try again.");
    }
    setMethodBusy(null);
  }

  // --- Username ------------------------------------------------------------
  const [username, setUsername] = useState(account?.name ?? "");
  const [usernameBusy, setUsernameBusy] = useState(false);
  const [usernameError, setUsernameError] = useState("");
  const [usernameSaved, setUsernameSaved] = useState(false);

  async function saveUsername() {
    setUsernameBusy(true);
    setUsernameError("");
    setUsernameSaved(false);
    const message = await changeUsername(username.trim());
    if (message) setUsernameError(message);
    else setUsernameSaved(true);
    setUsernameBusy(false);
  }

  // --- Email ---------------------------------------------------------------
  //
  // Two fields and two ways out. `save` asks to move to a new address and needs
  // the password; `resend` re-mails the link for an address already on file and
  // does not. Both end in the same place — a sentence saying where to go look —
  // so they share `emailSent` rather than reporting separately.
  /* Starts empty, unlike the username field above it. Pre-filled with the
     current address it read as a display of the address rather than a request
     for a new one — and the row already states the current one, in the machine
     voice, directly above this input. */
  const [email, setEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [emailSent, setEmailSent] = useState("");
  const [emailNotice, setEmailNotice] = useState("");

  function disarmEmail() {
    setEmail("");
    // Same reasoning as the password form: not left in state for a re-open.
    setEmailPassword("");
    setEmailError("");
    setEmailSent("");
    setEmailNotice("");
  }

  async function saveEmail() {
    setEmailBusy(true);
    setEmailError("");
    setEmailSent("");
    const target = email.trim();
    if (passwordless) {
      /* No password to send: confirm with the provider (unless the website
         trip already did), then the same request with an empty password. */
      if (confirmedFor !== "email") {
        const confirmed = await confirmWithProvider("email");
        if (!confirmed.ok) {
          if (confirmed.left) return;
          setEmailError(confirmed.error);
          setEmailBusy(false);
          return;
        }
        setConfirmedFor("email");
      }
    }
    const { error, notice, status } = await changeEmail(target, emailPassword);
    /* Dropped only once the server has spent it. A 400 here is almost always
       the address failing its shape check, which the server runs before it
       touches the confirmation — dropping it then would send a website
       visitor back to Google over a typo. Every other answer comes after the
       confirmation was used (or says it was missing), so it goes. If a 400
       did come after it was spent, the next try is told so with a 401 and
       lands here again. */
    if (passwordless && !(error && status === 400)) spendConfirmation();
    if (error) {
      setEmailError(error);
      // The address survives a failure; the password doesn't. Retyping an
      // address because a password was mistyped is somebody else's mistake.
      setEmailPassword("");
      setEmailBusy(false);
      return;
    }
    setEmailPassword("");
    setEmailSent(target);
    setEmailNotice(notice ?? "");
    setEmailBusy(false);
  }

  async function resendEmail() {
    setEmailBusy(true);
    setEmailError("");
    setEmailSent("");
    const { error, notice } = await resendVerification();
    if (error) setEmailError(error);
    else {
      setEmailSent(account?.pendingEmail ?? account?.email ?? "");
      setEmailNotice(notice ?? "");
    }
    setEmailBusy(false);
  }

  // --- Password ------------------------------------------------------------
  const [armed, setArmed] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordDone, setPasswordDone] = useState<number | null>(null);
  /** Said after a change when Apple / Google can still get in. "" otherwise. */
  const [stillConnected, setStillConnected] = useState("");

  function disarmPassword() {
    setArmed(false);
    // Never left in state for a re-open. A form holding two passwords is the
    // kind of thing that ends up in a React DevTools screenshot.
    setCurrent("");
    setNext("");
    setPasswordError("");
  }

  async function savePassword() {
    setPasswordBusy(true);
    setPasswordError("");
    setStillConnected("");
    /* Read before the request: a successful add flips `hasPassword`. */
    const hadPassword = !passwordless;
    if (passwordless) {
      // Adding a first password: same confirm-then-send as the email form.
      if (confirmedFor !== "password") {
        const confirmed = await confirmWithProvider("password");
        if (!confirmed.ok) {
          if (confirmed.left) return;
          setPasswordError(confirmed.error);
          setPasswordBusy(false);
          return;
        }
        setConfirmedFor("password");
      }
    }
    const { error, endedElsewhere, connectedSignIns, status } = await changePassword(current, next);
    /* The server checks the new password (400) and its attempt limit (429)
       before it spends the confirmation, so on those two it is still good and
       is kept: otherwise each password the strength check turns down costs a
       website visitor another trip to Google. Anything else spent it. */
    if (passwordless && !(error && (status === 400 || status === 429))) spendConfirmation();
    if (error) {
      setPasswordError(error);
      // Only the current-password field is cleared on failure: the new one is
      // probably right and retyping it twice for someone else's typo is rude.
      setCurrent("");
      setPasswordBusy(false);
      return;
    }
    setCurrent("");
    setNext("");
    setArmed(false);
    setPasswordDone(endedElsewhere);
    /* Only when a password was being CHANGED. Someone doing that because
       another person knew the old one should know a sign-in that person
       connected still works. On the add-a-first-password path the connected
       provider is the person's own way in, and the line would be noise.
       And only where sign-in is on offer: that is when the Sign-in methods
       block it points at is drawn. */
    if (hadPassword && offered && connectedSignIns && connectedSignIns.length > 0) {
      const names = connectedSignIns.map((provider) => PROVIDER_NAME[provider]).join(" and ");
      setStillConnected(
        `${names} can still sign in to this account. If you did not connect it, disconnect it under Sign-in methods.`
      );
    }
    setPasswordBusy(false);
  }

  // --- Other devices -------------------------------------------------------
  const [devicesBusy, setDevicesBusy] = useState(false);
  const [devicesError, setDevicesError] = useState("");
  const [devicesDone, setDevicesDone] = useState<number | null>(null);

  async function endOtherSessions() {
    setDevicesBusy(true);
    setDevicesError("");
    const { error, endedElsewhere } = await signOutOtherDevices();
    if (error) setDevicesError(error);
    else setDevicesDone(endedElsewhere);
    setDevicesBusy(false);
  }

  return {
    username: {
      value: username,
      set: (v: string) => {
        setUsername(v);
        setUsernameError("");
        setUsernameSaved(false);
      },
      busy: usernameBusy,
      error: usernameError,
      saved: usernameSaved,
      // Nothing to save when it matches what's already stored, which also stops
      // the button offering an action the server would only reject.
      dirty: username.trim().length > 0 && username.trim() !== account?.name,
      save: saveUsername,
    },
    email: {
      value: email,
      set: (v: string) => {
        setEmail(v);
        setEmailError("");
        setEmailSent("");
      },
      password: emailPassword,
      setPassword: setEmailPassword,
      busy: emailBusy,
      error: emailError,
      /** The address a link just went to, or "" if none has this session. */
      sent: emailSent,
      /** Development-only note about a missing mailer. See lib/mail.ts. */
      notice: emailNotice,
      /**
       * Enabled for a real change, and also for re-typing the current address
       * while one is pending — that is how a change is called off, so the
       * button has to be live for the value the plain reading calls unchanged.
       */
      dirty:
        email.trim().length > 0 &&
        (email.trim() !== account?.email || account?.pendingEmail !== undefined),
      save: saveEmail,
      resend: resendEmail,
      disarm: disarmEmail,
    },
    password: {
      armed,
      arm: () => setArmed(true),
      disarm: disarmPassword,
      current,
      setCurrent,
      next,
      setNext,
      busy: passwordBusy,
      error: passwordError,
      /** Non-null once a change succeeded; the number is other sessions ended. */
      done: passwordDone,
      /** After a change: which connected sign-ins still work, as a sentence. "" when none. */
      stillConnected,
      save: savePassword,
    },
    /**
     * How a password-less account stands in for the password field. `active`
     * is false for every account with a password, and then nothing else here
     * is read.
     */
    passwordless: {
      active: passwordless,
      /** Which provider confirms, or null when none can from here. */
      provider: confirmProvider,
      /** Still finding out (config or identities not back yet). */
      loading: passwordless && (availability === null || identities === null),
      /** True on the website: confirming navigates away, so it must come before the form. */
      leavesPage,
      confirmedFor,
      /** The website's confirm-with-Google button. Navigates; resolves only on failure. */
      confirm: async (purpose: ReauthPurpose) => {
        const confirmed = await confirmWithProvider(purpose);
        if (confirmed.ok) setConfirmedFor(purpose);
        return confirmed.ok || confirmed.left ? "" : confirmed.error;
      },
    },
    signIn: {
      /**
       * Whether the "Sign-in methods" block is drawn at all. False unless the
       * server offers a provider here or this account already depends on one
       * — so never on an unconfigured site.
       */
      visible: accountId !== null && (offered || passwordless),
      providers: ALL_PROVIDERS,
      /** null while loading. */
      identities,
      /** Whether this provider can be connected from where this page is running. */
      canConnectHere: (provider: SocialProvider) => offeredProviders.includes(provider),
      password: methodPassword,
      setPassword: setMethodPassword,
      /** The provider whose request is out, if any. */
      busy: methodBusy,
      error: methodError,
      note: methodNote,
      /** Closing a row drops the typed password and nothing else — the
          result line above the block has to survive the row closing. */
      clearPassword: () => setMethodPassword(""),
      connect: connectProvider,
      disconnect: disconnectProvider,
    },
    devices: {
      busy: devicesBusy,
      error: devicesError,
      done: devicesDone,
      end: endOtherSessions,
    },
  };
}

/** What "3 other devices" should read as, including the boring zero case. */
export function devicesEndedLabel(count: number): string {
  if (count === 0) return "You weren't signed in anywhere else.";
  if (count === 1) return "Signed out of 1 other device.";
  return `Signed out of ${count} other devices.`;
}

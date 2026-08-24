"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";

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
 */
export function useAccountSecurity() {
  const {
    account,
    changeUsername,
    changeEmail,
    resendVerification,
    changePassword,
    signOutOtherDevices,
  } = useAuth();

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
    const { error, notice } = await changeEmail(target, emailPassword);
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
    const { error, endedElsewhere } = await changePassword(current, next);
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
      save: savePassword,
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

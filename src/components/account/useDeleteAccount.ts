"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import {
  forgetOAuthReturn,
  loadIdentities,
  oauthReturn,
  startOAuth,
  tidyOAuthReturn,
  type LinkedIdentity,
  type OAuthReturnTo,
} from "@/lib/oauthClient";
import { useSocialAvailability } from "@/components/account/SocialButtons";

/**
 * The account-deletion state machine, shared by the web panel and the phone
 * one.
 *
 * The two panels look nothing alike — different hit areas, different muted
 * colour on their different grounds, one sits in a max-w-5xl column and the
 * other is the full width of a handset — which is why they stay two
 * components, the same trade `ProfileSettingsPanel` makes twice in this repo.
 * What does **not** get written twice is this: the arming step, the
 * re-authentication, and the redirect. A drift between two copies of a
 * settings toggle is a cosmetic bug; a drift between two copies of the
 * irreversible thing is somebody's account.
 *
 * Three states, and the middle one is the whole point:
 *
 * - `armed === false` — a plain button. Nothing is destructive yet.
 * - `armed === true` — the consequences in words, and a password field.
 * - `busy` — the request is out. Both buttons are disabled, because a
 *   double-submit here races two deletes against one row.
 *
 * ## Accounts with no password
 *
 * An Apple / Google account has no password to type, and App Store guideline
 * 5.1.1(v) still requires that it can be deleted from inside the app. For
 * those (`passwordless`), the re-authentication is a confirmation with the
 * provider, valid for this one action, three minutes, once — enforced by the
 * server. In the app, `confirm()` opens the sheet and then deletes. On the
 * website the confirmation is a trip to Google, so the panel comes back
 * already armed (`confirmed`) and the red button sends the delete.
 *
 * `passwordless` is false for every account with a password, and on an
 * unconfigured site that is every account: the panels then never read
 * anything below it.
 */
export function useDeleteAccount(redirectTo: string, returnTo: OAuthReturnTo = "/account/settings") {
  const { account, deleteAccount } = useAuth();
  const router = useRouter();

  // Strictly `=== false`; see the same line in useAccountSecurity.
  const passwordless = account?.hasPassword === false;
  const availability = useSocialAvailability();
  const [identities, setIdentities] = useState<LinkedIdentity[] | null>(null);
  useEffect(() => {
    if (!passwordless) return;
    let cancelled = false;
    void loadIdentities().then((rows) => {
      if (!cancelled && rows) setIdentities(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [passwordless]);
  useEffect(() => {
    tidyOAuthReturn();
    // Leaving the screen ends the return's relevance; see oauthReturn().
    return forgetOAuthReturn;
  }, []);

  const offered = availability !== null && availability.mode !== "none" ? availability.providers : [];
  /* A provider this account has connected that also works where this page is
     running. Null for an Apple-only account on the website. */
  const provider = identities?.find((identity) => offered.includes(identity.provider))?.provider ?? null;

  /* True when the website trip to Google has just come back for exactly this
     action. Only ever opens the panel on its last step; the delete itself
     still takes a press, and the server still checks the confirmation. */
  const [confirmed, setConfirmed] = useState(() => {
    /* Only for an account with no password. For everyone else `?oauth=…` in
       the address bar must do nothing at all — otherwise a crafted link
       could open this panel on its last step, past the "are you sure". */
    if (!passwordless) return false;
    const returned = oauthReturn();
    return returned?.kind === "reauthed" && returned.purpose === "delete";
  });

  const [armed, setArmed] = useState(confirmed);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function disarm() {
    setArmed(false);
    // Not left in state for a re-open: an unmounted-looking form holding a
    // password is the kind of thing that ends up in a React DevTools
    // screenshot.
    setPassword("");
    setError("");
  }

  async function confirm() {
    setBusy(true);
    setError("");

    let message: string | null;
    if (passwordless) {
      if (!confirmed) {
        if (!provider) {
          setError("Confirming with Apple or Google isn't available here.");
          setBusy(false);
          return;
        }
        const result = await startOAuth(provider, "reauth", { purpose: "delete", returnTo });
        // Off to Google. `busy` stays set: nothing on a page that is leaving
        // should be pressable, least of all this.
        if (result.status === "redirecting") return;
        if (result.status !== "reauthed") {
          // A closed sheet is not an error; anything else says why.
          if (result.status === "error") setError(result.message);
          setBusy(false);
          return;
        }
      }
      message = await deleteAccount();
      // Spent or expired either way — the server's stamp works once.
      setConfirmed(false);
      forgetOAuthReturn();
    } else {
      message = await deleteAccount(password);
    }

    if (message) {
      setError(message);
      setPassword("");
      setBusy(false);
      return;
    }

    // `replace`, not `push` — the account page must not be sitting one Back
    // gesture away, rendering a profile for a user that no longer exists.
    // `busy` is never cleared on success: the component is about to go, and
    // re-enabling the button first would flash a live "Delete account" at
    // someone who no longer has one.
    router.replace(redirectTo);
    router.refresh();
  }

  return {
    armed,
    arm: () => setArmed(true),
    disarm,
    password,
    setPassword,
    error,
    busy,
    confirm,
    /** The account has no password; the panel confirms with a provider instead. */
    passwordless,
    /** Which provider confirms, or null when none can from here (or not known yet). */
    provider,
    /** Still finding out which provider, if any. */
    providerLoading: passwordless && (availability === null || identities === null),
    /** The website confirmation is back; the next press deletes. */
    confirmed,
    /** True on the website, where confirming leaves the page. */
    leavesPage: availability?.mode === "web",
  };
}

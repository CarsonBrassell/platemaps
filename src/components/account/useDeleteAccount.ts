"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

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
 */
export function useDeleteAccount(redirectTo: string) {
  const { deleteAccount } = useAuth();
  const router = useRouter();

  const [armed, setArmed] = useState(false);
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

    const message = await deleteAccount(password);

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

  return { armed, arm: () => setArmed(true), disarm, password, setPassword, error, busy, confirm };
}

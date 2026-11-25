"use client";

import { useState } from "react";
import { ConfirmEmailPrompt } from "@/components/account/ConfirmEmailPrompt";
import { useAuth } from "@/lib/auth";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";

/**
 * The one-time question: may people find you from their contacts?
 *
 * A plain yes or no, asked once per account. It is drawn on the Friends
 * screen and again under the first contact check's results, and both read the
 * same server field (`contactsChoiceAnswered`), so answering in one place, on
 * any device, removes it everywhere. Nothing about it lives in localStorage:
 * the app and Safari do not share storage, and a "no" has to follow the
 * account.
 *
 * Consent rules this component keeps, and that must survive any redesign:
 *
 * - There is no pre-selected answer and no switch shown already on.
 * - `updateSettings({ discoverableByContacts })` is called only from a tap on
 *   one of the two buttons. Never on mount, never from an effect, never as
 *   part of another action.
 * - "No thanks" is recorded as an answer and final here; Settings is where a
 *   change of mind goes. Asking again after a no is nagging.
 * - The wording says who can find you ("anyone who has your email address in
 *   their phone contacts", not "friends") and what they learn (which username
 *   is yours), because that link is the thing being consented to.
 *
 * Renders nothing unless the server says the feature is on for this
 * deployment (`contactsAvailable`).
 */
export function FindableQuestion({
  title,
  className = "",
}: {
  title: string;
  /** Outer spacing, which belongs to whoever places the card. */
  className?: string;
}) {
  const { account, updateSettings } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  /* What was answered on THIS card, so "On." or the confirm-your-email step
     can replace the question. The server flag alone would unmount the card
     the instant the answer is saved. */
  const [answeredHere, setAnsweredHere] = useState<"on" | "off" | null>(null);

  if (!account || account.contactsAvailable !== true) return null;
  if (answeredHere === "off") return null;
  if (answeredHere === null && account.contactsChoiceAnswered) return null;

  async function answer(on: boolean) {
    setSaving(true);
    setError("");
    const failed = await updateSettings({ discoverableByContacts: on });
    setSaving(false);
    if (failed) {
      setError(failed);
      return;
    }
    setAnsweredHere(on ? "on" : "off");
  }

  // "or phone number" only where a phone can actually be added and matched.
  const what = account.phoneVerifyAvailable === true ? "email address or phone number" : "email address";

  if (answeredHere === "on") {
    return (
      <div className={`rounded-2xl bg-white px-4 py-4 ${className}`}>
        {account.emailVerified ? (
          <p role="status" className="text-sm text-zinc-500">
            On. You can change this in Settings.
          </p>
        ) : (
          <>
            <p role="status" className="mb-3 text-sm leading-snug text-zinc-500">
              Almost there. This only works once your email is confirmed.
            </p>
            <ConfirmEmailPrompt compact />
          </>
        )}
      </div>
    );
  }

  return (
    <section className={`rounded-2xl bg-white px-4 py-4 ${className}`} aria-label={title}>
      <h3 className="font-display text-[17px] font-semibold leading-snug text-zinc-900">{title}</h3>
      <p className="mt-1.5 text-sm leading-snug text-zinc-500">
        If you turn this on, anyone who has your {what} in their phone contacts will be able to
        see your PlateMaps username and profile and send you a friend request. Your{" "}
        {account.phoneVerifyAvailable === true ? "address and number are" : "address is"} never
        shown to them.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={() => void answer(true)}
        disabled={saving}
        className={`mt-3 min-h-11 w-full rounded-full bg-pm-orange px-5 text-sm font-medium text-[#F7F4EC] transition-transform active:scale-[0.98] disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100 ${FOCUS}`}
      >
        Turn on
      </button>
      <button
        type="button"
        onClick={() => void answer(false)}
        disabled={saving}
        className={`mt-1 flex min-h-11 w-full items-center justify-center rounded-full text-sm text-zinc-500 disabled:opacity-50 ${FOCUS}`}
      >
        No thanks
      </button>
    </section>
  );
}
